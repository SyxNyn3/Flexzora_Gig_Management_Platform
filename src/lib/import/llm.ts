// OmniRoute LLM client — OpenAI-compatible chat completions on a local
// gateway (default http://localhost:20128/v1, override via VITE_OMNIROUTE_URL).
// Everything degrades gracefully: unreachable endpoint, non-JSON reply, or
// hallucinated field/column names all resolve to null and the caller falls
// back to the heuristic mapper.
import { ImportTargetDef } from './targets';
import { ColumnMapping } from './mapping';

const OMNIROUTE_URL: string = (import.meta.env.VITE_OMNIROUTE_URL as string | undefined) || 'http://localhost:20128/v1';
const TIMEOUT_MS = 8000;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function chat(messages: ChatMessage[]): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
function extractJson(content: string): Record<string, unknown> | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Ask the LLM to map file columns to target fields. Returns a sanitized
 * mapping (unknown fields and unknown columns dropped) or null.
 */
export async function llmSuggestMapping(
  columns: string[],
  sampleRows: Record<string, string>[],
  target: ImportTargetDef,
): Promise<ColumnMapping | null> {
  const fieldList = target.fields.map((f) => `${f.key}${f.required ? ' (required)' : ''}: ${f.label}`).join('\n');
  const sample = sampleRows.slice(0, 3).map((r) => columns.map((c) => r[c] ?? '').join(' | ')).join('\n');
  const content = await chat([
    {
      role: 'system',
      content:
        'You map spreadsheet columns to database fields for an event-production staffing tool. ' +
        'Reply with ONLY a JSON object {"field_key": "source column name"}. ' +
        'Use null for fields with no matching column. Never invent column names.',
    },
    {
      role: 'user',
      content: `Target fields:\n${fieldList}\n\nFile columns: ${columns.join(', ')}\n\nSample rows:\n${sample}`,
    },
  ]);
  if (!content) return null;
  const parsed = extractJson(content);
  if (!parsed) return null;

  const columnSet = new Set(columns);
  const fieldSet = new Set(target.fields.map((f) => f.key));
  const mapping: ColumnMapping = {};
  for (const [field, column] of Object.entries(parsed)) {
    if (!fieldSet.has(field) || typeof column !== 'string') continue;
    if (columnSet.has(column)) mapping[field] = column;
  }
  return Object.keys(mapping).length ? mapping : null;
}
