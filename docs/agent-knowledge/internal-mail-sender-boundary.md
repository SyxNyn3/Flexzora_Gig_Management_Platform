# Internal mail senders need their own authorization boundary

`verify_jwt = true` only proves the caller has a valid user or service JWT.
It does not mean the caller is internal.

`send-waitlist-verification` sends branded transactional email to any
address supplied by the caller. Leaving it open to ordinary user sessions
would let an attacker spend our email quota and damage sender reputation.
The function now requires the service-role bearer. Public callers get 401;
submit/resend waitlist functions invoke it through the service-role client.

Bearer tokens must never be logged. The old no-provider path logged the
waitlist verification link, which is a bearer credential in URL form. The
provider chain now fails with 502 instead of claiming success or printing
the link.
