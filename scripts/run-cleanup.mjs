#!/usr/bin/env node
/**
 * Run database cleanup - delete duplicates and check for derridgreen event
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load env from .env file
try {
  const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  const envVars = {};
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
} catch (e) {
  console.log('⚠️  Could not load .env file, using environment variables');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   VITE_SUPABASE_PUBLISHABLE_KEY:', process.env.VITE_SUPABASE_PUBLISHABLE_KEY ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  🧹 Database Cleanup & Debug Tool');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Step 1: Find duplicates
console.log('🔍 Step 1: Finding duplicate events...\n');

const { data: duplicateCheck, error: dupError } = await supabase.rpc('find_duplicates', {}, { count: 'exact' });

if (dupError) {
  console.log('⚠️  RPC function not available, using direct query...\n');

  // Get all events
  const { data: allEvents, error } = await supabase
    .from('events')
    .select('id, lead_email, scheduled_at, event_name, created_at, lead_name')
    .not('lead_email', 'is', null)
    .not('scheduled_at', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching events:', error);
    process.exit(1);
  }

  // Find duplicates manually
  const grouped = new Map();
  for (const event of allEvents) {
    const key = `${event.lead_email}|${event.scheduled_at}|${event.event_name || ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(event);
  }

  const duplicates = Array.from(grouped.values()).filter(group => group.length > 1);

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found!');
  } else {
    console.log(`📊 Found ${duplicates.length} duplicate groups:\n`);

    for (const [index, group] of duplicates.entries()) {
      const keepEvent = group[0];
      const deleteEvents = group.slice(1);

      console.log(`${index + 1}. ${group[0].lead_name} (${group[0].lead_email})`);
      console.log(`   Scheduled: ${new Date(group[0].scheduled_at).toLocaleString()}`);
      console.log(`   Duplicates: ${group.length} total, ${deleteEvents.length} to delete`);
      console.log(`   ✅ KEEP:   ${keepEvent.id}`);

      for (const event of deleteEvents) {
        console.log(`   ❌ DELETE: ${event.id}`);

        // Delete this duplicate
        const { error: delError } = await supabase
          .from('events')
          .delete()
          .eq('id', event.id);

        if (delError) {
          console.error(`      ❌ Error deleting:`, delError.message);
        } else {
          console.log(`      ✓ Deleted successfully`);
        }
      }
      console.log('');
    }

    console.log(`✅ Deleted ${duplicates.reduce((sum, g) => sum + g.length - 1, 0)} duplicate events\n`);
  }
}

// Step 2: Check for derridgreen event
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 Step 2: Checking for derridgreen@rocketmail.com...\n');

const { data: derridEvents, error: derridError } = await supabase
  .from('events')
  .select('*')
  .eq('lead_email', 'derridgreen@rocketmail.com')
  .order('created_at', { ascending: false })
  .limit(5);

if (derridError) {
  console.error('❌ Error fetching derridgreen event:', derridError);
} else if (!derridEvents || derridEvents.length === 0) {
  console.log('❌ No events found for derridgreen@rocketmail.com');
} else {
  console.log(`✅ Found ${derridEvents.length} event(s) for derridgreen@rocketmail.com:\n`);

  for (const event of derridEvents) {
    const bookedAt = new Date(event.booked_at || event.created_at);
    const scheduledAt = new Date(event.scheduled_at);

    console.log(`📅 Event ID: ${event.id}`);
    console.log(`   Lead: ${event.lead_name}`);
    console.log(`   Event: ${event.event_name || 'N/A'}`);
    console.log(`   Booked: ${bookedAt.toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
    console.log(`   Scheduled: ${scheduledAt.toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
    console.log(`   Status: ${event.call_status}`);
    console.log(`   Closer: ${event.closer_name || 'Not assigned'}`);
    console.log('');
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Cleanup complete!\n');
