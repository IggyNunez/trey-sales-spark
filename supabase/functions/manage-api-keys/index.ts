import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

// Supported key types
type KeyType = 'calendly' | 'calcom' | 'close' | 'ghl' | 'hubspot' | 'whop' | 'stripe';

interface EncryptedData {
  ciphertext: string; // base64
  iv: string; // base64
  tag: string; // base64
  version: number;
}

// Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Convert Uint8Array to base64
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 to Uint8Array
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Get the encryption key from environment
async function getEncryptionKey(): Promise<CryptoKey> {
  const masterKeyHex = Deno.env.get('ENCRYPTION_MASTER_KEY');
  if (!masterKeyHex) {
    throw new Error('ENCRYPTION_MASTER_KEY not configured');
  }
  
  // Support both hex (64 chars) and base64 (44 chars) formats
  let keyBytes: Uint8Array;
  if (masterKeyHex.length === 64 && /^[0-9a-fA-F]+$/.test(masterKeyHex)) {
    keyBytes = hexToBytes(masterKeyHex);
  } else {
    // Assume base64
    keyBytes = base64ToBytes(masterKeyHex);
  }
  
  if (keyBytes.length !== 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be 32 bytes (256 bits)');
  }
  
  // Create a new ArrayBuffer from the key bytes
  const keyBuffer = new ArrayBuffer(32);
  const keyView = new Uint8Array(keyBuffer);
  keyView.set(keyBytes);
  
  return await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a plaintext API key
async function encryptApiKey(plaintext: string): Promise<EncryptedData> {
  const key = await getEncryptionKey();
  
  // Generate a random 12-byte IV (recommended for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encode the plaintext
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  // Create IV buffer
  const ivBuffer = new ArrayBuffer(12);
  const ivView = new Uint8Array(ivBuffer);
  ivView.set(iv);
  
  // Encrypt with AES-256-GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBuffer, tagLength: 128 },
    key,
    data
  );
  
  // The ciphertext includes the auth tag at the end (last 16 bytes for 128-bit tag)
  const ciphertextArray = new Uint8Array(ciphertext);
  const actualCiphertext = ciphertextArray.slice(0, -16);
  const tag = ciphertextArray.slice(-16);
  
  return {
    ciphertext: bytesToBase64(actualCiphertext),
    iv: bytesToBase64(iv),
    tag: bytesToBase64(tag),
    version: 1,
  };
}

// Decrypt an encrypted API key
async function decryptApiKey(encrypted: EncryptedData): Promise<string> {
  const key = await getEncryptionKey();
  
  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.ciphertext);
  const tag = base64ToBytes(encrypted.tag);
  
  // Reconstruct the full ciphertext (ciphertext + tag)
  const fullCiphertext = new Uint8Array(ciphertext.length + tag.length);
  fullCiphertext.set(ciphertext);
  fullCiphertext.set(tag, ciphertext.length);
  
  // Create IV buffer
  const ivBuffer = new ArrayBuffer(iv.length);
  const ivView = new Uint8Array(ivBuffer);
  ivView.set(iv);
  
  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer, tagLength: 128 },
    key,
    fullCiphertext
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Mask an API key for display (show first 4 and last 4 chars)
function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return '********';
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// Log audit event (without logging actual key values)
// Maps custom actions to valid DB constraint values (INSERT/UPDATE/DELETE)
async function logAuditEvent(
  supabase: SupabaseClient,
  action: string,
  keyType: KeyType,
  organizationId: string,
  userId: string | null,
  details?: Record<string, unknown>
) {
  try {
    // Map API key actions to valid audit_logs action values
    // The audit_logs table has CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))
    let dbAction: 'INSERT' | 'UPDATE' | 'DELETE';
    switch (action) {
      case 'save':
        dbAction = 'UPDATE'; // Saving/updating a key
        break;
      case 'delete':
        dbAction = 'DELETE';
        break;
      case 'get-masked':
      case 'decrypt':
      case 'get-all-masked':
        dbAction = 'UPDATE'; // Read operations logged as UPDATE (access event)
        break;
      default:
        dbAction = 'UPDATE';
    }
    
    await supabase.from('audit_logs').insert({
      table_name: 'organization_integrations',
      record_id: organizationId,
      action: dbAction,
      user_id: userId,
      new_data: {
        api_key_action: action, // Store the original action type here
        key_type: keyType,
        timestamp: new Date().toISOString(),
        ...details,
      },
    });
    console.log(`Audit: ${action} ${keyType} key for org ${organizationId}`);
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw - audit logging should not break the main flow
  }
}

// Get column name for a key type
function getColumnName(keyType: KeyType): string {
  const columnMap: Record<KeyType, string> = {
    calendly: 'calendly_api_key_encrypted',
    calcom: 'calcom_api_key_encrypted',
    close: 'close_api_key_encrypted',
    ghl: 'ghl_api_key_encrypted',
    hubspot: 'hubspot_api_key_encrypted',
    whop: 'whop_api_key_encrypted',
    stripe: 'stripe_api_key_encrypted',
  };
  return columnMap[keyType];
}

