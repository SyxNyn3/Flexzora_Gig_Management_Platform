-- Gig communication: broadcast messages from the gig creator to booked crew,
-- plus per-worker confirmation receipts.

CREATE TABLE IF NOT EXISTS public.gig_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id uuid NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type text NOT NULL DEFAULT 'general'
    CHECK (message_type IN ('general', 'instructions', 'payment', 'logistics', 'safety')),
  title text NOT NULL,
  content text NOT NULL,
  -- 'all' broadcasts to the whole roster; otherwise profile ids of the
  -- specific workers the message targets.
  recipients text[] NOT NULL DEFAULT '{all}',
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  requires_confirmation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gig_message_confirmations (
  message_id uuid NOT NULL REFERENCES public.gig_messages(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_gig_messages_gig ON public.gig_messages(gig_id);
CREATE INDEX IF NOT EXISTS idx_gig_message_confirmations_worker
  ON public.gig_message_confirmations(worker_id);

ALTER TABLE public.gig_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gig_message_confirmations ENABLE ROW LEVEL SECURITY;

-- Participants: the gig's creator, or a worker whose application on the gig
-- was accepted/confirmed.
DROP POLICY IF EXISTS "gig participants read messages" ON public.gig_messages;
CREATE POLICY "gig participants read messages" ON public.gig_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gigs g
      WHERE g.id = gig_id
        AND g.created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.gig_applications a
      WHERE a.gig_id = gig_messages.gig_id
        AND a.status = 'accepted'
        AND a.worker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- Only the gig creator posts messages; workers acknowledge via confirmations.
DROP POLICY IF EXISTS "gig creator posts messages" ON public.gig_messages;
CREATE POLICY "gig creator posts messages" ON public.gig_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gigs g
      WHERE g.id = gig_id AND g.created_by = sender_id
    )
  );

DROP POLICY IF EXISTS "gig participants read confirmations" ON public.gig_message_confirmations;
CREATE POLICY "gig participants read confirmations" ON public.gig_message_confirmations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gig_messages m
      JOIN public.gigs g ON g.id = m.gig_id
      WHERE m.id = message_id
        AND g.created_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.gig_messages m
      JOIN public.gig_applications a ON a.gig_id = m.gig_id
      WHERE m.id = message_id
        AND a.status = 'accepted'
        AND a.worker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    )
  );

-- A worker may only insert their own confirmation, and only for a gig they
-- are booked on.
DROP POLICY IF EXISTS "workers confirm own receipts" ON public.gig_message_confirmations;
CREATE POLICY "workers confirm own receipts" ON public.gig_message_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (
    worker_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.gig_messages m
      JOIN public.gig_applications a ON a.gig_id = m.gig_id
      WHERE m.id = message_id
        AND a.status = 'accepted'
        AND a.worker_id = worker_id
    )
  );
