/**
 * Script to find and delete duplicate events
 *
 * Duplicates are defined as events with:
 * - Same lead_email
 * - Same scheduled_at time
 * - Same event_name
 *
 * Keeps the oldest event (first created_at) and deletes newer duplicates
 *
 * Usage:
 *   npx tsx scripts/cleanup-duplicates.ts --dry-run  (preview only)
 *   npx tsx scripts/cleanup-duplicates.ts --delete   (actually delete)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface Event {
  id: string;
  lead_name: string;
  lead_email: string;
  scheduled_at: string;
  event_name: string | null;
  created_at: string;
}

interface DuplicateGroup {
  lead_email: string;
  scheduled_at: string;
  event_name: string | null;
  events: Event[];
}

async function findDuplicates(): Promise<DuplicateGroup[]> {
  console.log('🔍 Searching for duplicate events...\n');

  // Fetch all events
  const { data: events, error } = await supabase
    .from('events')
    .select('id, lead_name, lead_email, scheduled_at, event_name, created_at')
    .not('lead_email', 'is', null)
    .not('scheduled_at', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching events:', error);
    throw error;
  }

  if (!events || events.length === 0) {
    console.log('✅ No events found');
    return [];
  }

  // Group events by lead_email + scheduled_at + event_name
  const grouped = new Map<string, Event[]>();

  for (const event of events) {
    const key = `${event.lead_email}|${event.scheduled_at}|${event.event_name || 'null'}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(event as Event);
  }

  // Find groups with duplicates
  const duplicates: DuplicateGroup[] = [];

  for (const [key, eventGroup] of grouped.entries()) {
    if (eventGroup.length > 1) {
      const [lead_email, scheduled_at, event_name] = key.split('|');
      duplicates.push({
        lead_email,
        scheduled_at,
        event_name: event_name === 'null' ? null : event_name,
        events: eventGroup,
      });
    }
  }

  return duplicates;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes('--delete');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🧹 Event Duplicate Cleanup Tool');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (isDryRun) {
    console.log('🔎 DRY RUN MODE - No changes will be made');
    console.log('   Run with --delete flag to actually delete duplicates\n');
  } else {
    console.log('⚠️  DELETE MODE - Duplicates will be removed!\n');
  }

  const duplicates = await findDuplicates();

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found! Database is clean.');
    return;
  }

  console.log(`📊 Found ${duplicates.length} duplicate groups:\n`);

  let totalToDelete = 0;
  const idsToDelete: string[] = [];

  // Display duplicates
  for (const [index, group] of duplicates.entries()) {
    const keepEvent = group.events[0]; // Keep oldest
    const deleteEvents = group.events.slice(1); // Delete rest
    totalToDelete += deleteEvents.length;

    console.log(`${index + 1}. ${group.lead_email}`);
    console.log(`   Event: ${group.event_name || 'N/A'}`);
    console.log(`   Scheduled: ${new Date(group.scheduled_at).toLocaleString()}`);
    console.log(`   Duplicates: ${group.events.length} total, ${deleteEvents.length} to delete`);
    console.log('');
    console.log(`   ✅ KEEP:   ${keepEvent.id} (created ${new Date(keepEvent.created_at).toLocaleString()})`);

    for (const event of deleteEvents) {
      console.log(`   ❌ DELETE: ${event.id} (created ${new Date(event.created_at).toLocaleString()})`);
      idsToDelete.push(event.id);
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📈 Summary:`);
  console.log(`   • ${duplicates.length} duplicate groups found`);
  console.log(`   • ${totalToDelete} events will be deleted`);
  console.log(`   • ${duplicates.length} events will be kept (oldest)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (isDryRun) {
    console.log('💡 This was a dry run. To actually delete duplicates, run:');
    console.log('   npx tsx scripts/cleanup-duplicates.ts --delete\n');
    return;
  }

  // Actually delete duplicates
  console.log('🗑️  Deleting duplicates...\n');

  for (const id of idsToDelete) {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`❌ Error deleting event ${id}:`, error);
    } else {
      console.log(`✅ Deleted event ${id}`);
    }
  }

  console.log(`\n✅ Cleanup complete! Deleted ${totalToDelete} duplicate events.`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
