import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

/**
 * Native Google OAuth for Flexzora — replaces One Connect for Google apps.
 *
 * Actions (POST {action} or GET ?action=…):
 *  - start        (JWT)  → Google authorize URL; stores a single-use state row
 *  - callback     (GET, no JWT — state row is the credential) → exchanges the
 *                         code, stores tokens server-side, redirects back
 *  - status       (JWT)  → {connected, google_email}
 *  - disconnect   (JWT)  → revokes the grant, deletes tokens + event links
 *  - sync         (JWT)  → pushes all future calendar_events to Google Cal
 *  - pull         (JWT)  → imports Google events into calendar_events
 *  - sync-event   (X-Push-Secret) → DB trigger ping: upsert/delete one event
 *
 * Tokens live only in google_connections (RLS: service-role only). The
 * browser never sees them. Google OAuth clients are server-side secrets:
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const pushSecret = Deno.env.get("PUSH_INTERNAL_SECRET") || "";
const appUrl = Deno.env.get("APP_URL") || "https://flexzora.pro";

const admin = createClient(supabaseUrl, serviceKey);

// calendar.events covers read+write of events — everything the push sync
// needs. gmail.readonly powers gig-offer ingestion (subjects/snippets are
// filtered for call offers; bodies of matches go through the LLM parser).
// openid/email/profile identify which Google account connected.
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
// Reuses the llm-proxy secrets — same Gemini OpenAI-compatible endpoint.
const LLM_BASE = Deno.env.get("LLM_BASE_URL") || "";
const LLM_KEY = Deno.env.get("LLM_API_KEY") || "";
const LLM_MODEL = Deno.env.get("LLM_MODEL") || "";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
const CAL_API = "https://www.googleapis.com/calendar/v3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const redirect = (params: Record<string, string>) => {
  const url = new URL("/integrations", appUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
};

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

/** Resolve the caller's Supabase auth user → Flexzora profile id. */
async function callerProfile(req: Request) {
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const userClient = createClient(supabaseUrl, anonKey);
  const { data: { user }, error } = await userClient.auth.getUser(jwt);
  if (error || !user) return null;
  const { data: profile } = await admin
    .from("profiles").select("id").eq("user_id", user.id).single();
  return profile?.id ?? null;
}

interface GoogleConn {
  user_id: string;
  google_email: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
  calendar_id: string;
}

async function loadConnection(profileId: string): Promise<GoogleConn | null> {
  const { data } = await admin
    .from("google_connections").select("*").eq("user_id", profileId).maybeSingle();
  return data as GoogleConn | null;
}

