import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMyCompany, useEvents } from '@/hooks/useMarketplace';
import { useAuth } from '@/contexts/AuthContext';
import { ImportJob, ImportRow, ProductionEvent } from '@/lib/types';
import { IMPORT_TARGETS, ImportTargetDef, importTarget, suggestTarget } from '@/lib/import/targets';
import { ParsedTable, parseCsvTable } from '@/lib/import/parse';
import { applyMapping, ColumnMapping, failedRowsCsv, suggestMapping } from '@/lib/import/mapping';
import { llmSuggestMapping } from '@/lib/import/llm';
import { ImportService } from '@/lib/import/service';
import { FileKind, kindOf } from '@/lib/import/files';
import DropZone from './DropZone';
import MappingPanel from './MappingPanel';
import ReviewGrid from './ReviewGrid';
import { ArrowLeft, Building2, CalendarClock, Users, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'drop' | 'target' | 'mapping' | 'review';

interface Props {
  /** Reopen an existing job into the review screen (from job history). */
  openJobId?: string | null;
  onCloseJob?: () => void;
  /** Fired whenever a job's state changed (commit/first save) — refresh history. */
  onJobsChanged?: () => void;
}

const TARGET_ICONS: Record<string, React.ReactNode> = {
  venues: <Building2 className="w-5 h-5" />,
  shifts: <CalendarClock className="w-5 h-5" />,
  roster_contacts: <Users className="w-5 h-5" />,
};

const UploadWizard: React.FC<Props> = ({ openJobId, onCloseJob, onJobsChanged }) => {
  const { profile } = useAuth();
  const { company } = useMyCompany();
  const events = useEvents(company?.id);

  const [step, setStep] = useState<Step>('drop');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedTable | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState<FileKind>('csv');
  const [target, setTarget] = useState<ImportTargetDef | null>(null);
  const [eventId, setEventId] = useState<string>('');
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [mappingSource, setMappingSource] = useState<'llm' | 'heuristic' | 'manual'>('heuristic');
  const [job, setJob] = useState<ImportJob | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [committing, setCommitting] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);

  const dirtyRef = useRef<Map<string, ImportRow>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  /** User edits beat the async LLM suggestion — no clobbering mid-review. */
  const manualEdit = useRef(false);

  // -------------------------------------------------------------------------
  // Reopen a job from history
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!openJobId) return;
    ImportService.getJob(openJobId).then(({ data, error }) => {
      if (error || !data) return toast.error(error ?? 'Job not found');
      setJob(data.job);
      setRows(data.rows);
      setTarget(importTarget(data.job.target) ?? null);
      setParsed({ columns: data.job.source_columns, rows: [] });
      setFileName(data.job.file_name);
      setMapping(data.job.mapping ?? {});
      setStep('review');
    });
  }, [openJobId]);

  // -------------------------------------------------------------------------
  // Step 1 — parse the dropped file
  // -------------------------------------------------------------------------
  const onFile = useCallback(async (file: File) => {
    const kind = kindOf(file.name);
    if (!kind) return;
    setParsing(true);
    try {
      let table: ParsedTable;
      if (kind === 'csv') table = parseCsvTable(await file.text());
      else if (kind === 'xlsx') table = await (await import('@/lib/import/xlsx')).parseXlsxFile(file);
      else table = await (await import('@/lib/import/pdf')).parsePdfFile(file);

      if (table.columns.length === 0) throw new Error('No table found in that file');
      if (table.rows.length === 0) throw new Error('Found headers but no data rows');

      setParsed(table);
      setFileName(file.name);
      setFileType(kind);
      setTarget(suggestTarget(table.columns) ?? null);
      setStep('target');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file");
    } finally {
      setParsing(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Step 2 — target picked: run heuristic now, LLM merge when it answers
  // -------------------------------------------------------------------------
  const pickTarget = (def: ImportTargetDef) => {
    setTarget(def);
    if (!parsed) return;
    manualEdit.current = false;
    const heuristic = suggestMapping(parsed.columns, parsed.rows, def);
    setMapping(heuristic.mapping);
    setConfidence(heuristic.confidence);
    setMappingSource('heuristic');
    setStep('mapping');
    llmSuggestMapping(parsed.columns, parsed.rows, def).then((llm) => {
      if (!llm || manualEdit.current) return;
      setMapping((current) => {
        const merged = { ...current };
        for (const [field, column] of Object.entries(llm)) {
          // LLM wins where it mapped; heuristic fills the rest.
          if (!current[field] || heuristic.confidence[field] < 100) merged[field] = column;
        }
        return merged;
      });
      setMappingSource('llm');
    });
  };

  // -------------------------------------------------------------------------
  // Step 3 — persist job + rows, show the review grid
  // -------------------------------------------------------------------------
  const startReview = async () => {
    if (!parsed || !target || !company || !profile) return;
    if (target.needsEvent && !eventId) return toast.error('Pick the event these calls belong to');
    setCreatingJob(true);
    const event = events.data.find((e: ProductionEvent) => e.id === eventId);
    const reviewed = applyMapping(parsed.rows, mapping, target, { datePrefix: event?.starts_on });
    const { data: created, error } = await ImportService.createJob({
      companyId: company.id,
      createdBy: profile.id,
      target: target.key,
      fileName,
      fileType,
      sourceColumns: parsed.columns,
      mapping,
      mappingSource,
      eventId: target.needsEvent ? eventId : undefined,
      rows: reviewed,
    });
    setCreatingJob(false);
    if (error || !created) return toast.error(error ?? 'Failed to save the import');
    setJob(created);
    const { data: full } = await ImportService.getJob(created.id);
    setRows(full?.rows ?? []);
    setStep('review');
  };

  // -------------------------------------------------------------------------
  // Review grid edits — local state + debounced upsert
  // -------------------------------------------------------------------------
  const onRowsChanged = useCallback((next: ImportRow[], dirty: ImportRow[]) => {
    setRows(next);
    for (const r of dirty) dirtyRef.current.set(r.id, r);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const pending = [...dirtyRef.current.values()];
      dirtyRef.current.clear();
      if (pending.length) ImportService.saveRows(pending);
    }, 400);
  }, []);

  const commit = async () => {
    if (!job) return;
    clearTimeout(saveTimer.current);
    const pending = [...dirtyRef.current.values()];
    dirtyRef.current.clear();
    if (pending.length) await ImportService.saveRows(pending);
    setCommitting(true);
    const { data, error } = await ImportService.commitJob(job.id);
    const { data: full } = await ImportService.getJob(job.id);
    setCommitting(false);
    if (error) {
      toast.error(error);
    } else {
      toast.success(`Imported ${data.imported} row${data.imported === 1 ? '' : 's'}${data.failed ? ` — ${data.failed} need fixes` : ''}`);
      setJob(full?.job ?? job);
      setRows(full?.rows ?? []);
      onJobsChanged?.();
    }
  };

  const exportErrors = () => {
    const csv = failedRowsCsv(
      rows.map((r) => ({ row_index: r.row_index, raw: r.raw, mapped: r.mapped, status: r.status, message: r.message ?? undefined })),
      parsed?.columns ?? [],
    );
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fix-${fileName.replace(/\.[^.]+$/, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep('drop');
    setParsed(null);
    setTarget(null);
    setEventId('');
    setMapping({});
    setConfidence({});
    setJob(null);
    setRows([]);
    dirtyRef.current.clear();
    manualEdit.current = false;
    onCloseJob?.();
  };

  const committed = job?.status === 'committed';
  const liveEvents = useMemo(() => events.data.filter((e) => e.status !== 'cancelled'), [events.data]);

  return (
    <div className="space-y-4">
      {step === 'drop' && <DropZone busy={parsing} onFile={onFile} onReject={toast.error} />}

      {step === 'target' && parsed && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{fileName}</h3>
                <p className="text-sm text-muted-foreground">
                  {parsed.rows.length} rows × {parsed.columns.length} columns — what is this?
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Start over
              </Button>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {IMPORT_TARGETS.filter((t) => !t.comingSoon).map((t) => (
                <button
                  key={t.key}
                  onClick={() => pickTarget(t)}
                  className={cn(
                    'text-left p-4 rounded-lg border transition-colors hover:border-primary/60 hover:bg-primary/5',
                    target?.key === t.key ? 'border-primary bg-primary/10' : 'border-border',
                  )}
                >
                  <div className="flex items-center gap-2 font-medium mb-1">
                    {TARGET_ICONS[t.key]}
                    {t.label}
                  </div>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'mapping' && parsed && target && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep('target')}>
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
            </Button>
            <Badge variant="outline">{fileName}</Badge>
          </div>

          {target.needsEvent && (
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-sm font-medium">Import calls into</span>
                <Select value={eventId} onValueChange={setEventId}>
                  <SelectTrigger className="w-72 h-9">
                    <SelectValue placeholder="Pick an event…" />
                  </SelectTrigger>
                  <SelectContent>
                    {liveEvents.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} — {e.starts_on}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {liveEvents.length === 0 && <span className="text-xs text-muted-foreground">Create an event first.</span>}
              </CardContent>
            </Card>
          )}

          <MappingPanel
            target={target}
            columns={parsed.columns}
            sampleRows={parsed.rows}
            mapping={mapping}
            confidence={confidence}
            mappingSource={mappingSource}
            onChange={(m) => {
              manualEdit.current = true;
              setMapping(m);
              setMappingSource('manual');
            }}
          />
          <div className="flex justify-end">
            <Button onClick={startReview} disabled={creatingJob || Object.keys(mapping).length === 0} className="bg-gradient-to-r from-blue-600 to-green-500">
              {creatingJob ? 'Preparing…' : `Review ${parsed.rows.length} rows`}
            </Button>
          </div>
        </div>
      )}

      {step === 'review' && target && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-medium">{fileName}</h3>
              <Badge variant="outline">{target.label}</Badge>
              {job?.status === 'committed' && <Badge className="bg-emerald-600">Imported</Badge>}
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> New import
            </Button>
          </div>
          <ReviewGrid
            target={target}
            rows={rows}
            committed={committed}
            committing={committing}
            onRowsChanged={onRowsChanged}
            onCommit={commit}
            onExportErrors={exportErrors}
          />
        </div>
      )}
    </div>
  );
};

export default UploadWizard;
