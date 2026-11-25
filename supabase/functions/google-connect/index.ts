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
// needs. openid/email/profile identify which Google account connected.
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

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

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "internal error" }, 500);
  }
});
