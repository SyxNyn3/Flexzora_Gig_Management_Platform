# Public Form / Endpoint Abuse Defenses

Lessons from hardening the Flexzora waitlist — a public form writing to a
public-INSERT table through an edge function + RPC.

---

## 1. Public write paths get spammed — assume it

**What:** Any form backed by a public API (anon key, `verify_jwt=false`
edge function, public INSERT policy) will eventually be hit by bots.

**Defenses applied (layered):**

- **Honeypot input** — invisible `<input>` off-screen (`aria-hidden`,
  `tabIndex={-1}`, `autoComplete="off"`). Humans can't see it; bots fill
  every field. If filled → silent fake success (render the success screen,
  write nothing, return nothing suspicious). Silent, because an error
  tells the bot how to adapt.
- **Minimum fill time** — `Date.now()` at mount; submits under ~2s get
  the same silent fake success. Humans can't complete this form that fast.
- **Server dedupe** — the edge function keys on email and returns the
  existing referral code for repeats (idempotent; replays are harmless).
- **Per-IP cap on the RPC** — see postgres doc §3.
- **What we did NOT need:** a global inserts-per-minute cap. During a legit
  viral burst that's the thing that *breaks* the site. Rate-limit per
  identity (IP, email, account), never globally, on the hot path.

**Prevention rule:** every public form ships with honeypot + min-time +
server dedupe. Captcha (Turnstile/hCaptcha) only when abuse actually
materializes — it's free but adds friction to every real signup.

---

## 2. Column-level writability — the RLS blind spot — HIGH

**What:** `waiting_list` has `INSERT ... WITH CHECK (true)` for `public`.
RLS controls *rows*, not *columns* — a direct PostgREST insert can set
`status='verified'`, `referral_count=999`, `verified_at=now()`. The edge
function carefully controls those fields; the raw table doesn't.

**Why it happens:** "the function owns the insert path" is a convention,
not a constraint. Anyone with the anon key skips the function entirely.

**Fix applied:** BEFORE INSERT trigger `waitlist_sanitize_anon_insert`
resets server-owned columns whenever the caller isn't `service_role`
(detected via `request.jwt.claims ->> 'role'` — NOT `current_user`,
which returns the definer owner inside SECURITY DEFINER).
Force-reset (never trust caller): `status`, `verified_at`,
`verification_sent_at`, `referral_count`, `profile_completeness`,
`signup_ip`, `created_at` (backdating would jump the waitlist queue),
`referral_code`, `verification_token`.

**Verified live:** hostile REST insert with `status='verified'`,
`referral_count=999`, `verification_token='known-token-123'`,
`referral_code='HACKED1'`, `profile_completeness=100` → all reset to
pending/0/null/server-uuids. Legit edge-function insert (service_role)
untouched — its nanoid `referral_code` survived.

**Gotcha discovered:** PostgREST `Prefer: return=representation` runs the
SELECT inside the same transaction. If the caller lacks SELECT policy on
the row, PostgREST returns `42501 RLS violation` and the INSERT rolls
back — the error *looks* like the insert was RLS-denied but it's really
the read-back. Debug with `Prefer` omitted or `return=minimal`.

**Detection:**
```sql
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where grantee='anon' and privilege_type in ('INSERT','UPDATE');
```
Then ask for each writable table: which columns must the server own?

**Prevention rule:** for every anon-writable table, list server-owned
columns and sanitize them in a BEFORE trigger keyed on the caller role —
or revoke column INSERT/UPDATE privileges for anon. Same class of bug as
mass-assignment on ORMs.

---

## 3. Enumeration & credential leaks hide in "helpful" responses — MEDIUM

Two found in the same codebase:

- **404 on lookup:** `resend-waitlist-verification` returned
  `"Email not found in waitlist"` — an oracle for "is this person signed
  up?". Fix: always return generic success
  (`"If that email is on the list, a new link is on its way"`).
- **Duplicate-return:** `submit-waitlist` returned the existing row's
  `referral_code` on repeat signup. The code is the bearer credential
  for `waitlist_referral_status` → POST anyone's email, get their
  position/referral data. Fix: `already_registered: true` and no code;
  the owner recovers their link through the email-verified path.

**Prevention rule:** before returning a record identifier from a public
endpoint, ask: "does the caller prove ownership, or just know the lookup
key?" Email alone proves nothing. Same for distinct error codes — "not
found" vs "wrong password" is enumeration fuel.

---

## 4. Public edge functions need their own guards — not just the form

Client-side honeypot/min-time stops casual bots, but nothing stops a
script hitting the endpoint directly. Every `verify_jwt = false`
function got audited:

- `submit-waitlist` — added `_hp` honeypot + 10/min per-IP cap via
  `waitlist_rpc_hits`.
- `schedule-demo` — added `_hp` honeypot + 5/min per-IP cap + 24h
  same-email dedup (it sends a notify email per request — without the
  cap it was an inbox-flood/cost vector).
- `resend-waitlist-verification` — already had 60s/email throttle.
- `verify-waitlist-email` — nanoid(32) token + email pair; brute-force
  infeasible, no cap needed.
- `send-push`/`alert-digest` — `X-Push-Secret` internal credential.
- `stripe-webhook` — Stripe signature, not a JWT (correct — Stripe
  can't hold one).
- `ics-feed` — unguessable `?token=` capability URL.
- `lookup-user` — rejects `@` inputs (no email→account oracle).

**Prevention rule:** for each public function ask: what does one call
cost (row write? email send? SMS send?) and what stops a loop? Put the
answer in the function — per-IP cap, per-identity throttle, dedup
window — never rely on the frontend.

---

## 5. Internal functions must not assume their caller — MEDIUM

The revoked-execute list existed because functions DO check
`current_profile_id()`/`owns_shift()` internally. Both halves matter:

- Trigger/cascade functions (`cascade_*`, `notify_*`, `guard_*`) should
  never be API-callable at all — revoking EXECUTE is free safety.
- Business RPCs keep `authenticated` execute + internal identity checks —
  defense in depth: the grant says *who may call*, the body says *what
  they're allowed to do*.

**Prevention rule:** `SECURITY DEFINER` + public grant + no internal
auth check is the fatal triangle. Any two is manageable; all three is a
bug waiting for a writeup.

---

## 6. Secrets hygiene verified

- `.env.local` gitignored + untracked — confirmed via `git check-ignore`.
- `VITE_*`-prefixed vars are bundled into the client → only
  designed-public values (`ANON_KEY`, `STRIPE_PUBLISHABLE_KEY`) may carry
  that prefix. `SUPABASE_ACCESS_TOKEN`, `TWILIO_*`, `PICA_*` correctly
  carry no `VITE_` prefix.
- Edge functions use `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- Stale credential found: `SUPABASE_ACCESS_TOKEN` PAT expired — rotate it.

**Prevention rule:** a secret never gets a public bundler prefix; client
code only ever sees `VITE_SUPABASE_ANON_KEY` — which is *designed* to be
public (RLS is the actual boundary).
