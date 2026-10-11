// ImportService — persistence for the upload wizard.
//
// Rows are written once the user confirms a mapping (job + rows in the same
// logical step; Supabase has no multi-table tx from the client, so the job
// row lands first and rows chunk in after — a half-written job still shows
// in history as 'uploaded' and can be deleted).
// Review-grid edits are debounced upserts; commit goes through the
// commit_import_job RPC which inserts per row and records per-row errors.
import { supabase } from '@/lib/supabase';
import { ImportJob, ImportJobStatus, ImportRow, ImportTarget } from '@/lib/types';
import { ColumnMapping, ReviewedRow } from './mapping';

type Result<T> = { data: T; error: string | null };
const ok = <T>(data: T): Result<T> => ({ data, error: null });
const fail = <T>(fallback: T, error: unknown): Result<T> => ({
  data: fallback,
  error: error instanceof Error ? error.message : String(error),
});

const ROW_CHUNK = 500;

export interface NewJobInput {
  companyId: string;
  createdBy: string;
  target: ImportTarget;
  fileName: string;
  fileType: string;
  sourceColumns: string[];
  mapping: ColumnMapping;
  mappingSource: string;
  eventId?: string;
  rows: ReviewedRow[];
}

export class ImportService {
  static async listJobs(companyId: string): Promise<Result<ImportJob[]>> {
    try {
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return ok((data ?? []) as ImportJob[]);
    } catch (e) {
      return fail([], e);
    }
  }

  static async getJob(jobId: string): Promise<Result<{ job: ImportJob; rows: ImportRow[] } | null>> {
    try {
      const [{ data: job, error: jobErr }, { data: rows, error: rowsErr }] = await Promise.all([
        supabase.from('import_jobs').select('*').eq('id', jobId).single(),
        supabase.from('import_rows').select('*').eq('job_id', jobId).order('row_index'),
      ]);
      if (jobErr) throw jobErr;
      if (rowsErr) throw rowsErr;
      return ok({ job: job as ImportJob, rows: (rows ?? []) as ImportRow[] });
    } catch (e) {
      return fail(null, e);
    }
  }

  /** Create the job row + all parsed rows in chunks. */
  static async createJob(input: NewJobInput): Promise<Result<ImportJob | null>> {
    try {
      const stats = {
        total: input.rows.length,
        ready: input.rows.filter((r) => r.status === 'ready').length,
        warning: input.rows.filter((r) => r.status === 'warning').length,
        error: input.rows.filter((r) => r.status === 'error').length,
        skipped: input.rows.filter((r) => r.status === 'skipped').length,
        imported: 0,
      };
      const { data: job, error: jobErr } = await supabase
        .from('import_jobs')
        .insert({
          company_id: input.companyId,
          created_by: input.createdBy,
          target: input.target,
          file_name: input.fileName,
          file_type: input.fileType,
          status: 'reviewing' as ImportJobStatus,
          source_columns: input.sourceColumns,
          mapping: input.mapping,
          mapping_source: input.mappingSource,
          event_id: input.eventId,
          stats,
        })
        .select()
        .single();
      if (jobErr) throw jobErr;

      const inserts = input.rows.map((r) => ({
        job_id: job.id,
        row_index: r.row_index,
        raw: r.raw,
        mapped: r.mapped,
        status: r.status,
        message: r.message ?? null,
      }));
      for (let i = 0; i < inserts.length; i += ROW_CHUNK) {
        const { error } = await supabase.from('import_rows').insert(inserts.slice(i, i + ROW_CHUNK));
        if (error) throw error;
      }
      return ok({ ...job, stats } as ImportJob);
    } catch (e) {
      return fail(null, e);
    }
  }

  /** Persist edited rows (debounced from the review grid). */
  static async saveRows(rows: ImportRow[]): Promise<Result<number>> {
    try {
      const updates = rows.map((r) => ({
        id: r.id,
        job_id: r.job_id,
        row_index: r.row_index,
        raw: r.raw,
        mapped: r.mapped,
        status: r.status,
        message: r.message ?? null,
      }));
      for (let i = 0; i < updates.length; i += ROW_CHUNK) {
        const { error } = await supabase.from('import_rows').upsert(updates.slice(i, i + ROW_CHUNK));
        if (error) throw error;
      }
      return ok(updates.length);
    } catch (e) {
      return fail(0, e);
    }
  }

  static async updateJobMapping(jobId: string, mapping: ColumnMapping, mappingSource: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('import_jobs').update({ mapping, mapping_source: mappingSource }).eq('id', jobId);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }

  static async commitJob(jobId: string): Promise<Result<{ imported: number; failed: number }>> {
    try {
      const { data, error } = await supabase.rpc('commit_import_job', { p_job_id: jobId });
      if (error) throw error;
      return ok({ imported: data?.imported ?? 0, failed: data?.failed ?? 0 });
    } catch (e) {
      return fail({ imported: 0, failed: 0 }, e);
    }
  }

  static async deleteJob(jobId: string): Promise<Result<boolean>> {
    try {
      const { error } = await supabase.from('import_jobs').delete().eq('id', jobId);
      if (error) throw error;
      return ok(true);
    } catch (e) {
      return fail(false, e);
    }
  }
}
