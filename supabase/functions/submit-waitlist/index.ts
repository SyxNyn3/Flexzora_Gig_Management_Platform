import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { nanoid } from "npm:nanoid@5.0.4";

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
    if (!requestData.email || !requestData.role_interest) {
      return new Response(
        JSON.stringify({ error: "Email and role interest are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if email already exists in the waiting list
    const { data: existingEntry, error: lookupError } = await supabase
      .from("waiting_list")
      .select("email, referral_code")
      .eq("email", requestData.email)
      .single();

    if (lookupError && lookupError.code !== "PGRST116") {
      // PGRST116 is "No rows found" which is expected if the email is not in the list
      console.error("Error checking for existing email:", lookupError);
      return new Response(
        JSON.stringify({ error: "Error checking for existing email" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If email already exists, return the existing referral code
    if (existingEntry) {
      return new Response(
        JSON.stringify({ 
          message: "Email already on waitlist", 
          referral_code: existingEntry.referral_code 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate a unique referral code
    const referralCode = nanoid(10);
    
    // Generate a verification token
    const verificationToken = nanoid(32);
    const skipVerification = Deno.env.get("WAITLIST_SKIP_EMAIL_VERIFICATION") === "true";

    // Check if referred_by_email exists and is valid
    let referredByEmail = requestData.referred_by_email;
    if (referredByEmail) {
      const { data: referrer, error: referrerError } = await supabase
        .from("waiting_list")
        .select("email")
        .eq("referral_code", referredByEmail)
        .single();

      if (referrerError) {
        // If referrer not found by code, clear it
        referredByEmail = null;
      } else if (referrer) {
        // If found by code, use the actual email
        referredByEmail = referrer.email;
      }
    }

    // Crew-card fields — added by the waitlist_crew_card migration. If the
    // remote DB hasn't applied it yet, fall back to the legacy column set and
    // stash the extra data in `notes` so nothing is lost.
    const crewCard = {
      full_name: requestData.full_name,
      company_name: requestData.company_name,
      phone: requestData.phone,
      sms_consent: Boolean(requestData.sms_consent),
      skills: Array.isArray(requestData.skills) ? requestData.skills : [],
      experience_years: requestData.experience_years,
      travel_availability: Array.isArray(requestData.travel_availability) ? requestData.travel_availability : [],
      union_affiliation: requestData.union_affiliation,
      has_vehicle: requestData.has_vehicle === undefined
        ? (Array.isArray(requestData.vehicles) && requestData.vehicles.length > 0 ? true : null)
        : Boolean(requestData.has_vehicle),
      day_rate_min: Number(requestData.day_rate_min) || null,
      instagram_handle: requestData.instagram_handle,
      profile_completeness: Number(requestData.profile_completeness) || 0,
      companies_worked: Array.isArray(requestData.companies_worked) ? requestData.companies_worked : [],
      markets_worked: Array.isArray(requestData.markets_worked) ? requestData.markets_worked : [],
      favorite_markets: Array.isArray(requestData.favorite_markets) ? requestData.favorite_markets : [],
      preferred_regions: Array.isArray(requestData.preferred_regions) ? requestData.preferred_regions : [],
      vehicles: Array.isArray(requestData.vehicles) ? requestData.vehicles : [],
      farthest_travel: requestData.farthest_travel,
      willing_farther: requestData.willing_farther === undefined ? null : Boolean(requestData.willing_farther),
      has_passport: requestData.has_passport === undefined ? null : Boolean(requestData.has_passport),
      overseas_willing: requestData.overseas_willing === undefined ? null : Boolean(requestData.overseas_willing),
      departure_readiness: requestData.departure_readiness,
      call_response_time: requestData.call_response_time,
      payment_type: requestData.payment_type,
      referred_crew: requestData.referred_crew,
    };

    const baseInsert = {
      email: requestData.email,
      role_interest: requestData.role_interest,
      production_companies_worked_with: requestData.production_companies_worked_with,
      past_communication_methods: requestData.past_communication_methods,
      desired_features: requestData.desired_features,
      challenges: requestData.challenges,
      referred_by_email: referredByEmail,
      referral_code: referralCode,
      verification_token: verificationToken,
      status: 'pending', // Will be updated to 'verified' after email verification
      market_city: requestData.market_city,
      crew_roles: Array.isArray(requestData.crew_roles) ? requestData.crew_roles : [],
      company_type: requestData.company_type,
      events_per_month: Number(requestData.events_per_month) || null,
      typical_crew_size: Number(requestData.typical_crew_size) || null,
      pain_points: Array.isArray(requestData.pain_points) ? requestData.pain_points : [],
      beta_tester: Boolean(requestData.beta_tester),
      heard_from: requestData.heard_from,
      utm_source: requestData.utm_source,
      // Beta mode: when email delivery isn't configured, treat double-entry
      // email confirmation as the proof-of-intent and skip the email step.
      verified_at: skipVerification ? new Date().toISOString() : null,
    };

    let { data: _data, error } = await supabase
      .from("waiting_list")
      .insert({ ...baseInsert, ...crewCard })
      .select()
      .single();

    if (error && error.code === '42703') {
      // crew-card columns not migrated yet — persist everything via `notes`
      ({ data: _data, error } = await supabase
        .from("waiting_list")
        .insert({ ...baseInsert, notes: JSON.stringify({ crew_card: crewCard }) })
        .select()
        .single());
    }

    if (error) {
      console.error("Error inserting into waiting list:", error);
      return new Response(
        JSON.stringify({ error: "Error adding to waitlist" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Send verification email only when verification mode is on
    if (!skipVerification) {
      try {
        const { error: emailError } = await supabase.functions.invoke('send-waitlist-verification', {
          body: {
            email: requestData.email,
            verification_token: verificationToken,
            referral_code: referralCode
          }
        });

        if (emailError) {
          console.error('Error sending verification email:', emailError);
          // Don't fail the whole process if email fails
        }
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
      }
    }

    // Return success response with the referral code
    return new Response(
      JSON.stringify({
        message: "Successfully added to waitlist",
        referral_code: referralCode,
        verification_required: !skipVerification,
        email: requestData.email
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