import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { addDays, format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useMyCompany } from '@/hooks/useMarketplace';
import { toCsv, downloadFile } from '@/lib/export/csv';
import { buildPdf, pdfLine } from '@/lib/export/pdf';
import { buildCrewListRows, buildScheduleRows, buildStaffRows, gatherExportData } from '@/lib/export/service';
import type { ExportData } from '@/lib/export/service';

const SECTIONS = [
  { key: 'crew', label: 'Crew list', hint: 'one row per worker — contacts, roles, events' },
  { key: 'schedule', label: 'Schedule', hint: 'every call with booked crew + staff' },
  { key: 'staff', label: 'Staff sheet', hint: 'internal team assignments' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

const pad = (s: string | number, n: number) => String(s).padEnd(n).slice(0, n);

const ExportsPage: React.FC = () => {
  const { company } = useMyCompany();
  const [from, setFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({ crew: true, schedule: true, staff: true });
  const [data, setData] = useState<ExportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);

  // Gather on demand — exports read live data at click time via refresh.
  const gather = async (): Promise<ExportData | null> => {
    if (!company?.id) return null;
    const d = await gatherExportData(company.id, from, to);
    setData(d);
    return d;
  };

  useEffect(() => {
    setData(null); // range changed → stale preview cleared
  }, [from, to]);

  const preview = async () => {
    setLoading(true);
    const d = await gather();
    setLoading(false);
    if (!d || (!d.shifts.length && !d.staff.length)) toast.info('Nothing in that range to export');
  };

  const crewCount = useMemo(() => {
    if (!data) return 0;
    const keys = new Set<string>();
    for (const s of data.shifts) for (const c of s.crew) keys.add(c.email ?? c.name);
    return keys.size;
  }, [data]);

  const buildSections = (d: ExportData) =>
    [
      sections.crew ? { name: 'crew-list', ...buildCrewListRows(d) } : null,
      sections.schedule ? { name: 'schedule', ...buildScheduleRows(d) } : null,
      sections.staff ? { name: 'staff', ...buildStaffRows(d) } : null,
    ].filter((s): s is { name: string; headers: string[]; rows: (string | number)[][] } => !!s);

  const downloadCsv = async () => {
    setBuilding(true);
    const d = data ?? (await gather());
    setBuilding(false);
    if (!d) return;
    const built = buildSections(d);
    if (!built.length) return toast.error('Pick at least one section');
    for (const s of built) {
      downloadFile(`${company?.name ?? 'export'}-${s.name}-${from}_to_${to}.csv`.replace(/[^a-z0-9._-]+/gi, '_'), toCsv(s.headers, s.rows));
    }
    toast.success(`${built.length} CSV${built.length === 1 ? '' : 's'} downloaded`);
  };

  const downloadPdf = async () => {
    setBuilding(true);
    const d = data ?? (await gather());
    setBuilding(false);
    if (!d) return;
    const title = `${company?.name ?? 'Company'} — ${format(parseISO(from), 'MMM d')} to ${format(parseISO(to), 'MMM d, yyyy')}`;
    const lines = [pdfLine(title, 16, true), pdfLine(' ')];
    const built = buildSections(d);
    if (!built.length) return toast.error('Pick at least one section');
    for (const s of built) {
      lines.push(pdfLine(s.name.replace(/-/g, ' ').toUpperCase(), 12, true));
      const widths = s.headers.map((h, i) => Math.min(24, Math.max(h.length + 2, ...s.rows.map((r) => String(r[i] ?? '').length + 2))));
      lines.push(pdfLine(s.headers.map((h, i) => pad(h, widths[i])).join(''), 9, true));
      for (const r of s.rows) {
        lines.push(pdfLine(r.map((c, i) => pad(c, widths[i])).join(''), 8));
      }
      lines.push(pdfLine(' '));
    }
    downloadFile(`${company?.name ?? 'export'}-report-${from}_to_${to}.pdf`.replace(/[^a-z0-9._-]+/gi, '_'), buildPdf(title, lines), 'application/pdf');
    toast.success('PDF downloaded');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6" /> Tour exports
        </h1>
        <p className="text-sm text-muted-foreground">
          The paperwork a run actually needs — crew contact list, full schedule with booked names, staff sheet. CSV for the office, PDF for the printer.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Range & sections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <div>
              <Label htmlFor="ex-from">From</Label>
              <Input id="ex-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ex-to">To</Label>
              <Input id="ex-to" type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={sections[s.key]}
                  onCheckedChange={(v) => setSections((x) => ({ ...x, [s.key]: v === true }))}
                  className="mt-0.5"
                />
                <span>
                  {s.label}
                  <span className="text-xs text-muted-foreground block">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={preview} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Preview range
            </Button>
            <Button onClick={downloadCsv} disabled={building}>
              <FileSpreadsheet className="w-4 h-4 mr-1" /> CSV
            </Button>
            <Button onClick={downloadPdf} disabled={building}>
              <FileDown className="w-4 h-4 mr-1" /> PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm">
              <span className="font-medium">{format(parseISO(from), 'MMM d')} – {format(parseISO(to), 'MMM d, yyyy')}</span>
              <span className="text-muted-foreground">
                {' '}· {data.shifts.length} calls · {crewCount} crew booked · {data.staff.length} staff assignments
              </span>
            </div>
            {!data.shifts.length && !data.staff.length && (
              <p className="text-xs text-muted-foreground mt-2">Nothing scheduled in that range — widen the dates.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ExportsPage;
