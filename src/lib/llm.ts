// Shared LLM client — OpenAI-compatible chat completions.
//
// Routing:
//   - Default (production): POSTs to the `llm-proxy` Supabase edge function,
//     which forwards to the configured upstream (LLM_BASE_URL secret) with
//     the API key kept server-side. The caller's access token rides along so
//     the function can authenticate and rate-limit per user.
//   - Dev override: set VITE_OMNIROUTE_URL to an OpenAI-compatible base
//     (e.g. http://localhost:20128 for a local OmniRoute/llama.cpp gateway)
//     to bypass the proxy entirely — no auth header is sent in that mode.
//
// Everything degrades gracefully: unreachable endpoint, non-JSON reply,
// missing upstream config, rate limiting, or hallucinated content all
// resolve to null and callers fall back to heuristics.

import { supabase } from './supabase';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// VITE_OMNIROUTE_URL is a full OpenAI-compatible base URL (…/v1); when set
// we hit `${url}/chat/completions` directly. Unset → the edge-function
// proxy, which expects a bare POST (it appends /chat/completions upstream).
const OMNIROUTE_URL: string | undefined = import.meta.env.VITE_OMNIROUTE_URL as string | undefined;
const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/llm-proxy`;
const DEFAULT_TIMEOUT_MS = 8000;

export async function omniChat(messages: ChatMessage[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let url: string;
    if (OMNIROUTE_URL) {
      url = `${OMNIROUTE_URL}/chat/completions`;
    } else {
      url = PROXY_URL;
      // The proxy verifies the JWT and enforces the per-user call cap.
      // getSession() transparently refreshes an expired token; with no
      // session the function returns 401 and we degrade to heuristics —
      // correct for anonymous visitors who shouldn't spend LLM tokens.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'default', messages, temperature: 0 }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the first {...} JSON object from possibly-chatty LLM output. */
export function extractJson(content: string): Record<string, unknown> | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
