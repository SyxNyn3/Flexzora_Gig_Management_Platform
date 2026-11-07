// W-9 guided flow: schema, validation, and facsimile PDF generation.
//
// Security posture: the taxpayer ID (SSN/EIN) is collected ONLY to render the
// generated PDF that lands in the private `compliance-docs` bucket. It is never
// written to compliance_docs (which deliberately has no metadata/details
// column), profiles, or any broadly-readable field. Do not add such a column
// for taxpayer IDs.
//
// E-sign honesty: the "signature" is a typed name + date rendered into the PDF
// — a facsimile e-signature, NOT a cryptographic signature. The Part II
// perjury certification text is reproduced on the document so the paper
// record stands on its own.
import { jsPDF } from 'jspdf';
import { z } from 'zod';

export const W9_CLASSIFICATIONS = [
  'individual',
  'c_corp',
  's_corp',
  'partnership',
  'trust_estate',
  'llc',
  'other',
] as const;
export type W9Classification = (typeof W9_CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABELS: Record<W9Classification, string> = {
  individual: 'Individual/sole proprietor',
  c_corp: 'C corporation',
  s_corp: 'S corporation',
  partnership: 'Partnership',
  trust_estate: 'Trust/estate',
  llc: 'LLC',
  other: 'Other',
};

/** IRS W-9 line 3a requires LLCs to declare C, S, or P (partnership) treatment. */
export const LLC_TYPES = ['C', 'S', 'P'] as const;
export type LlcType = (typeof LLC_TYPES)[number];

const digits = (s: string) => s.replace(/\D/g, '');
const ssnOk = (s?: string) => !s || s === '' || digits(s).length === 9;
const einOk = (s?: string) => !s || s === '' || digits(s).length === 9;

const optionalText = z.string().trim().max(160).optional().or(z.literal(''));

export const w9Schema = z
  .object({
    // Line 1 — legal name exactly as filed on the income tax return.
    name: z.string().trim().min(1, 'Name is required').max(120),
    // Line 2 — disregarded entity / DBA.
    businessName: optionalText,
    // Line 3a — exactly one federal tax classification.
    classification: z.enum(W9_CLASSIFICATIONS, {
      // zod 4 dropped `errorMap`; `error` is the unified message param
      error: 'Pick a tax classification',
    }),
    // Line 3a LLC detail — the IRS requires C, S, or P (partnership) treatment.
    llcType: z.enum(LLC_TYPES).optional(),
    llcMembers: z.coerce.number().int().min(0).max(100000).optional(),
    llcOrganizedUS: z.boolean().optional(),
    // Line 4 — exempt payee / FATCA codes (rare; most individuals leave blank).
    exemptPayeeCode: optionalText,
    exemptFatcaCode: optionalText,
    // Line 5 — street address.
    address: z.string().trim().min(1, 'Address is required').max(160),
    // Line 6 — city / state / ZIP.
    city: z.string().trim().min(1, 'City is required').max(80),
    state: z.string().trim().length(2, 'Use the 2-letter state code').max(2),
    zip: z.string().trim().min(5, 'ZIP is required').max(10),
    // Line 7 — account numbers the requester gave you (optional).
    accountNumber: optionalText,
    // Requester's name/address block on the right of Part I (optional).
    requesterName: optionalText,
    requesterAddress: optionalText,
    // Line 8 / 9 — SSN or EIN. At least one 9-digit number; digits only,
    // formatted for print. NEVER persisted outside the generated PDF.
    ssn: z.string().trim().max(11).optional().or(z.literal('')),
    ein: z.string().trim().max(10).optional().or(z.literal('')),
    // Part II — the worker must affirm the perjury certification and type
    // their legal name as the signature. The date is stamped at render time
    // so the PDF and the attestation can never disagree.
    certificationAck: z
      .boolean()
      .refine((v) => v === true, { message: 'You must certify the W-9 statements' }),
    signatureName: z.string().trim().min(3, 'Type your full legal name to sign').max(120),
  })
  .refine((d) => d.classification !== 'llc' || !!d.llcType, {
    message: 'LLCs must specify C, S, or P tax treatment',
    path: ['llcType'],
  })
  .refine((d) => ssnOk(d.ssn) && einOk(d.ein), {
    message: 'SSN/EIN must be 9 digits when provided',
    path: ['ssn'],
  })
  .refine((d) => digits(d.ssn ?? '').length === 9 || digits(d.ein ?? '').length === 9, {
    message: 'Enter a valid 9-digit SSN or EIN',
    path: ['ssn'],
  });

export type W9FormData = z.infer<typeof w9Schema>;

export const fmtSSN = (s?: string) => {
  const d = digits(s ?? '');
  return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : '';
};
export const fmtEIN = (s?: string) => {
  const d = digits(s ?? '');
  return d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2)}` : '';
};
/** Masked TIN for the review step — never renders the full number in the DOM. */
export const maskTin = (s?: string) => {
  const d = digits(s ?? '');
  return d.length === 9 ? `***-**-${d.slice(5)}` : '';
};

/* ------------------------------------------------------------------ */
/* PDF facsimile — Rev. October 2018 layout approximation             */
/* ------------------------------------------------------------------ */

const PAGE_W = 612;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LEFT_W = CONTENT_W * 0.62;
const RIGHT_X = MARGIN + LEFT_W + 14;
const RIGHT_W = PAGE_W - MARGIN - RIGHT_X;

const todayLong = () =>
  new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/** Render the filled W-9 to a jsPDF doc. Letter portrait, single page. */
export function generateW9Pdf(d: W9FormData): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const F = 'helvetica';

  const txt = (x: number, y: number, s: string, size = 8, opts?: { bold?: boolean; align?: 'left' | 'center' | 'right' }) => {
    doc.setFont(F, opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(s, x, y, { align: opts?.align ?? 'left' });
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => doc.line(x1, y1, x2, y2);
  const rect = (x: number, y: number, w: number, h: number) => doc.rect(x, y, w, h);
  const wrap = (s: string, maxW: number) => doc.splitTextToSize(s || ' ', maxW) as string[];

  let y = MARGIN;

  // ---- Header ----
  txt(MARGIN, y, 'Form W-9', 16, { bold: true });
  txt(PAGE_W - MARGIN, y, '(Rev. October 2018)', 10, { bold: true, align: 'right' });
  y += 16;
  txt(PAGE_W / 2, y, 'Request for Taxpayer', 11, { bold: true, align: 'center' });
  y += 13;
  txt(PAGE_W / 2, y, 'Identification Number and Certification', 11, { bold: true, align: 'center' });
  y += 16;
  txt(MARGIN, y, 'Department of the Treasury', 9);
  txt(PAGE_W - MARGIN, y, 'Internal Revenue Service', 9, { align: 'right' });
  y += 10;
  line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 12;

  // ---- Part I heading ----
  txt(MARGIN, y, 'Part I', 10, { bold: true });
  txt(MARGIN + 30, y, 'Taxpayer Identification Information', 10, { bold: true });
  y += 14;

  const partIY = y; // top of the two-column field area — both cursors start here

  /* Helpers bound to a cursor — each column keeps its own `cy`. */
  const makeColumn = (x: number, w: number) => {
    let cy = partIY;
    const caption = (yy: number, s: string, size = 7) => txt(x + 4, yy, s, size, { bold: true });
    /** Underlined value area inside a cell: caption top, value bottom. */
    const valueLines = (value: string, topY: number, bottomY: number) => {
      line(x + 4, bottomY, x + w - 4, bottomY);
      const lines = wrap(value, w - 12);
      const startY = bottomY - 6 - (lines.length - 1) * 10;
      lines.forEach((ln, i) => txt(x + 6, Math.max(startY + i * 10, topY + 18), ln, 8));
    };
    return {
      get cy() { return cy; },
      cell: (h: number) => { rect(x, cy, w, h); },
      caption,
      valueLines,
      advance: (h: number, gap = 4) => { cy += h + gap; },
      text: (yy: number, s: string, size = 7.5) => txt(x + 4, yy, s, size),
    };
  };

  const left = makeColumn(MARGIN, LEFT_W);
  const right = makeColumn(RIGHT_X, RIGHT_W);

  // ============ LEFT COLUMN ============
  // Line 1 — name (an entry is required)
  left.cell(46);
  left.caption(left.cy + 10, '1. Name of entity/individual as shown on income tax return (an entry is required).');
  left.valueLines(d.name, left.cy + 10, left.cy + 42);
  left.advance(46);

  // Line 2 — business name / disregarded entity
  left.cell(34);
  left.caption(left.cy + 10, '2. Business name/disregarded entity name, if different from above.');
  left.valueLines(d.businessName ?? '', left.cy + 10, left.cy + 30);
  left.advance(34);

  // Line 3a — federal tax classification (single wide cell, checkbox grid)
  const clsH = 96;
  left.cell(clsH);
  left.caption(left.cy + 10, '3a. Federal tax classification — check the appropriate box (only one):');
  const clsCols: Array<[W9Classification, string]> = [
    ['individual', 'Individual/sole proprietor'],
    ['c_corp', 'C corporation'],
    ['s_corp', 'S corporation'],
    ['partnership', 'Partnership'],
    ['trust_estate', 'Trust/estate'],
    ['llc', 'LLC — specify type below'],
    ['other', 'Other — specify'],
  ];
  const boxSize = 7;
  clsCols.forEach(([key, label], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx = MARGIN + 8 + col * (LEFT_W / 2 - 4);
    const by = left.cy + 22 + row * 16;
    rect(bx, by, boxSize, boxSize);
    if (d.classification === key) txt(bx + boxSize / 2, by + boxSize - 1.5, 'X', 8, { bold: true, align: 'center' });
    txt(bx + boxSize + 4, by + 6, label, 7.5);
  });
  // LLC / other specify line
  const specY = left.cy + 22 + 4 * 16 + 4;
  txt(MARGIN + 8, specY, 'Specify (LLC type C/S/P or other):', 7);
  const specVal = d.classification === 'llc' ? (d.llcType ?? '') : d.classification === 'other' ? (d.businessName ?? '') : '';
  line(MARGIN + 8 + 140, specY + 3, MARGIN + LEFT_W - 8, specY + 3);
  txt(MARGIN + 8 + 144, specY + 1, specVal, 8);
  // 3b / 3c LLC extras (only when the LLC box is checked)
  if (d.classification === 'llc') {
    const ly = specY + 14;
    txt(MARGIN + 8, ly, `3b. Number of LLC members: ${d.llcMembers ?? ''}`, 7.5);
    txt(MARGIN + 8 + LEFT_W / 2, ly, `3c. LLC organized in the U.S.? ${d.llcOrganizedUS === undefined ? '' : d.llcOrganizedUS ? 'Yes' : 'No'}`, 7.5);
  }
  left.advance(clsH);

  // Line 4 — exemptions
  left.cell(40);
  left.caption(left.cy + 10, '4. Exemptions (codes apply only to certain entities, not individuals — see instructions):');
  left.valueLines(`Payee code: ${d.exemptPayeeCode ?? ''}    FATCA code: ${d.exemptFatcaCode ?? ''}`, left.cy + 10, left.cy + 36);
  left.advance(40);

  // Line 5 — address
  left.cell(40);
  left.caption(left.cy + 10, '5. Address (number, street, and apt. or suite no.) — do not leave blank.');
  left.valueLines(d.address, left.cy + 10, left.cy + 36);
  left.advance(40);

  // Line 6 — city/state/zip
  left.cell(34);
  left.caption(left.cy + 10, '6. City, state, and ZIP code');
  left.valueLines(`${d.city}, ${d.state.toUpperCase()} ${d.zip}`, left.cy + 10, left.cy + 30);
  left.advance(34);

  // Line 7 — account numbers (optional)
  left.cell(30);
  left.caption(left.cy + 10, '7. List account number(s) here (optional).');
  left.valueLines(d.accountNumber ?? '', left.cy + 10, left.cy + 26);
  left.advance(30);

  // ============ RIGHT COLUMN ============
  // Requester's name/address (optional)
  right.cell(56);
  right.caption(right.cy + 10, "Requester's name and address (optional)", 7);
  right.valueLines([d.requesterName, d.requesterAddress].filter(Boolean).join(' — '), right.cy + 10, right.cy + 52);
  right.advance(56);

  // Line 8 — SSN box
  const tinH = 44;
  right.cell(tinH);
  right.caption(right.cy + 10, '8. Social security number', 7);
  right.valueLines(fmtSSN(d.ssn) || ' ', right.cy + 10, right.cy + 40);
  right.advance(tinH);

  // Line 9 — EIN box
  right.cell(tinH);
  right.caption(right.cy + 10, '9. Employer identification number', 7);
  right.valueLines(fmtEIN(d.ein) || ' ', right.cy + 10, right.cy + 40);
  right.advance(tinH);

  // ============ Part II — Certification ============
  const partIIY = Math.max(left.cy, right.cy) + 18;
  doc.setDrawColor(0);
  line(MARGIN, partIIY, PAGE_W - MARGIN, partIIY);
  const certY = partIIY + 12;
  txt(MARGIN, certY, 'Part II', 10, { bold: true });
  txt(MARGIN + 30, certY, 'Certification', 10, { bold: true });

  const certText = [
    'Under penalties of perjury, I certify that:',
    '1. The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and',
    '2. I am not subject to backup withholding because: (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and',
    '3. I am a U.S. citizen or other U.S. person (defined in instructions); and',
    '4. The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.',
  ];
  let cy = certY + 14;
  certText.forEach((para) => {
    const lines = wrap(para, CONTENT_W - 24);
    txt(MARGIN + 20, cy, lines[0], 8);
    lines.slice(1).forEach((ln, i) => txt(MARGIN + 24, cy + 10 * (i + 1), ln, 8));
    cy += 10 * lines.length + 8;
  });
  cy += 4;

  // Signature block — the typed name + today's date are the facsimile signature.
  const sigY = cy + 10;
  // Certification check box (mirrors the wizard attestation)
  const cbX = MARGIN + 20;
  rect(cbX, sigY - 7, 8, 8);
  txt(cbX + 4, sigY - 1, 'X', 8, { bold: true, align: 'center' });
  txt(cbX + 14, sigY, 'I certify the statements above (see instructions).', 8);
  cy = sigY + 26;

  const colW = CONTENT_W / 2 - 10;
  // Signature line
  line(MARGIN + 20, cy, MARGIN + 20 + colW, cy);
  txt(MARGIN + 20, cy + 10, 'Signature of U.S. person', 7, { bold: true });
  txt(MARGIN + 20, cy + 20, d.signatureName, 9);
  cy += 34;
  // Date line
  line(MARGIN + 20 + colW + 20, cy, PAGE_W - MARGIN - 20, cy);
  txt(MARGIN + 20 + colW + 20, cy + 10, 'Date', 7, { bold: true });
  txt(MARGIN + 20 + colW + 20, cy + 20, todayLong(), 9);
  cy += 40;

  // Print name line
  line(MARGIN + 20, cy, MARGIN + 20 + colW, cy);
  txt(MARGIN + 20, cy + 10, 'Print name — type or print', 7, { bold: true });
  txt(MARGIN + 20, cy + 20, d.signatureName, 9);
  cy += 34;

  // ---- Footer ----
  txt(PAGE_W / 2, PAGE_W - MARGIN + 8, 'Cat. No. 10231X Form W-9 (Rev. 10-2018)', 7, { align: 'center' });

  return doc;
}

/** Generate the PDF and wrap it as a File ready for ComplianceService.uploadDocument. */
export function w9ToFile(d: W9FormData): File {
  const pdf = generateW9Pdf(d);
  const blob = pdf.output('blob');
  return new File([blob], 'W-9.pdf', { type: 'application/pdf' });
}
