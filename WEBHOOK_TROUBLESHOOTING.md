# Webhook Troubleshooting Guide

## Issue: Event Not Appearing in Dashboard

If an event was booked in Calendly but isn't showing up in the dashboard, follow this guide.

### Step 1: Verify Event Exists in Database

Run this SQL in Supabase SQL Editor:

```sql
-- Quick check for specific email
SELECT
  id,
  lead_name,
  lead_email,
  booked_at AT TIME ZONE 'America/New_York' as when_booked_est,
  scheduled_at AT TIME ZONE 'America/New_York' as meeting_scheduled_est,
  call_status,
  organization_id
FROM events
WHERE lead_email = 'example@email.com'  -- Replace with actual email
ORDER BY booked_at DESC;

-- Show recent bookings for comparison
SELECT
  lead_name,
  lead_email,
  booked_at AT TIME ZONE 'America/New_York' as when_booked_est,
  call_status
FROM events
WHERE booked_at >= NOW() - INTERVAL '48 hours'
ORDER BY booked_at DESC
LIMIT 20;
```

### Step 2: Check Webhook Logs

1. Go to **Supabase Dashboard** → **Edge Functions** → `calendly-webhook` → **Logs**
2. Look for entries around the time the booking was made
3. Check for:
   - ✅ Success: `"Successfully created event for: [email]"`
   - ❌ Error messages
   - ⚠️ Rate limit warnings
   - 🔍 No logs = webhook didn't fire

### Step 3: Verify Calendly Webhook Configuration

**Location:** Calendly → Account Settings → Integrations → Webhooks

**Required Configuration:**
- Webhook URL: `https://[your-project-ref].supabase.co/functions/v1/calendly-webhook`
- Status: Active/Enabled
- Events subscribed:
  - ✅ `invitee.created`
  - ✅ `invitee.canceled`

### Step 4: Verify Event Exists in Calendly

1. Go to **Calendly** → **Scheduled Events**
2. Search for the email address
3. If event doesn't exist in Calendly → it was never created or was deleted
4. If event exists in Calendly but not in database → webhook failed

---

## Solutions

### Solution 1: Manual Sync (Recommended)

If the event exists in Calendly but not in your database:

1. Go to app **Settings** → **Integrations**
2. Click **"Sync from Calendly"** button
3. This will pull all recent events from Calendly using the API

### Solution 2: Reschedule

Have the lead cancel and rebook the event:
- This will trigger fresh webhooks
- Ensures the event gets captured

### Solution 3: Fix Webhook Configuration

If webhook isn't configured or URL is wrong:

1. Delete old webhook subscription in Calendly (if exists)
2. Create new webhook subscription:
   - URL: `https://[project-ref].supabase.co/functions/v1/calendly-webhook`
   - Events: `invitee.created`, `invitee.canceled`
3. Test with a new booking

### Solution 4: Check Rate Limiting

If webhooks are being blocked by rate limiting:

```sql
-- Check recent rate limit hits
SELECT *
FROM rate_limit_logs
WHERE endpoint = 'calendly-webhook'
  AND created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

If rate limited, increase limits in `calendly-webhook/index.ts`:
```typescript
const RATE_LIMIT_MAX_REQUESTS = 100; // Increase this
const RATE_LIMIT_WINDOW_MINUTES = 1;  // Or increase this
```

---

## Common Issues

### Issue: Wrong Organization

Event created under wrong organization or no organization:

```sql
-- Check organization assignment
SELECT id, lead_email, organization_id, lead_name
FROM events
WHERE lead_email = 'example@email.com';

-- Fix if needed
UPDATE events
SET organization_id = '[correct-org-id]'
WHERE lead_email = 'example@email.com' AND organization_id IS NULL;
```

### Issue: Duplicate Events

Multiple webhooks fired for same booking:

```sql
-- Find duplicates
SELECT lead_email, scheduled_at, COUNT(*) as count
FROM events
GROUP BY lead_email, scheduled_at, event_name
HAVING COUNT(*) > 1;
```

Run the cleanup migration to remove duplicates.

### Issue: Timezone Confusion

"Calls Booked Today" shows wrong events:

- Dashboard uses EST timezone
- `booked_at` = when booking was created (Calendly "Event Created Date & Time")
- `scheduled_at` = when meeting is scheduled for (Calendly "Start Date & Time")
- "Today" range: midnight EST to 11:59pm EST (5am UTC to 4:59am UTC next day)

---

## Need More Help?

Check these files:
- `/tmp/webhook_debug_guide.md` - Detailed debugging steps
- `/tmp/quick_derrid_check.sql` - Quick SQL check
- `scripts/debug-derrid-event.mjs` - Automated debugging script

Run the script:
```bash
node scripts/debug-derrid-event.mjs
```
