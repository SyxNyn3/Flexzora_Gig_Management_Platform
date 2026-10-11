// Shared OmniRoute LLM client — OpenAI-compatible chat completions on a local
// gateway (default http://localhost:20128/v1, override via VITE_OMNIROUTE_URL).
// Everything degrades gracefully: unreachable endpoint, non-JSON reply, or
// hallucinated content all resolve to null and callers fall back to heuristics.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const OMNIROUTE_URL: string = (import.meta.env.VITE_OMNIROUTE_URL as string | undefined) || 'http://localhost:20128/v1';
const DEFAULT_TIMEOUT_MS = 8000;

export async function omniChat(messages: ChatMessage[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OMNIROUTE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
