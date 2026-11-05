import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { sendMail } from "../_shared/mail.ts";

// CORS headers for browser requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Create a Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const _supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Internal sender only: submit-waitlist / resend-waitlist-verification
    // invoke this through the service-role client. verify_jwt=true at the
    // gateway still lets any valid user session through, so re-check the
    // bearer here — otherwise anyone could spend our email quota sending
    // branded mail to arbitrary recipients.
    const authHeader = req.headers.get("authorization") || "";
    if (!supabaseServiceKey || authHeader !== `Bearer ${supabaseServiceKey}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse the request body
    const { email, verification_token, referral_code: _referral_code } = await req.json();
    
    if (!email || !verification_token) {
      return new Response(
        JSON.stringify({ error: "Email and verification token are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verification link — always the production site URL. The Origin
    // header is not trusted here: server-side calls have none and a
    // forged origin would send users to an attacker domain.
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://flexzora.pro";
    const verificationLink = `${siteUrl}/waitlist/verify?token=${verification_token}&email=${encodeURIComponent(email)}`;

    const emailContent = {
      to: email,
      subject: 'Verify your email for FlexZora Waitlist',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <div style="background: linear-gradient(135deg, #2474e5 0%, #3fc380 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to FlexZora!</h1>
          </div>
          <div style="padding: 40px 20px; background: white;">
            <h2 style="color: #333; margin-bottom: 20px;">Verify Your Email Address</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 30px;">
              Thank you for joining the FlexZora waitlist! Please click the button below to verify your email address and complete your registration.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" style="background: linear-gradient(135deg, #2474e5 0%, #3fc380 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Verify Email Address
              </a>
            </div>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              If you didn't request this, you can safely ignore this email.
            </p>
            <p style="color: #666; font-size: 14px;">
              If the button doesn't work, you can copy and paste this link: <br>
              <a href="${verificationLink}" style="color: #2474e5;">${verificationLink}</a>
            </p>
          </div>
          <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
            <p style="color: #666; font-size: 12px; margin: 0;">
              © 2026 FlexZora · <a href="https://flexzora.pro" style="color: #2474e5; text-decoration: none;">flexzora.pro</a>
            </p>
          </div>
        </div>
      `
    };

    // Send via the shared provider chain — Resend primary (branded
    // flexzora.pro sender, verified domain), AgentMail fallback on explicit
    // failure. A verification email lost to a provider hiccup is a lost
    // signup; with no working provider we fail loudly instead of claiming
    // success. The bearer link is never logged or returned.
    const textBody = `Welcome to FlexZora! Verify your email to complete waitlist registration:\n\n${verificationLink}\n\nIf you didn't request this, ignore this email.`;
    const { sent } = await sendMail(
      {
        to: [email],
        subject: emailContent.subject,
        html: emailContent.html,
        text: textBody,
      },
      {
        RESEND_API_KEY: Deno.env.get("RESEND_API_KEY"),
        RESEND_FROM_EMAIL: Deno.env.get("RESEND_FROM_EMAIL"),
        AGENTMAIL_API_KEY: Deno.env.get("AGENTMAIL_API_KEY"),
        AGENTMAIL_INBOX: Deno.env.get("AGENTMAIL_INBOX"),
      },
    );
    if (!sent) {
      return new Response(JSON.stringify({ error: "Failed to send verification email" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Return success response. Never return the verification link — it is a
    // bearer token; handing it to the HTTP caller defeats email verification.
    return new Response(
      JSON.stringify({
        message: "Verification email sent successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending verification email:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send verification email" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});