# 🔐 How to Check Your Calendly Webhook Status

## Quick Check (2 minutes)

### Option 1: Check via Your App (Easiest)

1. **Open your Sales Spark app**
2. **Go to Settings → Integrations**
3. **Look for the "Calendly Integration" section**
4. **Check the webhook status indicator**:
   - ✅ Green/Active = Webhook is registered and working
   - ❌ Red/Inactive = Webhook needs to be registered

5. **If webhook is not active:**
   - Click **"Register Webhook"** button
   - This will automatically set it up

### Option 2: Check Directly in Calendly

1. **Go to Calendly** → https://calendly.com
2. **Click on your profile (top right)** → **Account**
3. **Go to Integrations → API & Webhooks**
4. **Click "Webhooks" tab**
5. **Look for an active webhook** with:
   - URL: `https://yrlbwzxphjtnivjbpzsq.supabase.co/functions/v1/calendly-webhook`
   - Events: `invitee.created`, `invitee.canceled`
   - Status: **Active**

---

## What You Should See

### ✅ GOOD - Webhook is Working:
```
Webhook Subscriptions:
✓ https://yrlbwzxphjtnivjbpzsq.supabase.co/functions/v1/calendly-webhook
  Events: invitee.created, invitee.canceled
  Status: Active
  Created: [date]
```

### ❌ BAD - No Webhook:
```
Webhook Subscriptions:
(empty) or webhook with different URL
```

---

## If Webhook is Missing or Inactive

### Fix #1: Register from Your App
1. Go to **Settings → Integrations**
2. Click **"Register Webhook"**
3. Wait for confirmation message
4. Test by booking a new test event in Calendly

### Fix #2: Register Manually in Calendly
1. Go to Calendly → Account → Integrations → API & Webhooks
2. Click **"Add Webhook"**
3. Fill in:
   - **Webhook URL**: `https://yrlbwzxphjtnivjbpzsq.supabase.co/functions/v1/calendly-webhook`
   - **Events**: Check ✅ `invitee.created` and ✅ `invitee.canceled`
   - **Scope**: Organization
4. Click **"Subscribe"**
5. Verify it shows as Active

---

## After Fixing Webhook

Once webhook is registered, you have 2 options:

### Option A: Sync Historical Events
1. Go to **Settings → Integrations**
2. Click **"Sync from Calendly"** button
3. This will pull all recent events including derridgreen

### Option B: Have Lead Reschedule
1. Cancel derridgreen's existing appointment in Calendly
2. Have them book a new one
3. The new webhook will catch it automatically

---

## Verify It's Working

After registration, test the webhook:

1. **Book a test event** in Calendly (use your own email)
2. **Wait 30 seconds**
3. **Check your Dashboard** → should see the new event
4. **If it appears** = ✅ Webhook working!
5. **If it doesn't appear** = ❌ Check Supabase logs (see below)

---

## Check Supabase Logs (if events still missing)

1. Go to: **https://supabase.com/dashboard/project/yrlbwzxphjtnivjbpzsq/functions/calendly-webhook/logs**
2. Look for recent webhook calls around the time events were booked
3. Check for:
   - ✅ Success: `"Successfully created event for: [email]"`
   - ❌ Error: Any error messages (rate limit, database errors, etc.)
   - ⚠️ Missing: No log entries = webhook didn't fire

---

## Common Issues

### Issue 1: Webhook Shows Active but Events Don't Appear
**Cause**: Database or organization mismatch
**Fix**: Check Supabase logs for errors, run SQL diagnostic

### Issue 2: Multiple Webhooks Listed
**Cause**: Old/duplicate webhooks
**Fix**: Delete old webhooks, keep only the one pointing to your Supabase URL

### Issue 3: 403/401 Errors in Logs
**Cause**: Missing or invalid Calendly API key
**Fix**: Re-add your Calendly API key in Settings → Integrations

### Issue 4: Events Missing organization_id
**Cause**: RLS policies filtering them out
**Fix**: Run SQL to assign organization_id:
```sql
UPDATE events
SET organization_id = '[your-org-id]'
WHERE organization_id IS NULL;
```

---

## Need More Help?

Run the diagnostic tools I created:

```bash
# Complete webhook verification
node scripts/verify-webhook.mjs

# Check for missing events
node scripts/diagnose-webhook.mjs

# Delete duplicate events
node scripts/run-cleanup.mjs
```

Or run the SQL diagnostic:
```bash
# Copy contents of /tmp/complete_webhook_diagnosis.sql
# Paste into Supabase SQL Editor and run
```

---

## Summary Checklist

- [ ] Calendly API key is configured in Settings → Integrations
- [ ] Webhook is registered and shows as **Active** in Calendly
- [ ] Webhook URL matches: `https://yrlbwzxphjtnivjbpzsq.supabase.co/functions/v1/calendly-webhook`
- [ ] Test event successfully appears in dashboard
- [ ] Supabase logs show no errors
- [ ] Run "Sync from Calendly" to get historical events

Once all checked, derridgreen (and all future events) should appear automatically! 🎉
