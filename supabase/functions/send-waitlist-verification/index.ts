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
    const { email, verification_token, referral_code } = await req.json();
    
    if (!email || !verification_token) {
      return new Response(
        JSON.stringify({ error: "Email and verification token are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create verification link
    const verificationLink = `${req.headers.get('origin') || 'http://localhost:3000'}/waitlist/verify?token=${verification_token}&email=${encodeURIComponent(email)}`;

    // In a production environment, you would send an actual email here
    // For now, we'll just log the verification link and return success
    console.log(`Verification email would be sent to: ${email}`);
    console.log(`Verification link: ${verificationLink}`);
    
    // In production, you would integrate with an email service like:
    // - Supabase Email (if available)
    // - SendGrid
    // - AWS SES
    // - Resend
    // - Mailgun
    
    // Example email content:
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
              © 2024 FlexZora. All rights reserved.
            </p>
          </div>
        </div>
      `
    };

    // Return success response
    return new Response(
      JSON.stringify({ 
        message: "Verification email sent successfully",
        verification_link: verificationLink // For testing purposes
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