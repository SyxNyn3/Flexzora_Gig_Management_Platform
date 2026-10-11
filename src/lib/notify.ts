import { supabase } from './supabase';

export type NotifyKind =
  | 'offered' | 'applied'
  | 'confirmed_by_worker' | 'confirmed_by_company'
  | 'declined' | 'withdrawn' | 'rejected' | 'no_show';

/**
 * Fire-and-forget SMS notification for an assignment lifecycle change. Never
 * awaited by callers and never throws — notifications must not block or fail
 * the underlying write. Until Twilio secrets are provisioned the edge function
 * is a graceful no-op anyway.
 */
export const notifyAssignment = (assignmentId: string, kind: NotifyKind): void => {
  supabase.functions
    .invoke('notify-assignment', { body: { assignment_id: assignmentId, kind } })
    .then(({ error }) => {
      if (error) console.warn(`notify-assignment (${kind}) failed:`, error.message);
    })
    .catch((e) => console.warn(`notify-assignment (${kind}) failed:`, e));
};
