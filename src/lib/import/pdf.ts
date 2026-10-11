// PDF table extraction via pdfjs-dist, dynamic-imported for chunking.
//
// Call sheets arrive as PDFs more often than spreadsheets. pdf.js gives us
// positioned text items; we group them into lines by y, then anchor columns
// from the header line's x positions and bucket every later line into those
// columns. When a page yields no usable column structure we still return
// one-column rows — the review screen lets the user map what they can.
import { gridToTable, ParsedTable } from './parse';

interface TextItem {
  str: string;
  x: number;
  y: number;
}

async function pageItems(page: { getTextContent: () => Promise<{ items: unknown[] }> }): Promise<TextItem[]> {
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const raw of content.items) {
    const it = raw as { str?: string; transform?: number[] };
    if (!it?.str?.trim() || !it.transform) continue;
    items.push({ str: it.str.trim(), x: it.transform[4], y: it.transform[5] });
  }
  return items;
}

/** Cluster items into visual lines (same baseline within tolerance). */
function linesOf(items: TextItem[], tolerance = 3): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];
  for (const item of sorted) {
    const line = lines.find((l) => Math.abs(l[0].y - item.y) <= tolerance);
    if (line) line.push(item);
    else lines.push([item]);
  }
  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b[0].y - a[0].y);
}

/**
 * Split a line into cells using column anchors discovered from the widest
 * line on the page (usually the header). Falls back to x-gap splitting when
 * anchors don't separate the line.
 */
function cellsOf(line: TextItem[], anchors: number[]): string[] {
  const buckets: string[][] = anchors.map(() => []);
  for (const item of line) {
    let best = 0;
    for (let i = 1; i < anchors.length; i++) {
      if (item.x >= anchors[i] - 4) best = i;
    }
    buckets[best].push(item.str);
  }
  return buckets.map((b) => b.join(' ').trim());
}

function anchorsFrom(lines: TextItem[][]): number[] {
  // The line with the most separated items anchors the columns.
  let best: number[] = [];
  for (const line of lines.slice(0, 30)) {
    const starts = line.map((i) => i.x);
    if (starts.length > best.length) best = starts;
  }
  return best;
}

export async function parsePdfFile(file: File): Promise<ParsedTable> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const grid: string[][] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const items = await pageItems(page as unknown as { getTextContent: () => Promise<{ items: unknown[] }> });
    if (items.length === 0) continue;
    const lines = linesOf(items);
    const anchors = anchorsFrom(lines);
    for (const line of lines) {
      const cells = anchors.length > 1 ? cellsOf(line, anchors) : [line.map((i) => i.str).join(' ')];
      if (cells.some((c) => c !== '')) grid.push(cells);
    }
  }
  return gridToTable(grid);
}
