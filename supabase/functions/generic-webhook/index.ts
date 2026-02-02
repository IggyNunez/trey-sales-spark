import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

// Sanitize sensitive data from objects for logging
function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveKeys = ['email', 'phone', 'signature', 'api_key', 'token', 'authorization', 'password', 'secret', 'key', 'amount', 'total'];
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    if (sensitiveKeys.some(s => keyLower.includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = Array.isArray(value) ? '[Array]' : '[Object]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ============= JSON PATH EXTRACTION =============
// Extract value from nested object using dot notation path (e.g., "data.customer.email" or "$.data.customer.email")
function extractValueByPath(obj: any, path: string): any {
  if (!path || !obj) return undefined;
  
  // Strip the optional $ prefix and leading dot for JSONPath compatibility
  let cleanPath = path;
  if (cleanPath.startsWith('$.')) {
    cleanPath = cleanPath.substring(2);
  } else if (cleanPath.startsWith('$')) {
    cleanPath = cleanPath.substring(1);
  }
  if (cleanPath.startsWith('.')) {
    cleanPath = cleanPath.substring(1);
  }
  
  const parts = cleanPath.split('.');
  let current = obj;
  
  for (const part of parts) {
    // Handle array index notation like "items[0]"
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current?.[key]?.[parseInt(index)];
    } else {
      current = current?.[part];
    }
    
    if (current === undefined) return undefined;
  }
  
  return current;
}

// ============= SIGNATURE VERIFICATION =============
// Verify HMAC-SHA256 signature
async function verifyHmacSha256(
  payload: string,
  signature: string | null,
  secret: string | null,
  headerName: string = 'x-webhook-signature'
): Promise<{ valid: boolean; reason?: string }> {
  if (!secret) {
    console.warn('SECURITY: No signing secret configured - signature verification skipped');
    return { valid: true, reason: 'no_key_configured' };
  }

  if (!signature) {
    console.error(`SECURITY: Signing key configured but no ${headerName} header - rejecting`);
    return { valid: false, reason: 'missing_signature' };
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Handle various signature formats (with or without prefix)
    const cleanSignature = signature.replace(/^(sha256=|v1=)/, '');
    
    if (expectedSignature.toLowerCase() === cleanSignature.toLowerCase()) {
      return { valid: true };
    }
    
    console.error('SECURITY: Signature mismatch');
    return { valid: false, reason: 'signature_mismatch' };
  } catch (err) {
    console.error('Signature verification error:', err);
    return { valid: false, reason: 'verification_error' };
  }
}

// Verify Stripe webhook signature using HMAC-SHA256 with timestamp
async function verifyStripeSignature(
  payload: string,
  signature: string | null,
  signingSecret: string | null
): Promise<{ valid: boolean; reason?: string }> {
  if (!signingSecret) {
    console.warn('SECURITY: No Stripe signing secret configured - signature verification skipped');
    return { valid: true, reason: 'no_key_configured' };
  }

  if (!signature) {
    console.error('SECURITY: Signing key configured but no stripe-signature header - rejecting');
    return { valid: false, reason: 'missing_signature' };
  }

  try {
    const parts = signature.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const signaturePart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return { valid: false, reason: 'invalid_signature_format' };
    }

    const timestamp = timestampPart.substring(2);
    const providedSignature = signaturePart.substring(3);

    // Check timestamp is within 5 minutes
    const timestampMs = parseInt(timestamp) * 1000;
    const now = Date.now();
    const tolerance = 5 * 60 * 1000;
    if (Math.abs(now - timestampMs) > tolerance) {
      console.error('SECURITY: Stripe signature timestamp expired');
      return { valid: false, reason: 'timestamp_expired' };
    }

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (expectedSignature.toLowerCase() === providedSignature.toLowerCase()) {
      return { valid: true };
    }
    
    console.error('SECURITY: Stripe signature mismatch');
    return { valid: false, reason: 'signature_mismatch' };
  } catch (err) {
    console.error('Stripe signature verification error:', err);
    return { valid: false, reason: 'verification_error' };
  }
}

