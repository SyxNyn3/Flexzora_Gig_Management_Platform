import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

/**
 * One Connect (WithOne) OAuth flow for Flexzora users.
 *
 * Two modes on one function:
 *  - POST {action:"start"}  — verifies the caller's Supabase JWT, creates a
 *    single-use PKCE/state row, and returns the One authorize URL. The SPA
 *    then top-level-navigates to it (no JWT ever appears in a URL).
 *  - GET  ?action=callback&code&state — the redirect One sends the browser
 *    to. No JWT: the state row is the credential. Exchanges the code,
 *    stores the per-user connect reference, and redirects back to the app.
 *
 * Env: ONE_CLIENT_ID / ONE_CLIENT_SECRET (server-only, from `one connect
 * create`). The connect key (ONE_CONNECT_KEY, sk_live_…) is needed later
 * for server-side actions and is intentionally not used here.
 */

const ONE_API = "https://api.withone.ai";
const SCOPES = [
  "user:profile:read",
  "user:connections:read",
  "user:connections:write",
  "org:connections:read",
  "org:connections:write",
  "project:connections:read",
  "project:connections:write",
].join(" ");

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const clientId = Deno.env.get("ONE_CLIENT_ID") || "";
const clientSecret = Deno.env.get("ONE_CLIENT_SECRET") || "";
const appUrl = Deno.env.get("APP_URL") || "https://flexzora.pro";

const admin = createClient(supabaseUrl, serviceKey);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

function redirect(path: string, params: Record<string, string>) {
  const url = new URL(path, appUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "start";

    // ── Start: authenticated SPA calls this, gets back the authorize URL ──
    if (req.method === "POST" && action === "start") {
      if (!clientId || !clientSecret) {
        return json({ error: "One Connect is not configured" }, 500);
      }
      const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
      const userClient = createClient(supabaseUrl, anonKey);
      const { data: { user }, error } = await userClient.auth.getUser(jwt);
      if (error || !user) return json({ error: "Unauthorized" }, 401);

      // Connect grants belong to the application profile, matching every
      // other worker-owned table in the schema.
      const { data: profile } = await admin
        .from("profiles").select("id").eq("user_id", user.id).single();
      const profileId = profile?.id ?? user.id;

      const state = random(24);
      const verifier = random(48);
      const { error: flowErr } = await admin.from("one_connect_flows").insert({
        state, profile_id: profileId, code_verifier: verifier,
      });
      if (flowErr) return json({ error: "Could not start connect flow" }, 500);

      const callback = `${supabaseUrl}/functions/v1/one-connect?action=callback`;
      const auth = new URL(`${ONE_API}/oauth/authorize`);
      auth.searchParams.set("client_id", clientId);
      auth.searchParams.set("redirect_uri", callback);
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("scope", SCOPES);
      auth.searchParams.set("state", state);
      auth.searchParams.set("code_challenge", await pkceChallenge(verifier));
      auth.searchParams.set("code_challenge_method", "S256");

      return json({ url: auth.toString() });
    }

    // ── Callback: One redirects the browser here after consent ──
    if (req.method === "GET" && action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) return redirect("/integrations", { one_connect: "error" });

      const { data: flow } = await admin
        .from("one_connect_flows").select("*")
        .eq("state", state).gt("expires_at", new Date().toISOString()).single();
      if (!flow) return redirect("/integrations", { one_connect: "expired" });

      // Single-use: consume the flow before exchanging so a replayed
      // callback can't mint a second grant.
      await admin.from("one_connect_flows").delete().eq("state", state);

      const callback = `${supabaseUrl}/functions/v1/one-connect?action=callback`;
      const tokenRes = await fetch(`${ONE_API}/oauth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: callback,
          code_verifier: flow.code_verifier,
        }),
      });
      if (!tokenRes.ok) {
        console.error("One token exchange failed:", tokenRes.status, await tokenRes.text());
        return redirect("/integrations", { one_connect: "failed" });
      }
      const tokens = await tokenRes.json();
      const connectUserId = tokens.connect_user_id as string | undefined;
      if (!connectUserId) {
        console.error("One token response missing connect_user_id");
        return redirect("/integrations", { one_connect: "failed" });
      }

      // The access token's claims name the tenant space (org/project) the
      // user granted into; personal grants have neither. Decode without
      // verifying — we only echo ids One itself issued, never trust client input.
      let orgId = "", projectId = "";
      try {
        const payload = JSON.parse(atob((tokens.access_token as string).split(".")[1]));
        orgId = payload.organization_ids?.[0] ?? "";
        projectId = payload.project_ids?.[0] ?? "";
      } catch { /* personal grant or unexpected shape — store bare id */ }

      const ref = [connectUserId, orgId && `org=${orgId}`, projectId && `project=${projectId}`]
        .filter(Boolean).join(";");

      const { error: upsertErr } = await admin.from("one_connections").upsert({
        profile_id: flow.profile_id,
        connect_user_ref: ref,
        environment: clientId.includes("test") ? "test" : "live",
        updated_at: new Date().toISOString(),
      }, { onConflict: "profile_id" });
      if (upsertErr) {
        console.error("one_connections upsert failed:", upsertErr.message);
        return redirect("/integrations", { one_connect: "failed" });
      }

      // Best-effort profile populate: the grant lets us read who the user
      // is on One. Fill only EMPTY profile fields — never overwrite what
      // the user typed themselves.
      try {
        const connectKey = Deno.env.get("ONE_CONNECT_KEY") || "";
        if (connectKey) {
          const whoHeaders: Record<string, string> = {
            "X-One-Secret": connectKey,
            "X-One-Connect-User-Id": connectUserId,
          };
          if (orgId) whoHeaders["X-One-Organization-Id"] = orgId;
          if (projectId) whoHeaders["X-One-Project-Id"] = projectId;
          const who = await fetch(`${ONE_API}/v1/users/whoami`, { headers: whoHeaders });
          if (who.ok) {
            const me = await who.json();
            const patch: Record<string, string> = {};
            const name = me.name || me.full_name || [me.first_name, me.last_name].filter(Boolean).join(" ");
            if (name) patch.full_name = name;
            if (me.email) patch.email = me.email;
            if (me.picture || me.avatar_url) patch.avatar_url = me.picture || me.avatar_url;
            if (Object.keys(patch).length) {
              // COALESCE-style guard: only write fields that are currently
              // null/empty so a reconnect can't clobber user edits.
              const { data: prof } = await admin
                .from("profiles").select("full_name,email,avatar_url")
                .eq("id", flow.profile_id).single();
              const safe: Record<string, string> = {};
              for (const [k, v] of Object.entries(patch)) {
                const cur = (prof as Record<string, string | null> | null)?.[k];
                if (!cur) safe[k] = v;
              }
              if (Object.keys(safe).length) {
                await admin.from("profiles").update(safe).eq("id", flow.profile_id);
              }
            }
          } else {
            console.error("whoami failed:", who.status, await who.text());
          }
        }
      } catch (e) {
        console.error("profile populate failed (non-fatal):", e);
      }

      return redirect(flow.return_to || "/integrations", { one_connect: "connected" });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    console.error("one-connect error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
