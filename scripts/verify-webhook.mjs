#!/usr/bin/env node
/**
 * Verify Calendly webhook registration and status
 * This script checks if your Calendly webhook is properly configured
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file
try {
  const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
} catch (e) {
  console.log('⚠️  Could not load .env file');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  🔐 Calendly Webhook Verification Tool');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Step 1: Get organizations
console.log('📊 Step 1: Fetching organizations...\n');

const { data: orgs, error: orgsError } = await supabase
  .from('organizations')
  .select('id, name')
  .limit(10);

if (orgsError || !orgs || orgs.length === 0) {
  console.error('❌ Error: Could not fetch organizations');
  console.error('   Make sure you have organizations set up in your database\n');
  process.exit(1);
}

console.log(`✅ Found ${orgs.length} organization(s):\n`);

for (const org of orgs) {
  console.log(`   ${org.name} (${org.id})`);
}
console.log('');

// Step 2: Check each organization's webhook status
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Step 2: Checking webhook status for each org...\n');

let hasActiveWebhook = false;
let hasCalendlyKey = false;

for (const org of orgs) {
  console.log(`🔍 Checking ${org.name}...\n`);

  // Check if org has Calendly API key
  const { data: integration } = await supabase
    .from('organization_integrations')
    .select('calendly_api_key')
    .eq('organization_id', org.id)
    .maybeSingle();

  if (!integration?.calendly_api_key || integration.calendly_api_key === 'configured') {
    console.log(`   ❌ No Calendly API key configured`);
    console.log(`   → Action: Go to Settings → Integrations and add Calendly API key\n`);
    continue;
  }

  console.log(`   ✅ Calendly API key configured`);
  hasCalendlyKey = true;

  // Check webhook registration
  console.log(`   🔄 Checking webhook registration...`);

  try {
    const { data, error } = await supabase.functions.invoke('register-calendly-webhook', {
      body: { action: 'list', organizationId: org.id }
    });

    if (error) {
      console.log(`   ❌ Error checking webhooks: ${error.message}`);
      console.log(`   → This might be a permissions issue\n`);
      continue;
    }

    const targetUrl = `${supabaseUrl}/functions/v1/calendly-webhook`;
    const ourWebhooks = data?.webhooks || [];
    const allWebhooks = data?.allWebhooks || [];

    console.log(`   📍 Target URL: ${targetUrl}`);
    console.log(`   📊 Found ${allWebhooks.length} total webhook(s) in Calendly`);
    console.log(`   ✅ Found ${ourWebhooks.length} webhook(s) pointing to our app\n`);

    if (ourWebhooks.length > 0) {
      hasActiveWebhook = true;
      for (const webhook of ourWebhooks) {
        console.log(`   ✅ ACTIVE WEBHOOK FOUND:`);
        console.log(`      URI: ${webhook.uri}`);
        console.log(`      URL: ${webhook.callback_url}`);
        console.log(`      Status: ${webhook.state}`);
        console.log(`      Events: ${webhook.events?.join(', ')}`);
        console.log(`      Created: ${new Date(webhook.created_at).toLocaleString()}\n`);
      }
    } else if (allWebhooks.length > 0) {
      console.log(`   ⚠️  WARNING: Webhooks exist but none point to our app:`);
      for (const webhook of allWebhooks) {
        console.log(`      - ${webhook.callback_url}`);
      }
      console.log(`   → Action: Register our webhook or update existing one\n`);
    } else {
      console.log(`   ❌ No webhooks registered in Calendly`);
      console.log(`   → Action: Register webhook using Settings → Integrations\n`);
    }

  } catch (err) {
    console.error(`   ❌ Error: ${err.message}\n`);
  }
}

// Step 3: Summary and recommendations
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 Summary & Recommendations\n');

if (!hasCalendlyKey) {
  console.log('❌ CRITICAL: No Calendly API keys configured\n');
  console.log('   Actions required:');
  console.log('   1. Get your Calendly API key:');
  console.log('      → Go to Calendly → Account → Integrations → API & Webhooks');
  console.log('      → Generate a Personal Access Token');
  console.log('   2. Add it to your app:');
  console.log('      → Settings → Integrations → Calendly API Key\n');
  process.exit(1);
}

if (!hasActiveWebhook) {
  console.log('❌ CRITICAL: No active webhooks found\n');
  console.log('   This explains why derridgreen (and other events) aren\'t appearing!\n');
  console.log('   Actions required:');
  console.log('   1. Go to your app: Settings → Integrations');
  console.log('   2. Click "Register Webhook" button');
  console.log('   3. This will automatically set up the webhook in Calendly\n');
  console.log('   Alternative (manual):');
  console.log('   1. Go to Calendly → Account → Integrations → API & Webhooks');
  console.log('   2. Add new webhook subscription:');
  console.log(`      URL: ${supabaseUrl}/functions/v1/calendly-webhook`);
  console.log('      Events: invitee.created, invitee.canceled');
  console.log('      Scope: Organization\n');
  process.exit(1);
}

console.log('✅ SUCCESS: Webhook is properly configured!\n');
console.log('   Your webhooks are active and events should be flowing.\n');
console.log('   If derridgreen is still missing:');
console.log('   1. The event might not exist in Calendly');
console.log('   2. Check Supabase Edge Function logs for errors:');
console.log(`      ${supabaseUrl.replace('https://', 'https://supabase.com/dashboard/project/')}/functions/calendly-webhook/logs`);
console.log('   3. Try manual sync: Settings → Integrations → "Sync from Calendly"\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Verification complete!\n');