// Verify header token authentication
function verifyHeaderToken(
  headers: Headers,
  expectedToken: string | null
): { valid: boolean; reason?: string } {
  if (!expectedToken) {
    return { valid: true, reason: 'no_token_configured' };
  }

  const providedToken = headers.get('x-webhook-token') || headers.get('authorization')?.replace('Bearer ', '');
  
  if (!providedToken) {
    console.error('SECURITY: Token configured but not provided in headers');
    return { valid: false, reason: 'missing_token' };
  }

  if (providedToken === expectedToken) {
    return { valid: true };
  }

  console.error('SECURITY: Token mismatch');
  return { valid: false, reason: 'token_mismatch' };
}

// ============= RATE LIMITING =============
const RATE_LIMIT_MAX_REQUESTS = 60;
const RATE_LIMIT_WINDOW_MINUTES = 1;

async function checkRateLimit(supabase: any, identifier: string, endpoint: string, customLimit?: number): Promise<{ allowed: boolean; current_count: number; reset_at: string }> {
  const maxRequests = customLimit || RATE_LIMIT_MAX_REQUESTS;
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_max_requests: maxRequests,
      p_window_minutes: RATE_LIMIT_WINDOW_MINUTES
    });

    if (error) {
      console.error('Rate limit check error:', error);
      return { allowed: false, current_count: 0, reset_at: new Date(Date.now() + 60000).toISOString() };
    }

    return data?.[0] || { allowed: true, current_count: 0, reset_at: new Date().toISOString() };
  } catch (err) {
    console.error('Rate limit exception:', err);
    return { allowed: false, current_count: 0, reset_at: new Date(Date.now() + 60000).toISOString() };
  }
}

function getClientIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  
  return cfConnectingIp || realIp || forwarded?.split(',')[0]?.trim() || 'unknown';
}

// ============= WEBHOOK LOGGING =============
async function logWebhook(
  supabase: any,
  connectionId: string,
  organizationId: string,
  status: 'success' | 'error' | 'partial',
  rawPayload: any,
  extractedData: any | null,
  errorMessage: string | null,
  processingTimeMs: number,
  requestHeaders: Record<string, string>,
  datasetRecordId?: string | null
) {
  try {
    // Generate payload hash for deduplication
    const payloadStr = JSON.stringify(rawPayload);
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(payloadStr));
    const payloadHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const { error } = await supabase.from('webhook_logs').insert({
      connection_id: connectionId,
      organization_id: organizationId,
      status,
      raw_payload: rawPayload,
      extracted_data: extractedData,
      error_message: errorMessage,
      processing_time_ms: processingTimeMs,
      headers: requestHeaders, // Fixed: column is 'headers' not 'request_headers'
      ip_address: requestHeaders['cf-connecting-ip'] || requestHeaders['x-forwarded-for']?.split(',')[0]?.trim() || null,
      payload_hash: payloadHash,
      dataset_record_id: datasetRecordId || null,
    });
    
    if (error) {
      console.error('Failed to insert webhook log:', error);
    } else {
      console.log(`Logged webhook: ${status} for connection ${connectionId}`);
    }
  } catch (err) {
    console.error('Failed to log webhook:', err);
  }
}

// ============= ENRICHMENT PROCESSING =============
interface EnrichmentResult {
  enrichment_id: string;
  target_table: string;
  action: 'matched' | 'created' | 'updated' | 'skipped';
  record_id?: string;
  error?: string;
}

