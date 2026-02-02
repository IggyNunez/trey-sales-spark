import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface InviteEmailRequest {
  email: string;
  token?: string;
  inviteType: 'whitelabel' | 'sales_rep' | 'portal_access' | 'client_admin' | 'admin';
  closerName?: string;
  inviterName?: string;
  baseUrl?: string;
  organizationId?: string;
  organizationName?: string;
  role?: 'admin' | 'member';
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const { email, token, inviteType, closerName, inviterName, baseUrl, organizationId, organizationName, role }: InviteEmailRequest = await req.json();
    
    // Log without exposing full email (mask for privacy)
    const maskedEmail = email ? `${email.substring(0, 3)}***@${email.split('@')[1] || '***'}` : 'unknown';
    console.log(`Sending invite email to ${maskedEmail} for ${inviteType}`);

    // Default to the Vercel domain for all organizations
    const defaultBaseUrl = 'https://sales-spark-replica.vercel.app';
    let appBaseUrl = baseUrl || defaultBaseUrl;

    // If organizationId provided, try to fetch custom domain from portal_settings
    if (organizationId && !baseUrl) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: portalSettings } = await supabase
          .from('portal_settings')
          .select('custom_domain')
          .eq('organization_id', organizationId)
          .maybeSingle();
        
        if (portalSettings?.custom_domain) {
          const domain = portalSettings.custom_domain.trim();
          if (domain.startsWith('http://') || domain.startsWith('https://')) {
            appBaseUrl = domain.replace(/\/$/, '');
          } else {
            appBaseUrl = `https://${domain}`;
          }
          console.log(`Using custom domain: ${appBaseUrl}`);
        }
      } catch (err) {
        console.error('Error fetching portal settings:', err);
        // Continue with default URL
      }
    }
    
    // Handle different invite types
    const isPortalAccess = inviteType === 'portal_access';
    const isWhitelabel = inviteType === 'whitelabel';
    const isClientAdmin = inviteType === 'client_admin';

    const isOrgMember = inviteType === 'admin';
    
    let inviteLink: string;
    let subject: string;
    let roleDescription: string;

    if (isPortalAccess) {
      inviteLink = `${appBaseUrl}/rep?name=${encodeURIComponent(closerName || '')}`;
      subject = "Your Portal Access Link";
      roleDescription = `You can access your portal to view your assigned calls and submit post-call forms using the link below.`;
    } else if (isClientAdmin) {
      inviteLink = `${appBaseUrl}/accept-invite?token=${token}`;
      subject = organizationName
        ? `You've been invited to manage ${organizationName}`
        : "You've been invited as an Admin";
      roleDescription = organizationName
        ? `You've been invited as an administrator for <strong>${organizationName}</strong>. You'll have full access to manage the dashboard, team, integrations, and analytics.`
        : "You'll have full administrative access to manage your organization's dashboard, team, integrations, and analytics.";
    } else if (isOrgMember) {
      inviteLink = `${appBaseUrl}/accept-invite?token=${token}`;
      const orgDisplay = organizationName || 'the organization';
      const roleDisplay = role === 'admin' ? 'an Admin' : 'a Member';
      subject = `You've been invited to join ${orgDisplay}`;
      roleDescription = role === 'admin'
        ? `As an admin, you'll have full access to manage ${orgDisplay}'s dashboard, team, and settings.`
        : `As a member, you'll be able to view ${orgDisplay}'s dashboard and data.`;
    } else if (isWhitelabel) {
      inviteLink = `${appBaseUrl}/accept-invite?token=${token}`;
      subject = "You've been invited to SalesTracker as a Whitelabel Partner";
      roleDescription = "As a whitelabel partner, you'll have full access to manage your own team and track performance.";
    } else {
      inviteLink = `${appBaseUrl}/accept-invite?token=${token}`;
      subject = "You've been invited to join SalesTracker as a Sales Rep";
      roleDescription = closerName
        ? `You've been linked to the closer name "${closerName}" and will be able to see your assigned calls and submit post-call forms.`
        : "You'll be able to see your assigned calls and submit post-call forms.";
    }

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
                  <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e4e4e7;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #18181b;">
                      SalesTracker
                    </h1>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #18181b;">
                      You're Invited!
                    </h2>
                    
                    <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #52525b;">
                      ${isPortalAccess
                        ? `Here's your portal access link for SalesTracker.`
                        : isClientAdmin
                          ? `${inviterName ? `${inviterName} has invited you` : "You've been invited"} to manage ${organizationName || 'an organization'} on SalesTracker.`
                          : isOrgMember
                            ? `${inviterName ? `${inviterName} has invited you` : "You've been invited"} to join <strong>${organizationName || 'the organization'}</strong> as ${role === 'admin' ? 'an <strong>Admin</strong>' : 'a <strong>Member</strong>'}.`
                            : `${inviterName ? `${inviterName} has invited you` : "You've been invited"} to join SalesTracker as a <strong>${isWhitelabel ? 'Whitelabel Partner' : 'Sales Rep'}</strong>.`
                      }
                    </p>
                    
                    <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #52525b;">
                      ${roleDescription}
                    </p>
                    
                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <a href="${inviteLink}" style="display: inline-block; padding: 14px 32px; background-color: #18181b; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                            ${isPortalAccess ? 'Access Your Portal' : isClientAdmin ? 'Set Up Your Account' : 'Accept Invitation'}
                          </a>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                      Or copy and paste this link into your browser:
                    </p>
                    <p style="margin: 8px 0 0; font-size: 14px; line-height: 20px; color: #3b82f6; word-break: break-all;">
                      ${inviteLink}
                    </p>
                    
                    ${(!isPortalAccess) ? `<p style="margin: 24px 0 0; font-size: 14px; line-height: 20px; color: #71717a;">
                      This invitation expires in 7 days.
                    </p>` : ''}
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 24px 40px; background-color: #fafafa; border-top: 1px solid #e4e4e7; border-radius: 0 0 12px 12px;">
                    <p style="margin: 0; font-size: 12px; line-height: 18px; color: #a1a1aa; text-align: center;">
                      If you didn't expect this invitation, you can safely ignore this email.
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

    // Send email using Resend API directly
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "SalesTracker <noreply@salesreps.com>",
        to: [email],
        subject: subject,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Resend API error:", errorData);
      throw new Error(`Failed to send email: ${errorData}`);
    }

    const emailResponse = await res.json();
    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-invite-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
