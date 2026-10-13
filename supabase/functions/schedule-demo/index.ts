import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Create a Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Parse the request body
    const requestData = await req.json();
    
    // Validate required fields
    const requiredFields = [
      'company_name', 
      'contact_name', 
      'contact_email', 
      'contact_phone',
      'company_size',
      'industry_focus',
      'num_workers_managed',
      'annual_gigs',
      'current_software',
      'communication_methods',
      'payroll_process',
      'pain_points',
      'preferred_date',
      'preferred_time'
    ];
    
    const missingFields = requiredFields.filter(field => !requestData[field]);

    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missingFields.join(', ')}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Basic email sanity check — this is a public endpoint.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(requestData.contact_email))) {
      return new Response(
        JSON.stringify({ error: "Invalid contact email" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Persist the demo request. preferred_date may arrive in any of a few
    // formats; reject anything that doesn't parse to a real date.
    const preferredDate = new Date(requestData.preferred_date);
    if (Number.isNaN(preferredDate.getTime())) {
      return new Response(
        JSON.stringify({ error: "Invalid preferred_date" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: demoRequest, error: insertError } = await supabase
      .from("demo_requests")
      .insert({
        company_name: String(requestData.company_name),
        contact_name: String(requestData.contact_name),
        contact_email: String(requestData.contact_email),
        contact_phone: String(requestData.contact_phone),
        company_website: requestData.company_website || null,
        company_size: requestData.company_size ?? null,
        industry_focus: requestData.industry_focus ?? null,
        num_workers_managed: requestData.num_workers_managed ?? null,
        annual_gigs: requestData.annual_gigs ?? null,
        current_software: requestData.current_software ?? null,
        communication_methods: String(requestData.communication_methods),
        payroll_process: requestData.payroll_process ?? null,
        pain_points: String(requestData.pain_points),
        preferred_date: preferredDate.toISOString().slice(0, 10),
        preferred_time: String(requestData.preferred_time),
        additional_notes: requestData.additional_notes || null,
        has_roster: Boolean(requestData.has_roster),
        has_scheduling_docs: Boolean(requestData.has_scheduling_docs),
        has_payment_docs: Boolean(requestData.has_payment_docs),
        marketing_consent: Boolean(requestData.marketing_consent),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error storing demo request:", insertError);
      return new Response(
        JSON.stringify({ error: "Error scheduling demo" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Notify the founder when email is configured. Without RESEND_API_KEY +
    // DEMO_NOTIFY_EMAIL the request still lands in demo_requests and the
    // admin triage tab — this is additive, never blocks the submission.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const notifyTo = Deno.env.get("DEMO_NOTIFY_EMAIL");
    if (resendKey && notifyTo) {
      try {
        const notify = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Flexzora <onboarding@resend.dev>",
            to: [notifyTo],
            subject: `Demo request: ${requestData.company_name}`,
            html: `<h2>New demo request</h2>
              <p><b>${requestData.company_name}</b> — ${requestData.contact_name}<br>
              ${requestData.contact_email} · ${requestData.contact_phone}</p>
              <p>Workers: ${requestData.num_workers_managed ?? "?"} · Gigs/yr: ${requestData.annual_gigs ?? "?"}<br>
              Current stack: ${requestData.current_software ?? "?"}</p>
              <p>Preferred: ${requestData.preferred_date} ${requestData.preferred_time}</p>
              <p>Pain: ${requestData.pain_points}</p>
              ${requestData.additional_notes ? `<p>Notes: ${requestData.additional_notes}</p>` : ""}`,
          }),
        });
        if (!notify.ok) console.error("Resend notify failed:", await notify.text());
      } catch (e) {
        console.error("Resend notify error:", e);
      }
    } else {
      console.log(`Demo request stored (notify skipped — no email config): ${requestData.company_name} <${requestData.contact_email}>`);
    }

    return new Response(
      JSON.stringify({
        message: "Demo request successfully submitted",
        demo_id: demoRequest.id,
        status: "new"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});