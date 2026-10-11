// File type detection for the upload wizard.
export type FileKind = 'csv' | 'xlsx' | 'pdf';

export function kindOf(fileName: string): FileKind | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'pdf') return 'pdf';
  return null;
}
