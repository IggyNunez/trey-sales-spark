/**
 * Shared CORS configuration for all edge functions.
 *
 * SECURITY: Configure allowed origins based on your deployment.
 * The default allows your production domain and localhost for development.
 *
 * Usage in edge functions:
 * ```typescript
 * import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";
 *
 * serve(async (req) => {
 *   // Handle CORS preflight
 *   if (req.method === "OPTIONS") {
 *     return handleCors(req);
 *   }
 *
 *   // Use getCorsHeaders for origin-aware responses
 *   const origin = req.headers.get("origin");
 *   return new Response(JSON.stringify({ data }), {
 *     headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" }
 *   });
 * });
 * ```
 */

// Allowed origins - configure based on your deployment
const ALLOWED_ORIGINS = [
  // Production domain (Vercel)
  "https://sales-spark-replica.vercel.app",
  // Legacy domain (can be removed once migration is complete)
  "https://data.salesreps.com",
  "https://www.data.salesreps.com",
  // Lovable preview domains
  "https://sales-spark-replica.lovable.app",
  "https://lovable.dev",
  // Development
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];

/**
 * Get CORS headers with origin validation.
 * Returns headers that allow the request origin if it's in the allowed list,
 * otherwise returns headers with the first allowed origin (for security).
 */
export function getCorsHeaders(requestOrigin?: string | null, additionalHeaders?: string): Record<string, string> {
  // Check if origin is allowed
  const isAllowed = requestOrigin && (
    // Exact match against allowed list
    ALLOWED_ORIGINS.includes(requestOrigin) ||
    // Match lovable.dev subdomains
    requestOrigin.includes('.lovable.dev') || 
    requestOrigin.includes('.lovable.app') ||
    // Match Lovable preview build domains (e.g., *.lovableproject.com)
    requestOrigin.includes('.lovableproject.com') ||
    // Match vercel.app subdomains  
    requestOrigin.includes('.vercel.app') ||
    // Match Lovable preview domains (e.g., id-preview--xxx.lovable.app)
    requestOrigin.match(/^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.lovable\.app$/)
  );
  
  const origin = isAllowed ? requestOrigin : ALLOWED_ORIGINS[0];

  const baseHeaders = "authorization, x-client-info, apikey, content-type, x-function-name, x-portal-token";
  const allowHeaders = additionalHeaders ? `${baseHeaders}, ${additionalHeaders}` : baseHeaders;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Get CORS headers for webhook endpoints that need to accept requests from external services.
 * These use wildcard but should validate via signatures.
 */
export function getWebhookCorsHeaders(additionalHeaders?: string): Record<string, string> {
  const baseHeaders = "authorization, x-client-info, apikey, content-type";
  const allowHeaders = additionalHeaders ? `${baseHeaders}, ${additionalHeaders}` : baseHeaders;

  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": allowHeaders,
  };
}

/**
 * Default CORS headers for responses.
 *
 * NOTE: This is intentionally permissive ("*") because many functions historically used
 * `corsHeaders` directly instead of `getCorsHeaders(req.headers.get("origin"))`.
 * If you need strict origin checks, use `getCorsHeaders(origin)`.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-function-name, x-portal-token",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/**
 * Handle CORS preflight requests.
 */
export function handleCors(req: Request): Response {
  const origin = req.headers.get("origin");
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}