async function processEnrichments(
  supabase: any,
  connection: any,
  extractedData: Record<string, any>
): Promise<EnrichmentResult[]> {
  if (!connection.dataset_id || !connection.organization_id) {
    return [];
  }

  const results: EnrichmentResult[] = [];

  try {
    // Fetch active enrichment rules for this dataset
    const { data: enrichments, error: enrichError } = await supabase
      .from('dataset_enrichments')
      .select('*')
      .eq('dataset_id', connection.dataset_id)
      .eq('organization_id', connection.organization_id)
      .eq('is_active', true);

    if (enrichError) {
      console.error('Error fetching enrichments:', enrichError);
      return [];
    }

    if (!enrichments || enrichments.length === 0) {
      console.log('No active enrichment rules found');
      return [];
    }

    console.log(`Processing ${enrichments.length} enrichment rule(s)`);

    for (const enrichment of enrichments) {
      const result: EnrichmentResult = {
        enrichment_id: enrichment.id,
        target_table: enrichment.target_table,
        action: 'skipped',
      };

      try {
        // Get the match value from extracted data
        const matchValue = extractedData[enrichment.match_field];
        
        if (!matchValue) {
          console.log(`Enrichment ${enrichment.id}: No match value found for field "${enrichment.match_field}"`);
          result.error = `Match field "${enrichment.match_field}" not found in extracted data`;
          results.push(result);
          continue;
        }

        console.log(`Enrichment ${enrichment.id}: Matching ${enrichment.match_field}="${matchValue}" against ${enrichment.target_table}.${enrichment.target_field}`);

        // Query the target table for a match
        const { data: existingRecords, error: queryError } = await supabase
          .from(enrichment.target_table)
          .select('id')
          .eq(enrichment.target_field, matchValue)
          .eq('organization_id', connection.organization_id)
          .limit(1);

        if (queryError) {
          console.error(`Error querying ${enrichment.target_table}:`, queryError);
          result.error = queryError.message;
          results.push(result);
          continue;
        }

        const existingRecord = existingRecords?.[0];

        if (existingRecord) {
          // Found a match - apply field mappings if any
          result.action = 'matched';
          result.record_id = existingRecord.id;

          const fieldMappings = Array.isArray(enrichment.field_mappings) 
            ? enrichment.field_mappings 
            : [];

          if (fieldMappings.length > 0) {
            const updateData: Record<string, any> = {};
            
            for (const mapping of fieldMappings) {
              const sourceValue = extractedData[mapping.source_field];
              if (sourceValue !== undefined) {
                updateData[mapping.target_column] = sourceValue;
              }
            }

            if (Object.keys(updateData).length > 0) {
              updateData.updated_at = new Date().toISOString();
              
              const { error: updateError } = await supabase
                .from(enrichment.target_table)
                .update(updateData)
                .eq('id', existingRecord.id);

              if (updateError) {
                console.error(`Error updating ${enrichment.target_table}:`, updateError);
                result.error = updateError.message;
              } else {
                result.action = 'updated';
                console.log(`Updated ${enrichment.target_table} record ${existingRecord.id} with`, Object.keys(updateData));
              }
            }
          }
        } else if (enrichment.auto_create_if_missing) {
          // No match found - use UPSERT to prevent race condition duplicates
          console.log(`No match found, upserting new ${enrichment.target_table} record`);
          
          const insertData: Record<string, any> = {
            [enrichment.target_field]: matchValue,
            organization_id: connection.organization_id,
          };

          // Apply field mappings for creation
          const fieldMappings = Array.isArray(enrichment.field_mappings) 
            ? enrichment.field_mappings 
            : [];
            
          for (const mapping of fieldMappings) {
            const sourceValue = extractedData[mapping.source_field];
            if (sourceValue !== undefined) {
              insertData[mapping.target_column] = sourceValue;
            }
          }

          // Use UPSERT pattern to prevent race condition duplicates
          const { data: upsertedRecord, error: upsertError } = await supabase
            .from(enrichment.target_table)
            .upsert(insertData, {
              onConflict: `${enrichment.target_field},organization_id`,
              ignoreDuplicates: false
            })
            .select('id')
            .single();

          if (upsertError) {
            // If upsert fails due to missing unique constraint, fall back to insert
            console.warn(`Upsert failed, trying insert:`, upsertError.message);
            const { data: newRecord, error: insertError } = await supabase
              .from(enrichment.target_table)
              .insert(insertData)
              .select('id')
              .single();

            if (insertError) {
              console.error(`Error creating ${enrichment.target_table}:`, insertError);
              result.error = insertError.message;
            } else {
              result.action = 'created';
              result.record_id = newRecord.id;
              console.log(`Created new ${enrichment.target_table} record: ${newRecord.id}`);
            }
          } else {
            result.action = 'created';
            result.record_id = upsertedRecord.id;
            console.log(`Upserted ${enrichment.target_table} record: ${upsertedRecord.id}`);
          }
        } else {
          console.log(`No match found for enrichment ${enrichment.id}, auto_create disabled`);
        }

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Enrichment ${enrichment.id} error:`, errMsg);
        result.error = errMsg;
      }

      results.push(result);
    }

  } catch (err) {
    console.error('Enrichment processing error:', err);
  }

  return results;
}

// ============= DATASET RECORD PROCESSING =============
async function processDatasetRecord(
  supabase: any,
  connection: any,
  payload: any,
  options: { forceInsert?: boolean } = {}
): Promise<{ success: boolean; recordId?: string; extractedData?: any; enrichmentResults?: EnrichmentResult[]; error?: string; deduplicated?: boolean }> {
  if (!connection.dataset_id) {
    return { success: true }; // No dataset linked, skip processing
  }

  try {
    // Fetch dataset fields for extraction (mapped fields use JSON paths)
    const { data: fields, error: fieldsError } = await supabase
      .from('dataset_fields')
      .select('*')
      .eq('dataset_id', connection.dataset_id)
      .eq('source_type', 'mapped')
      .order('sort_order');

    if (fieldsError) {
      console.error('Error fetching dataset fields:', fieldsError);
      return { success: false, error: 'Failed to fetch dataset fields' };
    }

    // Extract data using field mappings
    const extractedData: Record<string, any> = {};
    
    for (const field of fields || []) {
      const sourceConfig = field.source_config as { json_path?: string } | null;
      const jsonPath = sourceConfig?.json_path;
      
      if (jsonPath) {
        const value = extractValueByPath(payload, jsonPath);
        if (value !== undefined) {
          // Type coercion based on field_type
          switch (field.field_type) {
            case 'number':
              extractedData[field.field_slug] = typeof value === 'number' ? value : parseFloat(value) || 0;
              break;
            case 'boolean':
              extractedData[field.field_slug] = Boolean(value);
              break;
            case 'date':
              extractedData[field.field_slug] = new Date(value).toISOString();
              break;
            default:
              extractedData[field.field_slug] = String(value);
          }
        }
      }
    }

    // Generate payload hash for deduplication
    const payloadStr = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(payloadStr));
    const payloadHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Check for duplicate payload (skip if force mode enabled)
    if (!options.forceInsert) {
      const { data: existingRecord } = await supabase
        .from('dataset_records')
        .select('id, extracted_data')
        .eq('dataset_id', connection.dataset_id)
        .eq('webhook_connection_id', connection.id) // Include connection in dedup check
        .eq('payload_hash', payloadHash)
        .maybeSingle();

      if (existingRecord) {
        const existingExtracted = (existingRecord as any)?.extracted_data;
        const existingObj = (existingExtracted && typeof existingExtracted === 'object' && !Array.isArray(existingExtracted))
          ? (existingExtracted as Record<string, any>)
          : {};
        const existingCount = Object.keys(existingObj).length;
        const newCount = Object.keys(extractedData).length;

        // If mappings changed since the first insert, re-save extracted_data on duplicates.
        // This avoids the common “I updated fields but old records stay empty” trap.
        if (newCount > existingCount) {
          const merged = { ...existingObj, ...extractedData };
          const { error: updateErr } = await supabase
            .from('dataset_records')
            .update({
              extracted_data: merged,
              processing_status: 'success',
              error_message: null,
            })
            .eq('id', existingRecord.id);

          if (updateErr) {
            console.warn(`Duplicate payload detected, but failed to update extracted_data for ${existingRecord.id}:`, updateErr);
          } else {
            console.log(`Duplicate payload detected; updated extracted_data for ${existingRecord.id} from ${existingCount} -> ${Object.keys(merged).length} fields`);
          }

          return {
            success: true,
            recordId: existingRecord.id,
            extractedData: merged,
            enrichmentResults: [],
            deduplicated: true,
          };
        }

        console.log(`Duplicate payload detected, skipping record creation. Existing: ${existingRecord.id}`);
        return {
          success: true,
          recordId: existingRecord.id,
          extractedData: existingObj,
          enrichmentResults: [],
          deduplicated: true // Flag for API consumers
        };
      }
    } else {
      console.log('Force mode: bypassing deduplication check');
    }

    // Insert into dataset_records with payload_hash for deduplication
    // When force mode is enabled, set payload_hash to NULL to avoid constraint conflicts
    const { data: record, error: insertError } = await supabase
      .from('dataset_records')
      .insert({
        dataset_id: connection.dataset_id,
        organization_id: connection.organization_id,
        webhook_connection_id: connection.id,
        raw_payload: payload,
        extracted_data: extractedData,
        processing_status: 'success',
        payload_hash: options.forceInsert ? null : payloadHash,
      })
      .select('id')
      .single();

    if (insertError) {
      // Handle unique constraint violation gracefully (race condition)
      if (insertError.code === '23505') {
        console.log('Duplicate record detected via constraint, fetching existing');
        const { data: dup } = await supabase
          .from('dataset_records')
          .select('id')
          .eq('dataset_id', connection.dataset_id)
          .eq('payload_hash', payloadHash)
          .single();
        return { success: true, recordId: dup?.id, extractedData, enrichmentResults: [] };
      }
      console.error('Error inserting dataset record:', insertError);
      return { success: false, error: insertError.message };
    }

    console.log(`Created dataset record: ${record.id} with ${Object.keys(extractedData).length} extracted fields (hash: ${payloadHash.substring(0, 12)}...)`);

    // Process enrichments after successful record creation
    const enrichmentResults = await processEnrichments(supabase, connection, extractedData);
    
    return { 
      success: true, 
      recordId: record.id, 
      extractedData,
      enrichmentResults 
    };

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Dataset processing error:', message);
    return { success: false, error: message };
  }
}

// ============= MAIN HANDLER =============
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Capture headers for logging
  const requestHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    // Don't log sensitive headers
    if (!['authorization', 'cookie', 'x-webhook-token'].includes(key.toLowerCase())) {
      requestHeaders[key] = value;
    }
  });

  try {
    const url = new URL(req.url);
    const connectionId = url.searchParams.get('connection_id');
    const forceInsert = url.searchParams.get('force') === 'true'; // Bypass dedup for testing
    
    if (!connectionId) {
      console.error('Missing connection_id parameter');
      return new Response(JSON.stringify({ error: 'Missing connection_id parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (forceInsert) {
      console.log('Force mode enabled - deduplication will be bypassed');
    }

    // Fetch the connection configuration
    const { data: connection, error: connError } = await supabase
      .from('webhook_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('is_active', true)
      .maybeSingle();

    if (connError || !connection) {
      console.error('Connection not found or inactive:', connError);
      return new Response(JSON.stringify({ error: 'Invalid or inactive connection' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing webhook for connection: ${connection.name} (${connection.connection_type})`);

    // Check rate limit with connection-specific limit
    const clientIp = getClientIdentifier(req);
    const rateLimitResult = await checkRateLimit(
      supabase, 
      `${clientIp}:${connectionId}`, 
      'generic-webhook',
      connection.rate_limit_per_minute
    );
    
    if (!rateLimitResult.allowed) {
      console.warn(`Rate limit exceeded for ${clientIp} on connection ${connectionId}`);
      // Log rate-limited requests with sampling to prevent DB self-DDOS
      // Only log every 10th blocked request to reduce write load
      if (rateLimitResult.current_count % 10 === 0) {
        await logWebhook(
          supabase, 
          connectionId, 
          connection.organization_id, 
          'error', 
          { message: 'Rate limited - payload not parsed', sample: '1 of 10' }, 
          null, 
          `Rate limit exceeded: ${rateLimitResult.current_count}/${connection.rate_limit_per_minute || 60} requests (sampled log)`, 
          Date.now() - startTime, 
          requestHeaders
        );
      }
      return new Response(JSON.stringify({ 
        error: 'Too many requests', 
        retry_after: rateLimitResult.reset_at 
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Retry-After': rateLimitResult.reset_at,
        },
      });
    }

    // Read raw body for signature verification
    const rawBody = await req.text();
    let payload: any;
    
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('Invalid JSON payload');
      await logWebhook(supabase, connectionId, connection.organization_id, 'error', rawBody, null, 'Invalid JSON payload', Date.now() - startTime, requestHeaders);
      return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('Webhook received, keys:', Object.keys(payload).join(', '));

    // ============= SIGNATURE VERIFICATION =============
    // Use connection-level signature settings first, fall back to org integrations
    let signatureResult: { valid: boolean; reason?: string } = { valid: true };
    
    if (connection.signature_type && connection.signature_type !== 'none') {
      // Use connection-specific signature settings
      switch (connection.signature_type) {
        case 'hmac_sha256':
          const hmacSignature = req.headers.get('x-webhook-signature') || 
                               req.headers.get('x-signature') ||
                               req.headers.get('x-hub-signature-256');
          signatureResult = await verifyHmacSha256(rawBody, hmacSignature, connection.signature_secret);
          break;
        case 'header_token':
          signatureResult = verifyHeaderToken(req.headers, connection.signature_secret);
          break;
      }
    } else if (connection.connection_type === 'stripe' || connection.connection_type === 'whop') {
      // Fall back to organization integrations for known types
      let signingKey: string | null = null;
      
      if (connection.organization_id) {
        const { data: orgIntegration } = await supabase
          .from('organization_integrations')
          .select('stripe_webhook_signing_key, whop_webhook_signing_key')
          .eq('organization_id', connection.organization_id)
          .maybeSingle();
        
        if (connection.connection_type === 'stripe') {
          signingKey = orgIntegration?.stripe_webhook_signing_key;
          const stripeSignature = req.headers.get('stripe-signature');
          signatureResult = await verifyStripeSignature(rawBody, stripeSignature, signingKey);
        } else if (connection.connection_type === 'whop') {
          signingKey = orgIntegration?.whop_webhook_signing_key;
          const whopSignature = req.headers.get('x-whop-signature');
          signatureResult = await verifyHmacSha256(rawBody, whopSignature, signingKey);
        }
      }
    }

    if (!signatureResult.valid && signatureResult.reason !== 'no_key_configured' && signatureResult.reason !== 'no_token_configured') {
      console.error('SECURITY: Invalid webhook signature:', signatureResult.reason);
      await logWebhook(supabase, connectionId, connection.organization_id, 'error', payload, null, `Signature verification failed: ${signatureResult.reason}`, Date.now() - startTime, requestHeaders);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update webhook stats
    await supabase
      .from('webhook_connections')
      .update({ 
        last_webhook_at: new Date().toISOString(),
        webhook_count: (connection.webhook_count || 0) + 1
      })
      .eq('id', connectionId);

    // ============= PROCESS DATASET RECORD =============
    const datasetResult = await processDatasetRecord(supabase, connection, payload, { forceInsert });
    
    // ============= LEGACY PAYMENT PROCESSING =============
    // Also run legacy handlers for backward compatibility
    let legacyResult: any = { skipped: true, reason: 'No legacy handler' };
    
    switch (connection.connection_type) {
      case 'whop':
        legacyResult = await handleWhopWebhook(supabase, payload, connection);
        break;
      case 'stripe':
        legacyResult = await handleStripeWebhook(supabase, payload, connection);
        break;
      case 'n8n':
      case 'zapier':
      case 'shifi':
      case 'custom':
      default:
        // For non-payment sources, only use dataset processing
        legacyResult = { skipped: true, reason: 'Dataset processing only' };
        break;
    }

    // Log the webhook
    const processingTimeMs = Date.now() - startTime;
    const status = datasetResult.success ? 'success' : 'partial';
    await logWebhook(
      supabase, 
      connectionId, 
      connection.organization_id, 
      status, 
      payload, 
      datasetResult.extractedData || null, 
      datasetResult.error || null, 
      processingTimeMs, 
      requestHeaders,
      datasetResult.recordId || null
    );

    return new Response(JSON.stringify({ 
      success: true, 
      dataset_record_id: datasetResult.recordId,
      extracted_fields: datasetResult.extractedData ? Object.keys(datasetResult.extractedData).length : 0,
      enrichments: datasetResult.enrichmentResults || [],
      deduplicated: datasetResult.deduplicated || false, // Indicate if this was a duplicate
      forced: forceInsert, // Indicate if force mode was used
      legacy: legacyResult,
      processing_time_ms: processingTimeMs,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Try to log the error
    try {
      const url = new URL(req.url);
      const connectionId = url.searchParams.get('connection_id');
      if (connectionId) {
        await logWebhook(supabase, connectionId, '', 'error', null, null, message, Date.now() - startTime, requestHeaders, null);
      }
    } catch (logErr) {
      console.error('Failed to log error:', logErr);
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============= LEGACY HANDLERS =============
async function handleWhopWebhook(supabase: any, payload: any, connection: any) {
  console.log('Processing Whop webhook (legacy)');
  
  const eventType = payload.event || payload.action || payload.type;
  const data = payload.data || payload;

  console.log('Event type:', eventType);

  if (eventType === 'payment.succeeded' || eventType === 'payment.completed' || eventType === 'payment_completed') {
    const customerEmail = data.customer_email || data.email || data.user?.email;
    const paymentAmount = data.final_amount || data.amount || data.total || 0;
    const paymentId = data.id || data.payment_id;

    if (!customerEmail) {
      return { skipped: true, reason: 'No customer email' };
    }

    const notePattern = `whop_${connection.name}_${paymentId}`;
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .ilike('notes', `%${notePattern}%`)
      .maybeSingle();

    if (existingPayment) {
      return { skipped: true, reason: 'Payment already exists' };
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, original_setter_name, source_id')
      .eq('email', customerEmail.toLowerCase())
      .eq('organization_id', connection.organization_id)
      .maybeSingle();

    let setterId = null;
    if (lead?.original_setter_name) {
      const { data: setter } = await supabase
        .from('setters')
        .select('id')
        .ilike('name', lead.original_setter_name)
        .eq('organization_id', connection.organization_id)
        .maybeSingle();
      setterId = setter?.id;
    }

    const { data: event } = await supabase
      .from('events')
      .select('id, closer_id, setter_id, source_id, traffic_type_id')
      .eq('lead_email', customerEmail.toLowerCase())
      .eq('organization_id', connection.organization_id)
      .order('scheduled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let paymentDate = new Date().toISOString();
    if (data.created_at || data.paid_at || data.created) {
      const dateValue = data.created_at || data.paid_at || data.created;
      paymentDate = typeof dateValue === 'number' 
        ? new Date(dateValue * 1000).toISOString()
        : new Date(dateValue).toISOString();
    }

    const paymentRecord = {
      amount: paymentAmount / 100,
      payment_date: paymentDate,
      customer_email: customerEmail.toLowerCase(),
      customer_name: data.customer_name || data.user?.name || null,
      notes: `${notePattern} - via ${connection.name}`,
      setter_id: event?.setter_id || setterId || null,
      closer_id: event?.closer_id || null,
      source_id: event?.source_id || lead?.source_id || null,
      traffic_type_id: event?.traffic_type_id || null,
      event_id: event?.id || null,
      lead_id: lead?.id || null,
      organization_id: connection.organization_id,
      whop_connection_id: connection.id,
    };

    const { data: newPayment, error: insertError } = await supabase
      .from('payments')
      .insert(paymentRecord)
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting payment:', insertError);
      throw insertError;
    }

    console.log('Created payment:', newPayment.id);
    return { created: true, paymentId: newPayment.id };
  }

  if (eventType === 'payment.refunded' || eventType === 'refund.created' || eventType === 'payment_refunded') {
    const refundAmount = data.refund_amount || data.amount || 0;
    const paymentId = data.payment_id || data.original_payment_id;

    const notePattern = `whop_${connection.name}_${paymentId}`;
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .ilike('notes', `%${notePattern}%`)
      .eq('organization_id', connection.organization_id)
      .maybeSingle();

    if (existingPayment) {
      await supabase
        .from('payments')
        .update({
          refund_amount: refundAmount / 100,
          refunded_at: new Date().toISOString()
        })
        .eq('id', existingPayment.id);

      return { updated: true, paymentId: existingPayment.id };
    }

    return { skipped: true, reason: 'Original payment not found' };
  }

  return { skipped: true, reason: 'Unhandled event type' };
}

async function handleStripeWebhook(supabase: any, payload: any, connection: any) {
  console.log('Processing Stripe webhook (legacy)');
  
  const eventType = payload.type;
  const data = payload.data?.object || payload;

  console.log('Event type:', eventType);

  if (eventType === 'checkout.session.completed' || eventType === 'payment_intent.succeeded') {
    const customerEmail = data.customer_email || data.receipt_email || data.customer_details?.email;
    const paymentAmount = data.amount_total || data.amount || data.amount_received || 0;
    const paymentId = data.id || data.payment_intent;

    if (!customerEmail) {
      return { skipped: true, reason: 'No customer email' };
    }

    const notePattern = `stripe_${connection.name}_${paymentId}`;
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .ilike('notes', `%${notePattern}%`)
      .eq('organization_id', connection.organization_id)
      .maybeSingle();

    if (existingPayment) {
      return { skipped: true, reason: 'Payment already exists' };
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, original_setter_name, source_id')
      .eq('email', customerEmail.toLowerCase())
      .eq('organization_id', connection.organization_id)
      .maybeSingle();

    const { data: event } = await supabase
      .from('events')
      .select('id, closer_id, setter_id, source_id, traffic_type_id')
      .eq('lead_email', customerEmail.toLowerCase())
      .eq('organization_id', connection.organization_id)
      .order('scheduled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const paymentRecord = {
      amount: paymentAmount / 100,
      payment_date: new Date((data.created || Date.now() / 1000) * 1000).toISOString(),
      customer_email: customerEmail.toLowerCase(),
      customer_name: data.customer_details?.name || null,
      notes: `${notePattern} - via ${connection.name}`,
      setter_id: event?.setter_id || null,
      closer_id: event?.closer_id || null,
      source_id: event?.source_id || lead?.source_id || null,
      traffic_type_id: event?.traffic_type_id || null,
      event_id: event?.id || null,
      lead_id: lead?.id || null,
      organization_id: connection.organization_id,
    };

    const { data: newPayment, error: insertError } = await supabase
      .from('payments')
      .insert(paymentRecord)
      .select()
      .single();

    if (insertError) throw insertError;

    console.log('Created payment:', newPayment.id);
    return { created: true, paymentId: newPayment.id };
  }

  if (eventType === 'charge.refunded' || eventType === 'refund.created') {
    const refundAmount = data.amount_refunded || data.amount || 0;
    const paymentId = data.payment_intent || data.charge;

    const notePattern = `stripe_${connection.name}_${paymentId}`;
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('id')
      .ilike('notes', `%${notePattern}%`)
      .eq('organization_id', connection.organization_id)
      .maybeSingle();

    if (existingPayment) {
      await supabase
        .from('payments')
        .update({
          refund_amount: refundAmount / 100,
          refunded_at: new Date().toISOString()
        })
        .eq('id', existingPayment.id);
      return { updated: true, paymentId: existingPayment.id };
    }
    return { skipped: true, reason: 'Original payment not found' };
  }

  return { skipped: true, reason: 'Unhandled event type' };
}
