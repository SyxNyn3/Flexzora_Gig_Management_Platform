-- #105 — the #44 fix revoked EXECUTE on lookup_user_by_username_or_email from
-- PUBLIC, which also stripped service_role: the lookup-user edge function
-- (service-role client) then 500s and username sign-in is dead. Re-grant to
-- service_role only; anon/authenticated/PUBLIC stay revoked, so the
-- enumeration oracle stays closed for API callers.
GRANT EXECUTE ON FUNCTION lookup_user_by_username_or_email(text) TO service_role;
