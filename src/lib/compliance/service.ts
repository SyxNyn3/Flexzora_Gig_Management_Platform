// ComplianceService — W-9/I-9 document vault.
// Worker uploads into their private compliance-docs folder; related companies
// review; an approved W-9 is the gate claim_payout_for_release checks before
// any money moves to that worker.
import { supabase } from '@/lib/supabase';
import type { ComplianceDoc, ComplianceDocType, PayoutReadiness } from '@/lib/types';

type Result<T> = { data: T | null; error: string | null };
const ok = <T,>(data: T): Result<T> => ({ data, error: null });
const fail = <T,>(e: unknown): Result<T> => ({ data: null, error: e instanceof Error ? e.message : String(e) });

const BUCKET = 'compliance-docs';
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;

export const DOC_TYPE_LABELS: Record<ComplianceDocType, string> = {
  w9: 'W-9',
  i9: 'I-9',
  other: 'Other document',
};

export interface PendingComplianceReview extends ComplianceDoc {
  worker_name?: string;
}

export class ComplianceService {
  /** Upload a compliance document; returns the storage path. */
  static async uploadDocument(workerId: string, docType: ComplianceDocType, file: File): Promise<Result<string>> {
    try {
      if (!ACCEPTED.includes(file.type)) throw new Error('PDF or image files only');
      if (file.size > MAX_BYTES) throw new Error('File must be under 10 MB');
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `${workerId}/${docType}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      return ok(path);
    } catch (e) {
      return fail(e);
    }
  }

  /** Upsert the doc row and mark it pending review (one row per doc type). */
  static async submit(workerId: string, docType: ComplianceDocType, documentPath: string): Promise<Result<ComplianceDoc>> {
    try {
      const { data, error } = await supabase
        .from('compliance_docs')
        .upsert(
          { worker_id: workerId, doc_type: docType, document_path: documentPath, status: 'pending' },
          { onConflict: 'worker_id,doc_type' },
        )
        .select()
        .single();
      if (error) throw error;
      return ok(data);
    } catch (e) {
      return fail(e);
    }
  }

  static async listMine(workerId: string): Promise<Result<ComplianceDoc[]>> {
    try {
      const { data, error } = await supabase
        .from('compliance_docs')
        .select('*')
        .eq('worker_id', workerId)
        .order('doc_type');
      if (error) throw error;
      return ok(data ?? []);
    } catch (e) {
      return fail(e);
    }
  }

  /** Pending docs on workers related to this company. */
  static async reviewQueue(companyId: string): Promise<Result<PendingComplianceReview[]>> {
    try {
      const { data, error } = await supabase.rpc('pending_compliance_reviews', { p_company_id: companyId });
      if (error) throw error;
      const docs = (data ?? []) as ComplianceDoc[];
      if (!docs.length) return ok([]);
      const { data: workers } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', [...new Set(docs.map((d) => d.worker_id))]);
      const names = new Map((workers ?? []).map((w) => [w.id, w.full_name]));
      return ok(docs.map((d) => ({ ...d, worker_name: names.get(d.worker_id) })));
    } catch (e) {
      return fail(e);
    }
  }

  static async decide(docId: string, companyId: string, approve: boolean, note?: string): Promise<Result<null>> {
    try {
      const { error } = await supabase.rpc('review_compliance_doc', {
        p_doc_id: docId,
        p_company_id: companyId,
        p_approve: approve,
        p_note: note ?? null,
      });
      if (error) throw error;
      return ok(null);
    } catch (e) {
      return fail(e);
    }
  }

  /** Compliance map for a payout queue: worker_id → has approved W-9. */
  static async payoutHolds(workerIds: string[]): Promise<Result<Map<string, boolean>>> {
    try {
      if (!workerIds.length) return ok(new Map());
      const { data, error } = await supabase
        .from('compliance_docs')
        .select('worker_id')
        .in('worker_id', workerIds)
        .eq('doc_type', 'w9')
        .eq('status', 'approved');
      if (error) throw error;
      const cleared = new Set((data ?? []).map((d) => d.worker_id));
      return ok(new Map(workerIds.map((id) => [id, cleared.has(id)])));
    } catch (e) {
      return fail(e);
    }
  }

  /**
   * Batch payout readiness for workers related to this company, keyed by
   * worker_id. Goes through the worker_payout_readiness SECURITY DEFINER RPC —
   * API roles can't read worker_sensitive directly. Workers with no company
   * relationship are omitted from the map (no oracle), so a missing key means
   * "unknown", not "not ready".
   */
  static async payoutReadiness(companyId: string, workerIds: string[]): Promise<Result<Map<string, PayoutReadiness>>> {
    try {
      if (!workerIds.length) return ok(new Map());
      const { data, error } = await supabase.rpc('worker_payout_readiness', {
        p_company_id: companyId,
        p_worker_ids: workerIds,
      });
      if (error) throw error;
      return ok(new Map(((data ?? []) as PayoutReadiness[]).map((r) => [r.worker_id, r])));
    } catch (e) {
      return fail(e);
    }
  }

  /** 60s read URL for a document — works for owner and related companies. */
  static async documentUrl(path: string): Promise<string | null> {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    return data?.signedUrl ?? null;
  }
}
