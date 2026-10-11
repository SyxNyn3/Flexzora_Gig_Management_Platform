// CertService — credential verification workflow.
// Worker uploads a document to the private cert-docs bucket and submits for
// review; companies review the queue of pending certs on related workers.
import { supabase } from '@/lib/supabase';
import type { CertGap, Certification } from '@/lib/types';

type Result<T> = { data: T | null; error: string | null };
const ok = <T,>(data: T): Result<T> => ({ data, error: null });
const fail = <T,>(e: unknown): Result<T> => ({ data: null, error: e instanceof Error ? e.message : String(e) });

const BUCKET = 'cert-docs';
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 10 * 1024 * 1024;

export interface PendingReview extends Certification {
  worker_name?: string;
}

export class CertService {
  /** Upload a credential document; returns the storage path. */
  static async uploadDocument(workerId: string, certId: string, file: File): Promise<Result<string>> {
    try {
      if (!ACCEPTED.includes(file.type)) throw new Error('PDF or image files only');
      if (file.size > MAX_BYTES) throw new Error('File must be under 10 MB');
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `${workerId}/${certId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      return ok(path);
    } catch (e) {
      return fail(e);
    }
  }

  /** Attach a document and submit the credential for review. */
  static async submitForReview(certId: string, documentPath: string, documentName: string): Promise<Result<null>> {
    try {
      const { error } = await supabase
        .from('certifications')
        .update({
          document_path: documentPath,
          document_name: documentName,
          verification_status: 'pending',
        })
        .eq('id', certId);
      if (error) throw error;
      return ok(null);
    } catch (e) {
      return fail(e);
    }
  }

  /** Queue of pending certs on workers related to this company. */
  static async reviewQueue(companyId: string): Promise<Result<PendingReview[]>> {
    try {
      const { data, error } = await supabase.rpc('pending_cert_reviews', { p_company_id: companyId });
      if (error) throw error;
      const certs = (data ?? []) as Certification[];
      if (!certs.length) return ok([]);
      const { data: workers } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', [...new Set(certs.map((c) => c.worker_id))]);
      const names = new Map((workers ?? []).map((w) => [w.id, w.full_name]));
      return ok(certs.map((c) => ({ ...c, worker_name: names.get(c.worker_id) })));
    } catch (e) {
      return fail(e);
    }
  }

  static async decide(certId: string, companyId: string, approve: boolean, note?: string): Promise<Result<null>> {
    try {
      const { error } = await supabase.rpc('review_certification', {
        p_cert_id: certId,
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

  /** 60s read URL for a document — works for owner and related companies. */
  static async documentUrl(path: string): Promise<string | null> {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    return data?.signedUrl ?? null;
  }

  /** "Unlock more calls" — which credentials gate the most shifts in this worker's pool. */
  static async certGaps(): Promise<Result<CertGap[]>> {
    try {
      const { data, error } = await supabase.rpc('worker_cert_gaps_for_current_user');
      if (error) throw error;
      return ok((data ?? []) as CertGap[]);
    } catch (e) {
      return fail(e);
    }
  }
}
