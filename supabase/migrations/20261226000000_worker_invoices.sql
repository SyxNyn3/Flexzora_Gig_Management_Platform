-- Worker-issued invoices: crew members freelance for companies that don't
-- use Flexzora (or require a formal invoice before paying). The platform
-- `invoices` table is company→worker payroll paperwork; this is the
-- worker→client document — a different direction, different fields.
--
-- Design notes:
-- - invoice_number is assigned by trigger from a sequence — clients need
--   sequential, non-guessable-but-stable numbers, and client-side
--   max()+1 races under concurrent creates.
-- - bill_to is free text/email, NOT a companies FK: the client may not be
--   on the platform at all. Deliberately no company linkage v1.
-- - status is worker-managed bookkeeping (draft→sent→paid/void); no money
--   moves through this table — it's the document, not the payment rail.

CREATE SEQUENCE IF NOT EXISTS public.worker_invoice_seq;

CREATE TABLE IF NOT EXISTS public.worker_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  bill_to_name text NOT NULL,
  bill_to_email text,
  bill_to_address text,
  description text NOT NULL DEFAULT '',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','void')),
  issued_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS worker_invoices_worker_idx
  ON public.worker_invoices (worker_id, created_at DESC);

ALTER TABLE public.worker_invoices ENABLE ROW LEVEL SECURITY;

-- Workers own their invoices outright; companies get nothing — an invoice
-- a worker sends to a client is the worker's private paperwork until the
-- client pays through whatever rail they use.
CREATE POLICY "worker_invoices owner all" ON public.worker_invoices
  FOR ALL TO authenticated
  USING (worker_id = public.current_profile_id())
  WITH CHECK (worker_id = public.current_profile_id());

-- Sequential number on insert. YYYY-#### format, gap-tolerant (a rolled-back
-- insert burns a number — acceptable for invoices, uniqueness is what matters).
CREATE OR REPLACE FUNCTION public.worker_invoice_assign_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.worker_invoice_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worker_invoice_assign_number ON public.worker_invoices;
CREATE TRIGGER worker_invoice_assign_number
  BEFORE INSERT ON public.worker_invoices
  FOR EACH ROW EXECUTE FUNCTION public.worker_invoice_assign_number();

CREATE OR REPLACE FUNCTION public.worker_invoice_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worker_invoice_touch ON public.worker_invoices;
CREATE TRIGGER worker_invoice_touch
  BEFORE UPDATE ON public.worker_invoices
  FOR EACH ROW EXECUTE FUNCTION public.worker_invoice_touch();

-- Server-side totals: subtotal is computed from line_items so a tampered
-- client can't invoice $0.01 for $5,000 of work. line_items shape:
-- [{description, quantity, rate_cents}] — amounts in cents like the rest
-- of the money schema.
CREATE OR REPLACE FUNCTION public.worker_invoice_compute_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE
  item jsonb;
  v_subtotal bigint := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(NEW.line_items, '[]'::jsonb)) LOOP
    v_subtotal := v_subtotal
      + COALESCE((item->>'quantity')::numeric, 1)
      * COALESCE((item->>'rate_cents')::bigint, 0);
  END LOOP;
  NEW.subtotal_cents := v_subtotal;
  NEW.total_cents := v_subtotal;
  RETURN NEW;
END;
$$;

ALTER TABLE public.worker_invoices
  ADD COLUMN IF NOT EXISTS subtotal_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cents bigint NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS worker_invoice_compute_totals ON public.worker_invoices;
CREATE TRIGGER worker_invoice_compute_totals
  BEFORE INSERT OR UPDATE ON public.worker_invoices
  FOR EACH ROW EXECUTE FUNCTION public.worker_invoice_compute_totals();
