// Minimal dependency-free PDF writer — Helvetica text, multi-page, page
// numbers. Enough for call sheets and crew lists printed on site.

interface PdfLine {
  text: string;
  size: number;
  bold?: boolean;
}

const PAGE_W = 612; // Letter
const PAGE_H = 792;
const MARGIN = 54;

const escapePdf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Lines flow across pages; each page gets a title + page-number footer. */
export function buildPdf(title: string, lines: PdfLine[]): Blob {
  const usableH = PAGE_H - MARGIN * 2 - 20;
  const lineH = (l: PdfLine) => (l.size > 10 ? l.size + 8 : l.size + 4);
  const pages: PdfLine[][] = [[]];
  let y = 0;
  for (const line of lines) {
    if (y + lineH(line) > usableH) {
      pages.push([]);
      y = 0;
    }
    pages[pages.length - 1].push(line);
    y += lineH(line);
  }

  const objects: string[] = [];
  const pageIds: number[] = [];
  const FONT_REG = 3;
  const FONT_BOLD = 4;
  let nextId = 5;

  // 1 = catalog, 2 = pages tree, 3/4 = fonts; each page takes 2 ids (content, page).
  for (let p = 0; p < pages.length; p++) {
    const contentId = nextId++;
    const pageId = nextId++;
    pageIds.push(pageId);

    const ops: string[] = [];
    let cy = PAGE_H - MARGIN;
    for (const line of pages[p]) {
      const font = line.bold ? 'F2' : 'F1';
      ops.push(`BT /${font} ${line.size} Tf ${MARGIN} ${cy} Td (${escapePdf(line.text)}) Tj ET`);
      cy -= lineH(line);
    }
    ops.push(`BT /F1 8 Tf ${MARGIN} 30 Td (${escapePdf(title)}) Tj ET`);
    ops.push(`BT /F1 8 Tf ${PAGE_W - MARGIN - 40} 30 Td (${p + 1} / ${pages.length}) Tj ET`);
    const stream = ops.join('\n');
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${FONT_REG} 0 R /F2 ${FONT_BOLD} 0 R >> >> /Contents ${contentId} 0 R >>`;
  }

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[FONT_REG] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[FONT_BOLD] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  // Assemble with a correct xref table (offsets counted in bytes).
  const encoder = new TextEncoder();
  const total = nextId;
  const offsets: number[] = new Array(total + 1).fill(0);
  let out = '%PDF-1.4\n';
  for (let i = 1; i < total; i++) {
    if (!objects[i]) continue;
    offsets[i] = encoder.encode(out).length;
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = encoder.encode(out).length;
  out += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new Blob([out], { type: 'application/pdf' });
}

export const pdfLine = (text: string, size = 10, bold = false): PdfLine => ({ text, size, bold });
