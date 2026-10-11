// OmniRoute-assisted column mapping for the import wizard. The heuristic
// mapper is the baseline; the LLM only fills gaps and never invents columns.
import { extractJson, omniChat } from '../llm';
import { ImportTargetDef } from './targets';
import { ColumnMapping } from './mapping';

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
  const sample = sampleRows.slice(0, 3).map((r) => columns.map((c) => r[c] ?? '').join('\x1f')).join('\n');
  const content = await omniChat([
    {
      role: 'system',
      content:
        'You map spreadsheet columns to database fields for an event-production staffing tool. ' +
        'Reply with ONLY a JSON object {"field_key": "source column name"}. ' +
        'Use null for fields with no matching column. Never invent column names. ' +
        'Sample row cells are separated by \\u001f.',
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
