import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
    // Accept token/email from the query string (email link) or a JSON body (client invoke)
    const url = new URL(req.url);
    let token = url.searchParams.get('token');
    let email = url.searchParams.get('email');
    if ((!token || !email) && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      token = token || body.token || null;
      email = email || body.email || null;
    }
    
    if (!token || !email) {
      return new Response(
        JSON.stringify({ error: "Token and email are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Find the waitlist entry with matching email and token
    const { data: waitlistEntry, error: lookupError } = await supabase
      .from("waiting_list")
      .select("*")
      .eq("email", email)
      .eq("verification_token", token)
      .single();

    if (lookupError || !waitlistEntry) {
      // Token already consumed (link opened twice): report success idempotently.
      // No referral_code in this response — a code must only be issued to the
      // token holder, never to an arbitrary email+token submission.
      const { data: verifiedEntry } = await supabase
        .from("waiting_list")
        .select("id")
        .eq("email", email)
        .eq("status", "verified")
        .is("verification_token", null)
        .maybeSingle();
      if (verifiedEntry) {
        return new Response(
          JSON.stringify({ message: "Email already verified", already_verified: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Invalid verification token or email" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if already verified
    if (waitlistEntry.status === 'verified') {
      return new Response(
        JSON.stringify({ 
          message: "Email already verified",
          referral_code: waitlistEntry.referral_code,
          already_verified: true
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update status to verified and clear the verification token
    const { data: updatedEntry, error: updateError } = await supabase
      .from("waiting_list")
      .update({ 
        status: 'verified',
        verification_token: null // Clear the token after use
      })
      .eq("id", waitlistEntry.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating waitlist entry:", updateError);
      return new Response(
        JSON.stringify({ error: "Error verifying email" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return success response
    return new Response(
      JSON.stringify({ 
        message: "Email verified successfully",
        referral_code: updatedEntry.referral_code,
        verified: true
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing verification:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});