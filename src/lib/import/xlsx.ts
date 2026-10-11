// XLSX parsing via read-excel-file, dynamic-imported so the dependency only
// lands in the wizard chunk.
import { gridToTable, ParsedTable } from './parse';

type Cell = string | number | boolean | Date | null | undefined;

export async function parseXlsxFile(file: File): Promise<ParsedTable> {
  const readXlsxFile = (await import('read-excel-file')).default;
  const raw = (await readXlsxFile(file)) as Cell[][];

  // Keep dates as Date objects so normalizeForKind can ISO-format them;
  // everything else stringifies.
  const grid = raw.map((row) =>
    row.map((cell) => {
      if (cell == null) return '';
      if (cell instanceof Date) return cell.toISOString();
      return String(cell);
    }),
  );
  return gridToTable(grid);
}
