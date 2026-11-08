import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { sendMail } from "../_shared/mail.ts";
import { makeLogger, logOutbound } from "../_shared/logOutbound.ts";

// Welcome-to-beta email. Called by the waiting_list claim trigger through
// pg_net — authenticated by the X-Internal-Secret shared secret, NOT a user
// JWT (verify_jwt = false in config.toml; same dispatch pattern as
// send-push / alert-digest).
//
// Fires exactly once per waitlist row: the trigger only POSTs when
// claimed_by_profile_id transitions NULL -> value, and a row can only be
// claimed once ever. The function itself is also idempotent-ish — a replayed
// call would send a second email, so the trigger is the real guard and this
// endpoint is not publicly reachable anyway.
//
// Two templates: founding beta testers (waitlist.beta_tester = true) get the
// "help shape early builds" copy; everyone else gets the standard welcome.

const internalSecret = Deno.env.get("INTERNAL_SHARED_SECRET") ?? "";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const mailLog = makeLogger();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const APP_URL = Deno.env.get("APP_BASE_URL") || "https://flexzora.pro";

// Minimal inline-styled HTML — email clients strip <style> blocks variably,
// so layout lives in attributes. Same visual language as the waitlist
// verification email for brand consistency.
function emailHtml(opts: {
  firstName: string;
  betaTester: boolean;
  roleInterest: string | null;
}): string {
  const { firstName, betaTester, roleInterest } = opts;
  const roleLine = roleInterest === 'company'
    ? 'your production company'
    : roleInterest === 'both'
      ? 'crew work and your company'
      : 'crew work';
  const betaBlock = betaTester
    ? `<p style="margin: 16px 0;">You're flagged as a <strong>founding beta tester</strong> — that means early builds land with you first. When something breaks or feels off, tell us; it shapes what gets fixed before wider release.</p>`
    : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; overflow: hidden;">
      <div style="background: #111827; padding: 24px 32px;">
        <span style="color: #fff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">FlexZora</span>
      </div>
      <div style="padding: 32px;">
        <h1 style="font-size: 22px; margin: 0 0 16px; color: #111827;">You're in${firstName ? `, ${firstName}` : ''}.</h1>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
          Your waitlist spot is claimed and your account is live. FlexZora is the crew OS for live events —
          calls, pay, paperwork, and splits in one place, built for ${roleLine}.
        </p>
        ${betaBlock}
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 16px 0 24px;">
          Head to your dashboard to finish setup — the start-pack checklist walks you through
          the paperwork companies will ask for, and the ledger starts tracking what you're owed.
        </p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${APP_URL}/dashboard" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 600;">Open FlexZora</a>
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          Questions or something not working right? Just reply to this email — it reaches the team.
        </p>
      </div>
      <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
        <p style="color: #666; font-size: 12px; margin: 0;">
          © 2026 FlexZora · <a href="https://flexzora.pro" style="color: #2563eb; text-decoration: none;">flexzora.pro</a>
        </p>
      </div>
    </div>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    // Shared-secret gate — identical contract to send-push / alert-digest.
    if (!internalSecret || req.headers.get("X-Internal-Secret") !== internalSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { waitlist_id: waitlistId } = await req.json().catch(() => ({}));
    if (!waitlistId || typeof waitlistId !== "string") {
      return json({ error: "waitlist_id required" }, 400);
    }

    // Service-role read of the claimed row — email, name, beta flag and role
    // interest all live on waiting_list; the claim itself proves the mailbox
    // was verified (claim requires status='verified' + confirmed auth email).
    const { data: row, error } = await supabaseAdmin
      .from("waiting_list")
      .select("id, email, full_name, beta_tester, role_interest, claimed_by_profile_id")
      .eq("id", waitlistId)
      .maybeSingle();
    if (error) throw error;
    if (!row?.email) return json({ error: "waitlist row not found" }, 404);
    // Defensive: only send for actually-claimed rows. A stray/replayed call
    // against an unclaimed row must not email someone who never signed up.
    if (!row.claimed_by_profile_id) {
      return json({ skipped: "unclaimed" });
    }

    const firstName = (row.full_name ?? "").trim().split(/\s+/)[0] || "";
    const betaTester = row.beta_tester === true;
    const subject = betaTester
      ? "You're in — FlexZora founding beta"
      : "You're in — welcome to FlexZora";
    const html = emailHtml({
      firstName,
      betaTester,
      roleInterest: row.role_interest ?? null,
    });
    const text = `You're in${firstName ? `, ${firstName}` : ""}. Your FlexZora account is live — open your dashboard: ${APP_URL}/dashboard`;

    const { sent } = await sendMail(
      { to: [row.email], subject, html, text },
      {
        RESEND_API_KEY: Deno.env.get("RESEND_API_KEY"),
        RESEND_FROM_EMAIL: Deno.env.get("RESEND_FROM_EMAIL"),
        AGENTMAIL_API_KEY: Deno.env.get("AGENTMAIL_API_KEY"),
        AGENTMAIL_INBOX: Deno.env.get("AGENTMAIL_INBOX"),
      },
    );

    await logOutbound(mailLog, {
      recipient_profile_id: row.claimed_by_profile_id,
      recipient_contact: row.email,
      channel: "email",
      template: betaTester ? "welcome_beta" : "welcome",
      subject,
      body_preview: text,
      status: sent ? "sent" : "failed",
      ref_type: "waitlist",
      ref_id: row.id,
    });

    if (!sent) return json({ error: "mail provider failed" }, 502);
    return json({ sent: true, beta: betaTester });
  } catch (err) {
    console.error("send-welcome-email error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
