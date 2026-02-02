import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface SendCommissionLinkRequest {
  email: string;
  repName: string;
  commissionLink: string;
  organizationName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const { email, repName, commissionLink, organizationName }: SendCommissionLinkRequest = await req.json();

    if (!email || !repName || !commissionLink) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Log without exposing full email (mask for privacy)
    const maskedEmail = email ? `${email.substring(0, 3)}***@${email.split('@')[1] || '***'}` : 'unknown';
    console.log(`Sending commission link email to ${maskedEmail} for rep`);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #22c55e;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                      ${organizationName || 'SalesReps'}
                    </h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #18181b;">
                      Hi ${repName},
                    </h2>
                    
                    <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #52525b;">
                      Your commission report is ready for review. Click the button below to view your deals and earnings breakdown.
                    </p>
                    
                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                      <tr>
                        <td align="center">
                          <a href="${commissionLink}" style="display: inline-block; padding: 14px 32px; background-color: #22c55e; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                            View My Commissions
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                      If you notice any discrepancies in your report, please contact your admin as soon as possible.
                    </p>
                    
                    <p style="margin: 16px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                      This link is unique to you and provides secure access to your commission data.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #a1a1aa; text-align: center;">
                      If you didn't expect this email, please contact your team administrator.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SalesReps <noreply@salesreps.com>",
        to: [email],
        subject: "Your Commission Report is Ready",
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Resend API error:", errorData);
      throw new Error(`Failed to send email: ${errorData}`);
    }

    const emailResponse = await res.json();
    console.log("Commission link email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-commission-link function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