/** Returns a valid access token, refreshing via refresh_token when expired. */
async function validToken(conn: GoogleConn): Promise<string | null> {
  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  if (expiry > Date.now() + 60_000) return conn.access_token;
  if (!conn.refresh_token) return null;
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) return null;
  await admin.from("google_connections").update({
    access_token: tok.access_token,
    token_expiry: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", conn.user_id);
  return tok.access_token;
}

/** Push one calendar_events row to Google Calendar (insert or patch). */
async function pushEvent(conn: GoogleConn, eventId: string) {
  const token = await validToken(conn);
  if (!token) return { ok: false, reason: "token" };

  const { data: ev } = await admin
    .from("calendar_events").select("*").eq("id", eventId).maybeSingle();
  if (!ev) return { ok: false, reason: "missing" };

  // Echo guard: events imported FROM Google (metadata.source='google')
  // must never be pushed back — that would duplicate them remotely and
  // the pull/push pair would fight forever.
  if ((ev.metadata as Record<string, unknown> | null)?.source === "google") {
    return { ok: false, reason: "echo" };
  }

  const { data: link } = await admin
    .from("google_event_links").select("google_event_id")
    .eq("user_id", conn.user_id).eq("flexzora_event_id", eventId).maybeSingle();

  const meta = (ev.metadata ?? {}) as Record<string, unknown>;
  const body = {
    summary: ev.title,
    description: ev.description ?? undefined,
    start: ev.all_day
      ? { date: ev.start_time.slice(0, 10) }
      : { dateTime: ev.start_time, timeZone: "UTC" },
    end: ev.end_time
      ? (ev.all_day
        ? { date: new Date(new Date(ev.end_time).getTime() + 86400000).toISOString().slice(0, 10) }
        : { dateTime: ev.end_time, timeZone: "UTC" })
      : undefined,
    extendedProperties: { private: { flexzora_event_id: ev.id, event_type: ev.event_type, gig_id: String(meta.gig_id ?? "") } },
  };

  const base = `${CAL_API}/calendars/${encodeURIComponent(conn.calendar_id)}/events`;
  const res = link?.google_event_id
    ? await fetch(`${base}/${encodeURIComponent(link.google_event_id)}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    : await fetch(base, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

  if (res.status === 404 && link?.google_event_id) {
    // Remote event was deleted in Google — recreate and re-link.
    const retry = await fetch(base, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!retry.ok) return { ok: false, reason: `google ${retry.status}` };
    const gj = await retry.json();
    await admin.from("google_event_links").upsert({
      user_id: conn.user_id, flexzora_event_id: ev.id,
      google_event_id: gj.id, google_calendar_id: conn.calendar_id,
    }, { onConflict: "user_id,flexzora_event_id" });
    return { ok: true };
  }
  if (!res.ok) return { ok: false, reason: `google ${res.status}` };

  const gj = await res.json();
  await admin.from("google_event_links").upsert({
    user_id: conn.user_id, flexzora_event_id: ev.id,
    google_event_id: gj.id, google_calendar_id: conn.calendar_id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,flexzora_event_id" });
  return { ok: true };
}

async function deleteRemoteEvent(conn: GoogleConn, eventId: string) {
  const token = await validToken(conn);
  if (!token) return;
  const { data: link } = await admin
    .from("google_event_links").select("google_event_id")
    .eq("user_id", conn.user_id).eq("flexzora_event_id", eventId).maybeSingle();
  if (!link) return;
  await fetch(
    `${CAL_API}/calendars/${encodeURIComponent(conn.calendar_id)}/events/${encodeURIComponent(link.google_event_id)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  await admin.from("google_event_links").delete()
    .eq("user_id", conn.user_id).eq("flexzora_event_id", eventId);
}

/** Push every future calendar_events row for a user (initial + manual sync). */
async function syncAll(profileId: string) {
  const conn = await loadConnection(profileId);
  if (!conn) return { synced: 0, skipped: true };
  const { data: events } = await admin
    .from("calendar_events").select("id")
    .eq("user_id", profileId).gte("start_time", new Date().toISOString())
    .order("start_time").limit(500);
  let synced = 0;
  for (const e of events ?? []) {
    const r = await pushEvent(conn, e.id);
    if (r.ok) synced++;
  }
  return { synced, skipped: false };
}

/** Extract structured offer fields from an email via the configured LLM.
 *  Falls back to empty object on any failure — a raw offer is still useful. */
async function parseOfferWithLLM(subject: string, snippet: string, from: string) {
  if (!LLM_BASE || !LLM_KEY || !LLM_MODEL) return {};
  try {
    const res = await fetch(`${LLM_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: "You extract gig/shift offer details from production crew emails. Reply with ONLY a JSON object, no prose: {\"is_offer\":bool,\"role\":string|null,\"company\":string|null,\"call_date\":\"ISO8601\"|null,\"end_date\":\"ISO8601\"|null,\"location\":string|null,\"rate\":number|null,\"notes\":string|null}. Dates must be absolute ISO; if only relative dates appear, resolve them against today. is_offer=false for marketing/newsletters.",
          },
          { role: "user", content: `From: ${from}\nSubject: ${subject}\n\n${snippet}` },
        ],
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    return {};
  }
}

/** Evaluate a worker's enabled offer_rules against freshly ingested offers.
 *  Matching rules auto-accept / decline / counter; require_no_conflict rules
 *  flag overlapping calls as 'conflict' for manual review instead. */
async function applyOfferRules(profileId: string, offerIds: string[]) {
  if (!offerIds.length) return { evaluated: 0, acted: 0 };
  const { data: rules } = await admin
    .from("offer_rules").select("*").eq("worker_id", profileId).eq("enabled", true);
  if (!rules?.length) return { evaluated: offerIds.length, acted: 0 };

  const { data: offers } = await admin
    .from("gig_offers").select("*").in("id", offerIds).eq("status", "new");
  let acted = 0;

  for (const offer of offers ?? []) {
    const haystack = `${offer.sender ?? ""} ${offer.subject ?? ""} ${offer.body_excerpt ?? ""}`.toLowerCase();
    const rule = (rules as Record<string, unknown>[]).find((r) => {
      const senderMatch = !r.match_sender ||
        haystack.includes(String(r.match_sender).toLowerCase());
      const kw = (r.match_keywords as string[] | null) ?? [];
      const kwMatch = kw.length === 0 || kw.some((k) => haystack.includes(k.toLowerCase()));
      return senderMatch && kwMatch;
    });
    if (!rule) continue;

    const parsed = (offer.parsed ?? {}) as Record<string, unknown>;
    let status = String(rule.action);

    // Conflict gate: does the parsed call window overlap a real calendar event?
    if (rule.require_no_conflict && parsed.call_date) {
      const start = new Date(String(parsed.call_date));
      const end = parsed.end_date ? new Date(String(parsed.end_date)) : new Date(start.getTime() + 8 * 3600_000);
      const { data: overlap } = await admin
        .from("calendar_events").select("id")
        .eq("user_id", profileId)
        .lt("start_time", end.toISOString())
        .or(`end_time.gt.${start.toISOString()},end_time.is.null`)
        .limit(1);
      if (overlap?.length) {
        await admin.from("gig_offers").update({
          status: "conflict", updated_at: new Date().toISOString(),
        }).eq("id", offer.id);
        continue;
      }
    }

    const patch: Record<string, unknown> = {
      status, updated_at: new Date().toISOString(),
    };
    if (status === "countered" && rule.counter_rate) {
      patch.parsed = { ...parsed, counter_rate: rule.counter_rate };
    }
    await admin.from("gig_offers").update(patch).eq("id", offer.id);

    // Auto-accepted calls land on the calendar (which then pushes to Google).
    if (status === "accepted" && parsed.call_date) {
      await admin.from("calendar_events").insert({
        user_id: profileId,
        title: `🎪 ${parsed.role ?? "Gig"} — ${parsed.company ?? offer.sender ?? "offer"}`,
        description: `Auto-accepted by rule "${rule.name}".\n${parsed.location ?? ""}`,
        event_type: "gig",
        start_time: String(parsed.call_date),
        end_time: parsed.end_date ? String(parsed.end_date) : undefined,
        all_day: false,
        color: "#10B981",
        metadata: { source: "offer", offer_id: offer.id, auto_rule: rule.name },
      });
    }
    acted++;
  }
  return { evaluated: offers?.length ?? 0, acted };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = url.searchParams.get("action") || body?.action || "start";

    // ── OAuth callback: no JWT, the single-use state row is the credential ──
    if (req.method === "GET" && action === "callback") {
      const code = url.searchParams.get("code") || "";
      const state = url.searchParams.get("state") || "";
      const fail = (r: string) => redirect({ google_connect: r });
      if (!code || !state) return fail("error");

      const { data: flow } = await admin
        .from("google_connect_flows").select("*").eq("state", state).maybeSingle();
      await admin.from("google_connect_flows").delete().eq("state", state);
      if (!flow) return fail("expired");

      const res = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${supabaseUrl}/functions/v1/google-connect?action=callback`,
          grant_type: "authorization_code",
        }),
      });
      const tok = await res.json();
      if (!res.ok || !tok.access_token) return fail("error");

      // Identify which Google account connected (best-effort).
      let googleEmail: string | null = null;
      try {
        const ui = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${tok.access_token}` },
        }).then((r) => r.json());
        googleEmail = ui?.email ?? null;
      } catch { /* identity is cosmetic — don't fail the connect over it */ }

      await admin.from("google_connections").upsert({
        user_id: flow.user_id,
        google_email: googleEmail,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token ?? null,
        token_expiry: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
        scopes: tok.scope ?? SCOPES,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Initial backfill so existing events appear in Google immediately.
      await syncAll(flow.user_id);

      const ret = typeof flow.return_to === "string" && flow.return_to.startsWith("/") && !flow.return_to.startsWith("//")
        ? flow.return_to : "/integrations";
      const dest = new URL(ret, appUrl);
      dest.searchParams.set("google_connect", "connected");
      return new Response(null, { status: 302, headers: { Location: dest.toString() } });
    }

    // ── DB trigger ping: keep the remote copy in step with calendar_events ──
    if (action === "sync-event") {
      const secret = req.headers.get("X-Push-Secret") || "";
      if (!pushSecret || secret !== pushSecret) return json({ error: "Forbidden" }, 403);
      const { user_id, event_id, op } = body ?? {};
      if (!user_id || !event_id) return json({ error: "bad request" }, 400);
      const conn = await loadConnection(user_id);
      if (!conn) return json({ ok: true, skipped: "no connection" });
      if (op === "delete") await deleteRemoteEvent(conn, event_id);
      else await pushEvent(conn, event_id);
      return json({ ok: true });
    }

    // Everything below requires a signed-in caller.
    const profileId = await callerProfile(req);
    if (!profileId) return json({ error: "Unauthorized" }, 401);

    if (action === "start") {
      if (!clientId || !clientSecret) return json({ error: "Google connect is not configured" }, 500);
      const returnTo = typeof body?.return_to === "string" && body.return_to.startsWith("/") && !body.return_to.startsWith("//")
        ? body.return_to : "/integrations";
      const state = random(24);
      const { error } = await admin.from("google_connect_flows").insert({
        state, user_id: profileId, return_to: returnTo,
      });
      if (error) return json({ error: "Could not start connect flow" }, 500);

      const auth = new URL(GOOGLE_AUTH);
      auth.searchParams.set("client_id", clientId);
      auth.searchParams.set("redirect_uri", `${supabaseUrl}/functions/v1/google-connect?action=callback`);
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("scope", SCOPES);
      auth.searchParams.set("state", state);
      auth.searchParams.set("access_type", "offline");
      auth.searchParams.set("prompt", "consent"); // forces a refresh_token every connect
      return json({ url: auth.toString() });
    }

    if (action === "status") {
      const conn = await loadConnection(profileId);
      return json({ connected: !!conn, google_email: conn?.google_email ?? null });
    }

    if (action === "disconnect") {
      const conn = await loadConnection(profileId);
      if (conn?.access_token) {
        await fetch(`${GOOGLE_REVOKE}?token=${encodeURIComponent(conn.access_token)}`, { method: "POST" });
      }
      await admin.from("google_event_links").delete().eq("user_id", profileId);
      await admin.from("google_connections").delete().eq("user_id", profileId);
      return json({ ok: true });
    }

    if (action === "sync") {
      return json(await syncAll(profileId));
    }

    // ── Pull: import Google Calendar events into calendar_events ──
    // Events Flexzora pushed carry extendedProperties.private.flexzora_event_id
    // — skip those or they'd echo back as duplicates. Imported rows get
    // metadata.google_event_id so re-pulls update instead of duplicating.
    if (action === "pull") {
      const conn = await loadConnection(profileId);
      if (!conn) return json({ error: "Not connected" }, 400);
      const token = await validToken(conn);
      if (!token) return json({ error: "Google token expired — reconnect" }, 400);

      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 90 * 86400000).toISOString();
      const listRes = await fetch(
        `${CAL_API}/calendars/${encodeURIComponent(conn.calendar_id)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&maxResults=250`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!listRes.ok) return json({ error: `Google ${listRes.status}` }, 502);
      const list = await listRes.json();

      // Existing imports keyed by google event id → update path.
      const { data: existing } = await admin
        .from("calendar_events").select("id, metadata")
        .eq("user_id", profileId)
        .filter("metadata->>source", "eq", "google");
      const byGoogleId = new Map<string, string>();
      for (const row of existing ?? []) {
        const gid = (row.metadata as Record<string, unknown>)?.google_event_id;
        if (typeof gid === "string") byGoogleId.set(gid, row.id);
      }

      let imported = 0, updated = 0, skipped = 0;
      for (const ge of list.items ?? []) {
        if (ge.extendedProperties?.private?.flexzora_event_id) { skipped++; continue; }
        if (ge.status === "cancelled") { skipped++; continue; }

        const start = ge.start?.dateTime ?? (ge.start?.date ? `${ge.start.date}T00:00:00Z` : null);
        if (!start) { skipped++; continue; }
        const end = ge.end?.dateTime ?? (ge.end?.date ? `${ge.end.date}T00:00:00Z` : null);
        const allDay = !!ge.start?.date && !ge.start?.dateTime;
        const title = ge.summary || "(no title)";
        const description = ge.description ?? "";
        const row = {
          user_id: profileId,
          title: `📅 ${title}`,
          description,
          event_type: "note" as const,
          start_time: start,
          end_time: end,
          all_day: allDay,
          color: "#8B5CF6",
          metadata: {
            source: "google",
            google_event_id: ge.id,
            html_link: ge.htmlLink ?? null,
          },
        };

        const existingId = byGoogleId.get(ge.id);
        if (existingId) {
          const { error } = await admin.from("calendar_events")
            .update({ title: row.title, description: row.description, start_time: row.start_time, end_time: row.end_time, all_day: row.all_day })
            .eq("id", existingId);
          if (!error) updated++;
        } else {
          const { error } = await admin.from("calendar_events").insert(row);
          if (!error) imported++;
        }
      }
      return json({ imported, updated, skipped });
    }

    // ── Offers: list the worker's ingested gig offers ──
    if (action === "offers") {
      const { data } = await admin
        .from("gig_offers").select("*")
        .eq("worker_id", profileId).order("created_at", { ascending: false })
        .limit(100);
      return json({ offers: data ?? [] });
    }

    // ── Offer action: worker accepts / declines / counters ──
    if (action === "offer-action") {
      const { offer_id, decision, counter_rate } = body ?? {};
      if (!offer_id || !["accepted", "declined", "countered"].includes(decision)) {
        return json({ error: "bad request" }, 400);
      }
      const { data: offer } = await admin
        .from("gig_offers").select("*")
        .eq("id", offer_id).eq("worker_id", profileId).maybeSingle();
      if (!offer) return json({ error: "not found" }, 404);

      const parsed = (offer.parsed ?? {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = {
        status: decision, updated_at: new Date().toISOString(),
      };
      if (decision === "countered" && counter_rate) patch.parsed = { ...parsed, counter_rate };

      // Accepting logs the call to the worker's calendar immediately —
      // same table the Google push trigger watches, so it lands on their
      // Google Calendar too when connected.
      if (decision === "accepted" && parsed.call_date) {
        const start = String(parsed.call_date);
        const end = parsed.end_date ? String(parsed.end_date) : start;
        await admin.from("calendar_events").insert({
          user_id: profileId,
          title: `🎪 ${parsed.role ?? "Gig"} — ${parsed.company ?? offer.sender ?? "offer"}`,
          description: `Auto-logged from offer: ${offer.subject ?? ""}\n${parsed.location ?? ""}`,
          event_type: "gig",
          start_time: start,
          end_time: end === start ? undefined : end,
          all_day: false,
          color: "#10B981",
          metadata: { source: "offer", offer_id: offer.id, gig_id: offer.gig_id ?? null },
        });
      }
      await admin.from("gig_offers").update(patch).eq("id", offer_id);
      return json({ ok: true });
    }

    // ── Gmail sync: pull recent inbox messages, filter for offers, parse,
    //    store, then run the worker's auto-rules over the new rows ──
    if (action === "gmail-sync") {
      const conn = await loadConnection(profileId);
      if (!conn) return json({ error: "Not connected" }, 400);
      const granted = (conn as unknown as { scopes?: string }).scopes ?? "";
      if (!granted.includes("gmail.readonly")) {
        return json({ error: "reconnect", message: "Reconnect Google to grant Gmail access" }, 400);
      }
      const token = await validToken(conn);
      if (!token) return json({ error: "Google token expired — reconnect" }, 400);

      const listRes = await fetch(
        `${GMAIL_API}/messages?q=${encodeURIComponent("is:inbox newer_than:14d")}&maxResults=50`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!listRes.ok) return json({ error: `Gmail ${listRes.status}` }, 502);
      const list = await listRes.json();
      const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);

      // Keyword gate — cheap prefilter before spending LLM tokens. Production
      // crew offers almost always contain one of these in subject/snippet.
      const OFFER_RE = /\b(gig|call\s?time|load[- ]?in|strike|crew|shift|festival|concert|stage|backstage|tech(?:nician)?|rigging|a2|audio|lighting|video|forklift|security|talent)\b/i;

      const candidates: { id: string; from: string; subject: string; snippet: string; date: string }[] = [];
      for (const id of ids.slice(0, 50)) {
        const mres = await fetch(
          `${GMAIL_API}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!mres.ok) continue;
        const msg = await mres.json();
        const headers = (msg.payload?.headers ?? []) as { name: string; value: string }[];
        const h = (n: string) => headers.find((x) => x.name.toLowerCase() === n)?.value ?? "";
        const from = h("from"), subject = h("subject"), snippet = msg.snippet ?? "";
        if (OFFER_RE.test(subject) || OFFER_RE.test(snippet) || OFFER_RE.test(from)) {
          candidates.push({ id, from, subject, snippet, date: h("date") });
        }
        if (candidates.length >= 10) break; // cap LLM spend per sync
      }

      let parsed_count = 0, inserted = 0;
      const newOfferIds: string[] = [];
      for (const c of candidates) {
        const parsed = await parseOfferWithLLM(c.subject, c.snippet, c.from);
        parsed_count++;
        const { data: ins, error } = await admin.from("gig_offers").upsert({
          worker_id: profileId,
          source: "gmail",
          external_id: c.id,
          sender: c.from,
          subject: c.subject,
          body_excerpt: c.snippet.slice(0, 2000),
          parsed,
        }, { onConflict: "worker_id,source,external_id", ignoreDuplicates: true }).select("id");
        if (!error && ins?.length) { inserted++; newOfferIds.push(ins[0].id); }
      }

      // Auto-rules: evaluate only freshly inserted offers.
      const auto = await applyOfferRules(profileId, newOfferIds);
      return json({ scanned: ids.length, candidates: candidates.length, parsed: parsed_count, inserted, auto });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "internal error" }, 500);
  }
});
