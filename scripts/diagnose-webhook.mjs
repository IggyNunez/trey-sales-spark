#!/usr/bin/env node
/**
 * Comprehensive webhook diagnostic tool
 * Checks for missing events, webhook logs, and configuration issues
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
console.log('  🔍 Webhook Diagnostic Tool');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Target email
const targetEmail = 'derridgreen@rocketmail.com';

// Step 1: Check if event exists
console.log('📊 Step 1: Checking for event in database...\n');

const { data: events, error: eventsError } = await supabase
  .from('events')
  .select('*')
  .ilike('lead_email', `%${targetEmail.split('@')[0]}%`)
  .order('created_at', { ascending: false })
  .limit(5);

if (eventsError) {
  console.error('❌ Error querying events:', eventsError.message);
} else if (!events || events.length === 0) {
  console.log(`❌ No events found for ${targetEmail}\n`);
  console.log('   Possible reasons:');
  console.log('   1. Calendly webhook never fired');
  console.log('   2. Webhook fired but failed/errored');
  console.log('   3. Email is spelled differently');
  console.log('   4. Event was deleted\n');
} else {
  console.log(`✅ Found ${events.length} event(s):\n`);
  for (const event of events) {
    const bookedAt = event.booked_at ? new Date(event.booked_at) : null;
    const scheduledAt = event.scheduled_at ? new Date(event.scheduled_at) : null;

    console.log(`   📅 ID: ${event.id}`);
    console.log(`      Lead: ${event.lead_name} (${event.lead_email})`);
    console.log(`      Status: ${event.call_status}`);
    if (bookedAt) {
      console.log(`      Booked: ${bookedAt.toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
    }
    if (scheduledAt) {
      console.log(`      Scheduled For: ${scheduledAt.toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
    }
    console.log('');
  }
}

// Step 2: Check recent bookings for comparison
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Step 2: Recent bookings (last 24 hours)...\n');

const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

const { data: recentEvents, error: recentError } = await supabase
  .from('events')
  .select('id, lead_name, lead_email, booked_at, call_status')
  .gte('booked_at', yesterday.toISOString())
  .order('booked_at', { ascending: false })
  .limit(10);

if (recentError) {
  console.error('❌ Error:', recentError.message);
} else if (recentEvents && recentEvents.length > 0) {
  console.log(`✅ Found ${recentEvents.length} recent booking(s):\n`);
  for (const event of recentEvents) {
    const bookedAt = new Date(event.booked_at);
    console.log(`   - ${event.lead_name} (${event.lead_email})`);
    console.log(`     Booked: ${bookedAt.toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
    console.log(`     Status: ${event.call_status}\n`);
  }
} else {
  console.log('⚠️  No events booked in the last 24 hours');
  console.log('   This might indicate a webhook issue!\n');
}

// Step 3: Check for rate limit logs
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Step 3: Checking rate limit logs...\n');

const { data: rateLimits, error: rateLimitError } = await supabase
  .from('rate_limit_logs')
  .select('*')
  .eq('endpoint', 'calendly-webhook')
  .gte('created_at', yesterday.toISOString())
  .order('created_at', { ascending: false })
  .limit(10);

if (rateLimitError) {
  console.log('ℹ️  No rate limit table or no access (this is OK)\n');
} else if (rateLimits && rateLimits.length > 0) {
  console.log(`⚠️  Found ${rateLimits.length} rate limit event(s) in last 24 hours:\n`);
  for (const log of rateLimits) {
    console.log(`   - ${new Date(log.created_at).toLocaleString()}`);
    console.log(`     Identifier: ${log.identifier}`);
    console.log(`     Count: ${log.request_count}\n`);
  }
  console.log('   ⚠️  Rate limiting may be blocking webhooks!\n');
} else {
  console.log('✅ No rate limit issues detected\n');
}

// Step 4: Check all event names for pattern matching
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Step 4: Unique event names in database...\n');

const { data: allEvents, error: allEventsError } = await supabase
  .from('events')
  .select('event_name')
  .not('event_name', 'is', null);

if (!allEventsError && allEvents) {
  const uniqueNames = [...new Set(allEvents.map(e => e.event_name))].sort();
  console.log(`✅ Found ${uniqueNames.length} unique event types:\n`);
  uniqueNames.forEach(name => console.log(`   - ${name}`));
  console.log('');
}

// Step 5: Check organizations
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Step 5: Organization setup...\n');

const { data: orgs, error: orgsError } = await supabase
  .from('organizations')
  .select('id, name')
  .limit(5);

if (!orgsError && orgs && orgs.length > 0) {
  console.log(`✅ Found ${orgs.length} organization(s):\n`);
  for (const org of orgs) {
    console.log(`   - ${org.name} (${org.id})`);

    // Check if this org has Calendly integration
    const { data: integration } = await supabase
      .from('organization_integrations')
      .select('calendly_api_key')
      .eq('organization_id', org.id)
      .maybeSingle();

    if (integration?.calendly_api_key && integration.calendly_api_key !== 'configured') {
      console.log(`     ✅ Calendly API configured`);
    } else {
      console.log(`     ⚠️  No Calendly API key configured`);
    }
  }
  console.log('');
}

// Step 6: Summary and recommendations
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 Summary & Recommendations\n');

if (!events || events.length === 0) {
  console.log('❌ ISSUE FOUND: Event not in database\n');
  console.log('   Recommended actions:');
  console.log('   1. Check Calendly → Scheduled Events for derridgreen@rocketmail.com');
  console.log('   2. If event exists in Calendly:');
  console.log('      → Check Supabase Edge Function logs:');
  console.log(`      → https://supabase.com/dashboard/project/${supabaseUrl.match(/https:\/\/([^.]+)/)?.[1]}/functions/calendly-webhook/logs`);
  console.log('   3. Verify Calendly webhook is configured:');
  console.log('      → Calendly → Account → Integrations → Webhooks');
  console.log(`      → URL should be: ${supabaseUrl}/functions/v1/calendly-webhook`);
  console.log('      → Events: invitee.created, invitee.canceled');
  console.log('   4. If webhook is missing/broken:');
  console.log('      → Use manual sync: Settings → Integrations → Sync from Calendly');
  console.log('      → Or have the lead cancel and rebook\n');
} else {
  console.log('✅ Event exists in database!');
  console.log('   The issue is likely with dashboard filtering or date range.\n');
}

if (recentEvents && recentEvents.length === 0) {
  console.log('⚠️  WARNING: No events booked in last 24 hours');
  console.log('   This might indicate webhook is not firing.\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Diagnostic complete!\n');
