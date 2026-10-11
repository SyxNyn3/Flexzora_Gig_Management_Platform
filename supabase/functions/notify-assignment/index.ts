import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// SMS notifications on shift-assignment lifecycle changes.
//
// Contract: { assignment_id, kind } — the function resolves the assignment
// server-side, verifies the CALLER is a party to it (the assigned worker, or
// the company that owns the event), then picks the recipient and copy from
// `kind`. Clients never supply a phone number or message text — a caller can
// therefore never turn this into an SMS cannon aimed at arbitrary numbers.
//
//   kind                  → recipient
//   offered               → worker   (company sent a direct-book offer)
//   applied               → company  (worker applied to a public call)
//   confirmed_by_worker   → company  (worker accepted an offer)
//   confirmed_by_company  → worker   (company accepted an application)
//   declined              → company  (worker declined an offer)
//   withdrawn             → company  (worker backed out of a booking)
//   rejected              → worker   (company rejected an application)
//   no_show               → worker   (company flagged a no-show)
//
// Without TWILIO_* secrets configured the function is a graceful no-op — same
// posture as the Stripe sandbox: the call succeeds, nothing is sent, and the
// reason comes back in the payload so callers can log it.

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
const twilioFrom = Deno.env.get("TWILIO_FROM_NUMBER");

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type NotifyKind =
  | "offered" | "applied"
  | "confirmed_by_worker" | "confirmed_by_company"
  | "declined" | "withdrawn" | "rejected" | "no_show";

const RECIPIENT: Record<NotifyKind, "worker" | "company"> = {
  offered: "worker",
  applied: "company",
  confirmed_by_worker: "company",
  confirmed_by_company: "worker",
  declined: "company",
  withdrawn: "company",
  rejected: "worker",
  no_show: "worker",
};

const VALID_KINDS = new Set<string>(Object.keys(RECIPIENT));

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // Verify the caller's JWT.
    const authHeader = req.headers.get("Authorization");
    const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return json({ error: "No authorization header" }, 401);

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(jwt);
    if (authError || !user) return json({ error: "Invalid or expired token" }, 401);

    const { assignment_id, kind } = await req.json();
    if (!assignment_id || typeof assignment_id !== "string" || !VALID_KINDS.has(kind)) {
      return json({ error: "assignment_id and a valid kind are required" }, 400);
    }

    // Resolve the full context in one query.
    const { data: assignment, error: assignmentError } = await supabaseAdmin
      .from("shift_assignments")
      .select(`
        id, worker_id, status,
        worker:profiles!shift_assignments_worker_id_fkey(full_name, phone, user_id),
        shift:shifts!inner(
          id, role_name, starts_at,
          event:events!inner(
            id, name, company_id,
            company:companies!inner(id, name, created_by, contact_phone)
          )
        )
      `)
      .eq("id", assignment_id)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return json({ error: "Assignment not found" }, 404);

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!callerProfile) return json({ error: "Profile not found" }, 403);

    const worker = assignment.worker as { full_name: string; phone: string | null; user_id: string };
    const shift = assignment.shift as {
      role_name: string; starts_at: string;
      event: { name: string; company: { name: string; created_by: string; contact_phone: string | null } };
    };
    const company = shift.event.company;

    // Authorization: caller is the assigned worker or the company owner.
    const isWorker = assignment.worker_id === callerProfile.id;
    const isCompany = company.created_by === callerProfile.id;
    if (!isWorker && !isCompany) {
      return json({ error: "Not a party to this assignment" }, 403);
    }

    const recipientKind = RECIPIENT[kind as NotifyKind];
    const to = recipientKind === "worker" ? worker.phone : company.contact_phone;
    if (!to) {
      return json({ sent: false, reason: `no ${recipientKind} phone on file` });
    }

    const when = `${fmtDate(shift.starts_at)} ${fmtTime(shift.starts_at)}`;
    const firstName = (worker.full_name || "Crew").split(" ")[0];
    const copyFor = (k: NotifyKind): string => {
      switch (k) {
        case "offered":
          return `Flexzora: ${company.name} sent you a direct-book offer — ${shift.role_name} at ${shift.event.name}, ${when}. Open the app to accept or decline.`;
        case "applied":
          return `Flexzora: ${worker.full_name} applied to ${shift.role_name} at ${shift.event.name}, ${when}. Review in Candidates.`;
        case "confirmed_by_worker":
          return `Flexzora: ${worker.full_name} confirmed ${shift.role_name} at ${shift.event.name}, ${when}.`;
        case "confirmed_by_company":
          return `Flexzora: You're confirmed for ${shift.role_name} at ${shift.event.name} (${company.name}), ${when}. See you there, ${firstName}.`;
        case "declined":
          return `Flexzora: ${worker.full_name} declined ${shift.role_name} at ${shift.event.name}, ${when}.`;
        case "withdrawn":
          return `Flexzora: ${worker.full_name} withdrew from ${shift.role_name} at ${shift.event.name}, ${when}. Slot is open.`;
        case "rejected":
          return `Flexzora: ${company.name} went another direction for ${shift.role_name} at ${shift.event.name}, ${when}. More calls on the board.`;
        case "no_show":
          return `Flexzora: You were flagged as a no-show for ${shift.role_name} at ${shift.event.name} by ${company.name}. Reply in-app if this is a mistake.`;
      }
    };
    const body = copyFor(kind as NotifyKind);

    // Graceful no-op until Twilio is provisioned.
    if (!twilioSid || !twilioToken || !twilioFrom) {
      return json({ sent: false, reason: "twilio not configured", preview: body });
    }

    const twilioResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${twilioSid}:${twilioToken}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: twilioFrom, Body: body }),
      }
    );

    if (!twilioResp.ok) {
      const detail = await twilioResp.text();
      console.error(`Twilio send failed (${twilioResp.status}):`, detail);
      return json({ sent: false, reason: "twilio send failed" }, 502);
    }

    return json({ sent: true });
  } catch (error) {
    console.error("notify-assignment error:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
