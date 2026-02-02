#!/usr/bin/env node
/**
 * Debug derridgreen event - check timestamps and date range calculations
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

// Timezone offset for EST (UTC-5)
const EST_OFFSET = -5 * 60; // minutes

// Convert UTC date to EST
function toEST(utcDate) {
  const estDate = new Date(utcDate.getTime() + EST_OFFSET * 60 * 1000);
  return estDate;
}

// Get start/end of "today" in EST, expressed as UTC timestamps
function getTodayRangeEST() {
  const now = new Date();

  // Convert current time to EST
  const estNow = toEST(now);
  const estYear = estNow.getUTCFullYear();
  const estMonth = estNow.getUTCMonth();
  const estDay = estNow.getUTCDate();

  // Start of today in EST (midnight EST)
  const estMidnight = new Date(Date.UTC(estYear, estMonth, estDay, 0, 0, 0, 0));
  const utcStartOfDay = new Date(estMidnight.getTime() - EST_OFFSET * 60 * 1000);

  // End of today in EST (23:59:59 EST)
  const estEndOfDay = new Date(Date.UTC(estYear, estMonth, estDay, 23, 59, 59, 999));
  const utcEndOfDay = new Date(estEndOfDay.getTime() - EST_OFFSET * 60 * 1000);

  return { utcStartOfDay, utcEndOfDay, estYear, estMonth, estDay };
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  🔍 Debugging derridgreen@rocketmail.com Event');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Step 1: Show what "Today" means
const { utcStartOfDay, utcEndOfDay, estYear, estMonth, estDay } = getTodayRangeEST();
console.log('📅 Today\'s Date Range (EST):');
console.log(`   EST Date: ${estMonth + 1}/${estDay}/${estYear}`);
console.log(`   Start: ${toEST(utcStartOfDay).toISOString().replace('Z', ' UTC').replace('T', ' ')} (EST midnight)`);
console.log(`   End:   ${toEST(utcEndOfDay).toISOString().replace('Z', ' UTC').replace('T', ' ')} (EST 11:59pm)`);
console.log('\n   Stored in DB as UTC:');
console.log(`   Start: ${utcStartOfDay.toISOString()}`);
console.log(`   End:   ${utcEndOfDay.toISOString()}`);
console.log('');

// Step 2: Fetch derridgreen event
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 Searching for derridgreen@rocketmail.com events...\n');

const { data: derridEvents, error } = await supabase
  .from('events')
  .select('*')
  .eq('lead_email', 'derridgreen@rocketmail.com')
  .order('created_at', { ascending: false })
  .limit(5);

if (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

if (!derridEvents || derridEvents.length === 0) {
  console.log('❌ No events found for derridgreen@rocketmail.com\n');
  console.log('💡 Possible reasons:');
  console.log('   1. Event hasn\'t been created yet');
  console.log('   2. Email address is spelled differently');
  console.log('   3. Event was deleted\n');
  process.exit(0);
}

console.log(`✅ Found ${derridEvents.length} event(s):\n`);

for (const event of derridEvents) {
  const bookedAtUTC = event.booked_at ? new Date(event.booked_at) : (event.created_at ? new Date(event.created_at) : null);
  const scheduledAtUTC = event.scheduled_at ? new Date(event.scheduled_at) : null;

  console.log(`📋 Event ID: ${event.id}`);
  console.log(`   Lead: ${event.lead_name}`);
  console.log(`   Status: ${event.call_status || 'N/A'}`);
  console.log('');

  if (bookedAtUTC) {
    const bookedAtEST = toEST(bookedAtUTC);
    const isInRange = bookedAtUTC >= utcStartOfDay && bookedAtUTC <= utcEndOfDay;

    console.log(`   📅 Booked At (when call was booked):`);
    console.log(`      UTC: ${bookedAtUTC.toISOString()}`);
    console.log(`      EST: ${bookedAtEST.toISOString().replace('Z', '').replace('T', ' ')}`);
    console.log(`      ${isInRange ? '✅ IS IN' : '❌ NOT IN'} today's range`);
    console.log('');
  }

  if (scheduledAtUTC) {
    const scheduledAtEST = toEST(scheduledAtUTC);
    console.log(`   📅 Scheduled At (when call is scheduled for):`);
    console.log(`      UTC: ${scheduledAtUTC.toISOString()}`);
    console.log(`      EST: ${scheduledAtEST.toISOString().replace('Z', '').replace('T', ' ')}`);
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Step 3: Check how many events ARE in today's range
console.log('📊 Checking all events booked today...\n');

const { data: todayEvents, error: todayError } = await supabase
  .from('events')
  .select('id, lead_name, lead_email, booked_at, created_at')
  .gte('booked_at', utcStartOfDay.toISOString())
  .lte('booked_at', utcEndOfDay.toISOString())
  .order('booked_at', { ascending: false })
  .limit(10);

if (todayError) {
  console.error('❌ Error:', todayError.message);
} else {
  console.log(`Found ${todayEvents?.length || 0} events booked today:`);
  if (todayEvents && todayEvents.length > 0) {
    for (const event of todayEvents.slice(0, 5)) {
      const bookedAt = new Date(event.booked_at || event.created_at);
      const bookedAtEST = toEST(bookedAt);
      console.log(`  - ${event.lead_name} (${event.lead_email})`);
      console.log(`    Booked: ${bookedAtEST.toISOString().replace('Z', '').replace('T', ' ')} EST`);
    }
  }
}

console.log('\n✅ Debug complete!\n');