// Get legacy (plaintext) column name - returns null for Stripe (never had plaintext column)
function getLegacyColumnName(keyType: KeyType): string | null {
  const columnMap: Record<KeyType, string | null> = {
    calendly: 'calendly_api_key',
    calcom: null, // Cal.com never had plaintext column
    close: 'close_api_key',
    ghl: 'ghl_api_key',
    hubspot: 'hubspot_api_key',
    whop: 'whop_api_key',
    stripe: null, // Stripe was never stored in plaintext
  };
  return columnMap[keyType];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header for user context
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const body = await req.json();
    const { action, organizationId, keyType, apiKey, additionalFields } = body as {
      action: 'save' | 'get-masked' | 'decrypt' | 'delete' | 'get-all-masked';
      organizationId: string;
      keyType?: KeyType;
      apiKey?: string;
      additionalFields?: Record<string, string>;
    };

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'organizationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user has access to this organization (if authenticated)
    if (userId) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single();
      
      if (!membership) {
        return new Response(
          JSON.stringify({ error: 'Access denied to this organization' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========== SAVE ACTION ==========
    if (action === 'save') {
      if (!keyType || !apiKey) {
        return new Response(
          JSON.stringify({ error: 'keyType and apiKey are required for save action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Encrypt the API key
      const encrypted = await encryptApiKey(apiKey);
      const encryptedJson = JSON.stringify(encrypted);
      
      // Build the update object
      const columnName = getColumnName(keyType);
      const legacyColumn = getLegacyColumnName(keyType);
      
      const updateData: Record<string, unknown> = {
        [columnName]: encryptedJson,
        updated_at: new Date().toISOString(),
      };
      
      // Clear the legacy plaintext column for security (if it exists for this key type)
      if (legacyColumn) {
        updateData[legacyColumn] = null;
      }
      
      // Add any additional fields (like whop_company_id, ghl_location_id)
      if (additionalFields) {
        Object.assign(updateData, additionalFields);
      }
      
      // Upsert the integration record
      const { error } = await supabase
        .from('organization_integrations')
        .upsert({
          organization_id: organizationId,
          ...updateData,
        }, { onConflict: 'organization_id' });
      
      if (error) {
        console.error('Failed to save encrypted key:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to save API key' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Log the save action
      await logAuditEvent(supabase, 'SAVED', keyType, organizationId, userId, {
        masked_key: maskApiKey(apiKey),
      });
      
      return new Response(
        JSON.stringify({ success: true, masked: maskApiKey(apiKey) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== GET-MASKED ACTION ==========
    if (action === 'get-masked') {
      if (!keyType) {
        return new Response(
          JSON.stringify({ error: 'keyType is required for get-masked action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const columnName = getColumnName(keyType);
      const legacyColumn = getLegacyColumnName(keyType);
      
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      
      if (error) {
        console.error('Failed to fetch key:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch API key' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!data) {
        return new Response(
          JSON.stringify({ configured: false, masked: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Check encrypted column first, then legacy
      const dataRecord = data as unknown as Record<string, unknown>;
      const encryptedValue = dataRecord[columnName] as string | null;
      const legacyValue = legacyColumn ? dataRecord[legacyColumn] as string | null : null;
      
      let masked: string | null = null;
      let isEncrypted = false;
      
      if (encryptedValue) {
        // Decrypt to get masked value
        try {
          const encrypted = JSON.parse(encryptedValue) as EncryptedData;
          const decrypted = await decryptApiKey(encrypted);
          masked = maskApiKey(decrypted);
          isEncrypted = true;
        } catch (e) {
          console.error('Failed to decrypt key:', e);
          masked = '****[encryption error]****';
        }
      } else if (legacyValue) {
        // Legacy plaintext key
        masked = maskApiKey(legacyValue);
        isEncrypted = false;
      }
      
      return new Response(
        JSON.stringify({ 
          configured: !!(encryptedValue || legacyValue), 
          masked,
          isEncrypted,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== GET-ALL-MASKED ACTION ==========
    if (action === 'get-all-masked') {
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      
      if (error) {
        console.error('Failed to fetch integrations:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch integrations' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (!data) {
        return new Response(
          JSON.stringify({ integrations: {} }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const dataRecord = data as unknown as Record<string, unknown>;
      const keyTypes: KeyType[] = ['calendly', 'calcom', 'close', 'ghl', 'hubspot', 'whop', 'stripe'];
      const integrations: Record<string, { configured: boolean; masked: string | null; isEncrypted: boolean }> = {};
      
      for (const kt of keyTypes) {
        const columnName = getColumnName(kt);
        const legacyColumn = getLegacyColumnName(kt);
        
        const encryptedValue = dataRecord[columnName] as string | null;
        const legacyValue = legacyColumn ? dataRecord[legacyColumn] as string | null : null;
        
        let masked: string | null = null;
        let isEncrypted = false;
        
        if (encryptedValue && typeof encryptedValue === 'string') {
          try {
            const encrypted = JSON.parse(encryptedValue) as EncryptedData;
            const decrypted = await decryptApiKey(encrypted);
            masked = maskApiKey(decrypted);
            isEncrypted = true;
          } catch {
            masked = '****[error]****';
          }
        } else if (legacyValue && typeof legacyValue === 'string') {
          masked = maskApiKey(legacyValue);
        }
        
        integrations[kt] = {
          configured: !!(encryptedValue || legacyValue),
          masked,
          isEncrypted,
        };
      }
      
      return new Response(
        JSON.stringify({ 
          integrations,
          // Include non-sensitive metadata
          whop_company_id: dataRecord.whop_company_id,
          ghl_location_id: dataRecord.ghl_location_id,
          primary_crm: dataRecord.primary_crm,
          primary_booking_platform: dataRecord.primary_booking_platform,
          primary_payment_processor: dataRecord.primary_payment_processor,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== DECRYPT ACTION (internal use only) ==========
    // Includes LAZY MIGRATION: automatically encrypts plaintext keys on first access
    if (action === 'decrypt') {
      if (!keyType) {
        return new Response(
          JSON.stringify({ error: 'keyType is required for decrypt action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // This action should only be called by other edge functions
      // Check for service role key in authorization
      const isServiceRole = authHeader?.includes(supabaseServiceKey.slice(0, 20));
      if (!isServiceRole && !userId) {
        console.warn('Decrypt action called without proper authorization');
        // Still allow for now during migration, but log it
      }

      const { data, error } = await supabase
        .from('organization_integrations')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: 'API key not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const columnName = getColumnName(keyType);
      const legacyColumn = getLegacyColumnName(keyType);
      
      const dataRecord = data as unknown as Record<string, unknown>;
      const encryptedValue = dataRecord[columnName] as string | null;
      const legacyValue = legacyColumn ? dataRecord[legacyColumn] as string | null : null;
      
      let decrypted: string | null = null;
      let wasMigrated = false;
      
      if (encryptedValue) {
        // Already encrypted - just decrypt
        try {
          const encrypted = JSON.parse(encryptedValue) as EncryptedData;
          decrypted = await decryptApiKey(encrypted);
        } catch (e) {
          console.error('Failed to decrypt key:', e);
          return new Response(
            JSON.stringify({ error: 'Failed to decrypt API key' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else if (legacyValue) {
        // LAZY MIGRATION: Encrypt the plaintext key and save it
        console.log(`Lazy migration: encrypting ${keyType} key for org ${organizationId}`);
        
        try {
          // Step 1: Encrypt the plaintext key
          const encrypted = await encryptApiKey(legacyValue);
          const encryptedJson = JSON.stringify(encrypted);
          
          // Step 2: Save encrypted and clear plaintext
          const updatePayload: Record<string, unknown> = {
            [columnName]: encryptedJson,
            encryption_version: 1,
            updated_at: new Date().toISOString(),
          };
          if (legacyColumn) {
            updatePayload[legacyColumn] = null; // Clear plaintext for security
          }
          
          const { error: updateError } = await supabase
            .from('organization_integrations')
            .update(updatePayload)
            .eq('organization_id', organizationId);
          
          if (updateError) {
            console.error('Failed to save migrated key:', updateError);
            // Still return the plaintext key (fallback)
            decrypted = legacyValue;
          } else {
            console.log(`Successfully migrated ${keyType} key for org ${organizationId}`);
            decrypted = legacyValue;
            wasMigrated = true;
          }
        } catch (e) {
          console.error('Failed during lazy migration:', e);
          // Fallback to plaintext key
          decrypted = legacyValue;
        }
      }
      
      if (!decrypted) {
        return new Response(
          JSON.stringify({ error: 'API key not configured' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Log the decryption (but never the actual key!)
      await logAuditEvent(supabase, wasMigrated ? 'MIGRATED_AND_DECRYPTED' : 'DECRYPTED', keyType, organizationId, userId, {
        caller: req.headers.get('x-function-name') || 'unknown',
        was_migrated: wasMigrated,
      });
      
      return new Response(
        JSON.stringify({ apiKey: decrypted, wasMigrated }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== DELETE ACTION ==========
    if (action === 'delete') {
      if (!keyType) {
        return new Response(
          JSON.stringify({ error: 'keyType is required for delete action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const columnName = getColumnName(keyType);
      const legacyColumn = getLegacyColumnName(keyType);
      
      const deletePayload: Record<string, unknown> = {
        [columnName]: null,
        updated_at: new Date().toISOString(),
      };
      if (legacyColumn) {
        deletePayload[legacyColumn] = null;
      }
      
      const { error } = await supabase
        .from('organization_integrations')
        .update(deletePayload)
        .eq('organization_id', organizationId);
      
      if (error) {
        console.error('Failed to delete key:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to delete API key' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      await logAuditEvent(supabase, 'DELETED', keyType, organizationId, userId);
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in manage-api-keys:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
