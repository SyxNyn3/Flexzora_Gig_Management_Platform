// Shared transactional-mail sender for the public-facing edge functions.
// Zero dependencies (no Deno imports, fetch injected) so it stays unit-testable
// from vitest exactly like _shared/ics.ts.
//
// Provider chain: Resend is the primary (branded verified sender on
// flexzora.pro). AgentMail is the backup — used only when Resend is not
// configured or explicitly fails, never as an either/or preference.

export interface MailEnv {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  AGENTMAIL_API_KEY?: string;
  AGENTMAIL_INBOX?: string;
}

export interface MailMessage {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

export type MailProvider = "resend" | "agentmail";

export interface MailResult {
  sent: boolean;
  provider: MailProvider | null;
}

const DEFAULT_FROM = "Flexzora Crew <crew@flexzora.pro>";
const DEFAULT_AGENTMAIL_INBOX = "syxnyn3@agentmail.to";

export async function sendMail(
  msg: MailMessage,
  env: MailEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<MailResult> {
  const resendKey = env.RESEND_API_KEY;
  const amKey = env.AGENTMAIL_API_KEY;
  const from = env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const inbox = env.AGENTMAIL_INBOX || DEFAULT_AGENTMAIL_INBOX;

  let sent = false;
  let provider: MailProvider | null = null;

  if (resendKey) {
    try {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
        }),
      });
      if (!res.ok) {
        console.error("Resend send failed, falling back to AgentMail:", await res.text());
      } else {
        sent = true;
        provider = "resend";
      }
    } catch (e) {
      // Network-level failure still falls through to AgentMail — a thrown
      // fetch must not skip the backup provider.
      console.error("Resend send error, falling back to AgentMail:", e);
    }
  }

  if (!sent && amKey) {
    try {
      const res = await fetchImpl(
        `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inbox)}/messages/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${amKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: msg.to,
            subject: msg.subject,
            text: msg.text,
            html: msg.html,
          }),
        },
      );
      if (!res.ok) {
        console.error("AgentMail send failed:", await res.text());
      } else {
        sent = true;
        provider = "agentmail";
      }
    } catch (e) {
      console.error("AgentMail send error:", e);
    }
  }

  return { sent, provider };
}
