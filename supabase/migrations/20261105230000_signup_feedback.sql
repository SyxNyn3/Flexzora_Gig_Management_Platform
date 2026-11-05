-- Signup-flow feedback: the waitlist's last section asks how the form
-- itself felt (confusing spots, what to change). Needs its own column —
-- `notes` is already used as the JSON overflow stash, and the other
-- free-text columns are scoped to different questions.
ALTER TABLE public.waiting_list
  ADD COLUMN IF NOT EXISTS signup_feedback text;
