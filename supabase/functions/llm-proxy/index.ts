import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// Server-side proxy for the OpenAI-compatible chat-completions calls that
// src/lib/llm.ts (omniChat) used to send straight to a local OmniRoute
// gateway. In production that localhost URL never resolves, so every Copilot
// and import-mapping "AI" call silently fell back to heuristics. This
// function forwards the same {model, messages, temperature} body to a
// configurable upstream (LLM_BASE_URL secret) and keeps the upstream API
// key server-side.
//
// Secrets (set with `supabase secrets set`, never committed):
//   LLM_BASE_URL  required — OpenAI-compatible base, e.g.
//                 https://generativelanguage.googleapis.com/v1beta/openai
//                 (Gemini), https://openrouter.ai/api/v1, or a self-hosted
//                 llama.cpp server http://<vps>:8080/v1
//   LLM_API_KEY   optional — sent as `Authorization: Bearer` upstream only
//                 when set; self-hosted llama.cpp needs none
//   LLM_MODEL     optional — model name override. The client sends
//                 model:"default"; providers like Gemini require a real
//                 model id, so set this (e.g. gemini-2.0-flash).
//
// Degradation contract: omniChat treats any non-2xx or a missing
// choices[0].message.content as "no LLM" and falls back to heuristics. To
// keep that path uniform we answer EVERY failure mode (unconfigured
// upstream, rate limited, upstream error, upstream timeout) with a 200
// shaped like an empty completion: {choices:[{message:{content:null}}]}.
// Auth failures still return 401 — an unauthenticated caller should never
// reach the upstream spend at all.
//
// Abuse controls: verify_jwt = true at the gateway (config.toml) plus an
// explicit auth.getUser() below; a per-user rolling-24h cap of 60 calls via
// the llm_proxy_hits table (service-role only); and request guards — body
// ≤ 64KB, ≤ 20 messages.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const LLM_BASE_URL = (Deno.env.get("LLM_BASE_URL") || "").replace(/\/+$/, "");
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") || "";
const LLM_MODEL = Deno.env.get("LLM_MODEL") || "";

const UPSTREAM_TIMEOUT_MS = 120_000;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 20;
const DAILY_CALL_LIMIT = 60;
const HITS_RETENTION_DAYS = 7;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// The empty-completion shape omniChat degrades on: res.ok is true but
// content is null, so callers take their heuristic path with no special
// casing. Used for every non-auth failure below.
const emptyCompletion = () =>
  json({ choices: [{ message: { role: "assistant", content: null } }] });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // --- Auth: caller must be a signed-in user -------------------------
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return json({ error: "No authorization header" }, 401);

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Invalid or expired token" }, 401);

    // --- Payload guards -------------------------------------------------
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return json({ error: "Request too large" }, 413);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      return json({ error: `messages must be an array of 1-${MAX_MESSAGES} entries` }, 400);
    }
    // Every message must be a {role, content:string} pair — this is the only
    // shape omniChat produces, and it keeps arbitrary objects out of the
    // upstream prompt.
    for (const m of messages) {
      if (
        !m || typeof m !== "object" ||
        typeof (m as Record<string, unknown>).content !== "string"
      ) {
        return json({ error: "Each message needs a string content field" }, 400);
      }
    }

    // --- Per-user rate limit: 60 calls / rolling 24h --------------------
    // Insert-then-count on the service-role client (RLS denies everyone
    // else). If the table doesn't exist yet the check fails open with a
    // logged error — same posture as the waitlist rate limiter — so a
    // missing migration degrades to "no cap" rather than "no LLM".
    try {
      await supabaseAdmin.from("llm_proxy_hits").insert({ user_id: user.id });
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("llm_proxy_hits")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("ts", dayAgo);
      if ((count ?? 0) > DAILY_CALL_LIMIT) return emptyCompletion();

      // Opportunistic prune so the table doesn't grow forever — one delete
      // per call is cheap at this volume.
      const cutoff = new Date(Date.now() - HITS_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from("llm_proxy_hits").delete().lt("ts", cutoff);
    } catch (e) {
      console.error("llm-proxy rate limit check failed:", e);
    }

    // --- Upstream --------------------------------------------------------
    if (!LLM_BASE_URL) {
      // Not configured yet: behave exactly like an unreachable gateway so
      // the client falls back to heuristics instead of surfacing errors.
      console.warn("llm-proxy: LLM_BASE_URL not set — returning empty completion");
      return emptyCompletion();
    }

    const upstreamBody: Record<string, unknown> = {
      // LLM_MODEL wins when set; otherwise pass through whatever the client
      // sent (currently always "default" — fine for llama.cpp, which ignores
      // it, but hosted providers need LLM_MODEL).
      model: LLM_MODEL || (typeof body.model === "string" ? body.model : "default"),
      messages,
      temperature: typeof body.temperature === "number" ? body.temperature : 0,
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (LLM_API_KEY) headers["Authorization"] = `Bearer ${LLM_API_KEY}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let upstream: Response;
    try {
      upstream = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(upstreamBody),
        signal: controller.signal,
      });
    } catch (e) {
      // Network failure or the upstream-timeout abort — log the reason, never the key.
      console.error("llm-proxy upstream fetch failed:", e instanceof Error ? e.message : e);
      return emptyCompletion();
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      // Don't leak upstream error bodies (they can echo request details);
      // status code is enough for debugging.
      console.error(`llm-proxy upstream returned ${upstream.status}`);
      return emptyCompletion();
    }

    // Pass the completion through verbatim — omniChat only reads
    // choices[0].message.content, but extra fields (usage, finish_reason)
    // cost nothing and help future callers.
    return new Response(await upstream.text(), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("llm-proxy error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});
