# Auth session races — deep links bouncing to /dashboard

**Class:** client-side auth race, not a route or RLS bug.

**Symptom (prod):** hard-navigating to any protected path
(`/feed`, `/events`, `/gigs`) bounced the user to `/dashboard`.
Login itself worked; SPA fallback was fine.

**Root cause chain:**
1. `AuthContext.getInitialSession` raced `supabase.auth.getSession()`
   against an 8s timeout. A cold Supabase project can take longer.
   The timeout path did `clearAuthData() + setUser(null)` — wiping a
   valid-but-slow session mid-flight.
2. `ProtectedRoute` then saw `!user && !loading` → `<Navigate to="/auth">`.
3. `PublicRoute` at `/auth` re-validated (session had landed by then)
   → `<Navigate to="/dashboard">`. Destination eaten every time.

**Compounding bug:** `fetchProfile` also raced `getProfile` with a
timeout that early-returned without `setLoading(false)` — pinning the
app on the boot spinner whenever the profile query was slow.

**Second-order cause:** a manual `refreshAuthToken()` passed a
separately-stored `flexzora-refresh-token` into
`supabase.auth.refreshSession()`, rotating it, while the client's own
`autoRefreshToken` used the `sb-*` blob. Two stores racing on a
rotating secret → `invalid_grant` → session wiped. Fixed by using
no-arg `refreshSession()` (the client's own store) and making
`validateSession` a plain `getSession()`.

**Rules going forward:**
- Never give up on session restore at a wall-clock timeout and
  *delete* auth state. Timeout → render degraded, not logout.
- One store owns refresh tokens — supabase-js's. Don't mirror and
  replay them; rotation makes the loser present a dead token.
- A `fetch failed`/`timeout` on a *dependent* query (profile) must
  release the global `loading` flag or the UI hangs with no error.
- Verify by tracing `onAuthStateChange` events in the browser console,
  not by reading the route table — this bug looked like a routing
  problem and wasn't.
