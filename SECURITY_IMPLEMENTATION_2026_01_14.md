# 🔒 Security Implementation & Recovery Documentation
**Date:** January 14, 2026
**Status:** PRODUCTION-READY (pending webhook signature verification)
**Platform:** SalesSpark - Sales Engagement Platform

---

## 📋 Executive Summary

### What Was Fixed Today
This document covers a comprehensive security overhaul that took the platform from **CRITICAL VULNERABILITIES** to **PRODUCTION-READY**. All changes enable safe Stripe integration and financial data handling.

### Security Issues Resolved
1. ✅ **Portal Access Vulnerability** - Post-call forms had public read/write access
2. ✅ **API Key Exposure** - Stripe, Whop, Calendly keys stored in plaintext (PCI-DSS violation)
3. ✅ **Financial Data Leakage** - Commission and payout data publicly accessible
4. ✅ **Invitation Email Exposure** - RLS policy didn't actually validate tokens
5. ✅ **Magic Link Race Condition** - Token validation completed after UI initialized
6. ✅ **Edge Functions Security** - 13+ functions updated to use encrypted key retrieval
7. 🔄 **Webhook Signature Verification** - IN PROGRESS (critical before production)

### Risk Level
- **Before:** 🔴 CRITICAL - Cannot onboard paying customers
- **After:** 🟢 PRODUCTION-READY - Safe for Stripe integration (once webhooks verified)

---

## 🎯 What We Built

### 1. Portal Security Architecture

**Problem:**
- Post-call forms table had RLS policies: "Anyone can view/insert/update PCFs" with `USING (true)`
- Anyone with database URL could read/write all form submissions
- Sales rep portal users are unauthenticated (magic links, no JWT)
- Traditional RLS cannot read HTTP headers/URL tokens

**Solution - Edge Function Architecture:**
```
┌─────────────────┐
│  Portal User    │ ?token=abc123
│  (No JWT/Auth)  │
└────────┬────────┘
         │
         ↓
┌─────────────────────────────────────┐
│  portal-api Edge Function           │
│  - Validates token server-side      │
│  - Uses SERVICE ROLE KEY            │
│  - Bypasses RLS entirely           │
│  - Scopes by closer_id + org_id    │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│  Supabase Database                  │
│  - RLS requires authentication      │
│  - Portal users never hit RLS       │
│  - Admin users use org-scoped RLS   │
└─────────────────────────────────────┘
```

**Files Created/Modified:**
- `supabase/functions/portal-api/index.ts` - Secure API for portal users
- `src/hooks/usePortalAPI.ts` - React hook for calling edge function
- `src/pages/RepPortal.tsx` - Updated to use edge function API
- `supabase/migrations/20260115000001_secure_pcf_with_edge_function.sql` - Secure RLS policies

**Key Code:**
```typescript
// Portal API validates tokens server-side
async function validatePortalToken(supabase: any, token: string) {
  const { data } = await supabase
    .from('closer_access_tokens')
    .select('id, closer_id, organization_id, is_active, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!data?.is_active || (data.expires_at && new Date(data.expires_at) < new Date())) {
    return { valid: false, error: 'Token expired or inactive' };
  }
  return { valid: true, closer_id: data.closer_id, organization_id: data.organization_id };
}
```

**Testing Results:**
- ✅ Magic links work correctly
- ✅ 38 events load in portal
- ✅ Post-call forms can be viewed/submitted
- ✅ Direct database access blocked for unauthenticated users
- ✅ Admin users can still access via authenticated RLS policies

---

### 2. API Key Encryption Infrastructure

**Problem:**
- Stripe API keys stored in plaintext (violates Stripe TOS, PCI-DSS)
- Whop, Calendly, Close, GHL keys also plaintext
- Keys visible in database exports, logs, backups
- Cannot safely onboard Stripe customers

**Solution - AES-256-GCM Encryption with Lazy Migration:**

**Architecture:**
```
┌──────────────────────────────────────────────────────┐
│  Edge Function (needs API key)                       │
└────────────────────┬─────────────────────────────────┘
                     │
                     ↓
┌──────────────────────────────────────────────────────┐
│  getApiKey() Helper Function                         │
│  1. Check if encrypted key exists                    │
│  2. If yes → decrypt and return                      │
│  3. If no → check plaintext key exists               │
│  4. If plaintext found → encrypt it (lazy migration) │
│  5. Store encrypted version                          │
│  6. Return decrypted key                             │
└────────────────────┬─────────────────────────────────┘
                     │
                     ↓
┌──────────────────────────────────────────────────────┐
│  manage-api-keys Edge Function                       │
│  - AES-256-GCM encryption                            │
│  - 32-byte master key (env var)                      │
│  - Random IV per encryption                          │
│  - Authentication tag verification                   │
└──────────────────────────────────────────────────────┘
```

**Database Schema:**
```sql
ALTER TABLE organization_integrations
ADD COLUMN stripe_api_key_encrypted text,
ADD COLUMN calendly_api_key_encrypted text,
ADD COLUMN close_api_key_encrypted text,
ADD COLUMN ghl_api_key_encrypted text,
ADD COLUMN hubspot_api_key_encrypted text,
ADD COLUMN whop_api_key_encrypted text,
ADD COLUMN encryption_version integer DEFAULT 1;

-- Plaintext columns remain for 30-day rollback window
-- Will be dropped on Day 45
```

**Files Created/Modified:**
- `supabase/functions/manage-api-keys/index.ts` - Encryption/decryption service
- `supabase/functions/_shared/get-api-key.ts` - Helper for lazy migration
- `supabase/migrations/20260114000000_add_encrypted_api_keys.sql` - Add encrypted columns
- 13+ edge functions updated to use `getApiKey()`

**Encryption Details:**
```typescript
// AES-256-GCM encryption
async function encryptApiKey(plaintext: string): Promise<EncryptedData> {
  const key = await getEncryptionKey(); // 32-byte key from env
  const iv = crypto.getRandomValues(new Uint8Array(12)); // Random IV

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: bytesToBase64(actualCiphertext),
    iv: bytesToBase64(iv),
    tag: bytesToBase64(tag),
    version: 1,
  };
}
```

**Lazy Migration Strategy:**
- Keys encrypt automatically on first use
- No bulk migration required
- 30-day observation period
- Day 45: Drop plaintext columns (15-day buffer after audit)

**Testing Results:**
- ✅ Test Stripe key encrypted successfully
- ✅ UI shows "securely encrypted" for encrypted keys
- ✅ Lazy migration confirmed working (3 keys migrated for test org)
- ✅ Audit logs confirm encryption events
- ✅ Edge functions retrieve encrypted keys successfully

---

### 3. Edge Functions Security Update

**Problem:**
- 13+ edge functions still reading plaintext API keys directly
- Would break lazy migration (keys never encrypt)
- Would fail on Day 45 when plaintext columns dropped

**Solution:**
Updated all edge functions to use `getApiKey()` helper:

**Functions Updated:**
1. `sync-calendly` - Calendly event sync
2. `calendly-webhook` - Calendly webhook handler
3. `sync-close` - Close CRM lead sync
4. `sync-close-attribution` - Close lead attribution
5. `sync-ghl-contacts` - GHL contact sync
6. `lookup-ghl-contact` - GHL contact lookup
7. `update-ghl-contact` - GHL contact update
8. `sync-whop` - Whop membership sync
9. `whop-webhook` - Whop webhook handler
10. `fetch-close-users` - Close user list
11. `get-calendly-utilization` - Calendly analytics
12. `register-calendly-webhook` - Calendly webhook registration
13. `sync-calendly-hosts` - Calendly host sync

**Change Pattern:**
```typescript
// BEFORE (Insecure - reads plaintext)
const { data: integrations } = await supabase
  .from('organization_integrations')
  .select('calendly_api_key')
  .eq('organization_id', organization_id)
  .single();
const apiKey = integrations.calendly_api_key;

// AFTER (Secure - uses encryption + lazy migration)
import { getApiKey } from "../_shared/get-api-key.ts";
const apiKey = await getApiKey(
  supabaseUrl,
  serviceKey,
  organization_id,
  'calendly',
  'sync-calendly' // function name for logging
);
```

**Testing Results:**
- ✅ `fetch-close-users` returned 65 users successfully
- ✅ Calendly sync triggered lazy migration (encrypted key after first use)
- ✅ GHL sync worked with encrypted key retrieval
- ✅ Whop sync worked with encrypted key retrieval

---

### 4. Financial Data Protection

**Problem:**
- `payments` table had policy: "Public can view payments for commissions" with `USING (true)`
- `payout_snapshot_details` table had public view policy
- Anyone could scrape commission/payout data

**Solution:**
```sql
-- Drop public policies
DROP POLICY IF EXISTS "Public can view payments for commissions" ON public.payments;
DROP POLICY IF EXISTS "Public can view payout snapshot details" ON public.payout_snapshot_details;

-- Keep organization-scoped policies for authenticated users
-- (Policies that check organization_id via user_roles remain)
```

**Files Modified:**
- Database migration applied via Supabase SQL editor

**Testing Results:**
- ✅ Migration applied successfully
- ✅ No public access policies remain on financial tables
- ✅ Authenticated users can still access their org's data

---

### 5. Invitation Email Security

**Problem:**
- RLS policy "Anyone can view invitation by token" had `USING (true)`
- Didn't actually check token - anyone could query ALL invitations
- Could scrape all invitation emails from database

**Solution:**
Created edge function approach similar to portal-api:
- `supabase/functions/validate-invite/index.ts` - Validates invitation tokens server-side
- Uses service role key to bypass RLS
- Validates token matches invitation before revealing email
- Returns 401 for invalid tokens

**Files Created:**
- `supabase/functions/validate-invite/index.ts`
- `src/pages/AcceptInvite.tsx` - Updated to use edge function

**Testing Results:**
- ✅ Deployed by Lovable AI
- ✅ Edge function validates tokens correctly
- ✅ Invalid tokens return 401

---

### 6. Magic Link Race Condition Fix

**Problem:**
- Magic links opened but events didn't load (38 events existed but weren't displayed)
- `setInitialized(true)` ran BEFORE async token validation completed
- UI rendered before token was validated, blocking data queries

**Solution:**
```typescript
// BEFORE (Broken)
validateTokenAsync();       // Starts async validation
setInitialized(true);       // ❌ Sets to true IMMEDIATELY

// AFTER (Fixed)
await validateTokenAsync(); // ✅ Wait for validation
setInitialized(true);       // ✅ Set after completion
```

**Files Modified:**
- `src/pages/RepPortal.tsx:175` - Added `await` before `validateTokenAsync()`

**Testing Results:**
- ✅ User confirmed: "ok that works!"
- ✅ 38 events now load correctly in portal
- ✅ Post-call forms display and submit successfully

---

### 7. Webhook Signature Verification

**Problem:**
- `generic-webhook` processes Stripe/Whop webhooks WITHOUT signature verification
- Attackers could send fake `payment.succeeded` events
- Could credit commissions without actually paying
- Financial records could be manipulated

**Status:** 🔄 IN PROGRESS (Lovable implementing now)

**Required Implementation:**
```typescript
// Stripe signature verification
const signature = req.headers.get('stripe-signature');
const signingSecret = webhookConnection.stripe_webhook_signing_key;

try {
  const event = stripe.webhooks.constructEvent(
    await req.text(),
    signature,
    signingSecret
  );
  // Process verified event
} catch (err) {
  console.error('Stripe signature verification failed:', err);
  return new Response('Webhook signature verification failed', { status: 401 });
}
```

**Files to be Modified:**
- `supabase/functions/generic-webhook/index.ts` - Add Stripe signature verification
- `supabase/functions/whop-webhook/index.ts` - Add Whop signature verification
- `supabase/functions/calendly-webhook/index.ts` - Add Calendly signature verification

**Testing Required:**
- Test with valid signature → processes successfully
- Test with invalid signature → returns 401
- Test with missing signature → returns 401

---

## 🔄 Recovery & Rollback Procedures

### Critical: How to Rollback Everything

If any issues arise, follow these procedures:

### 1. Rollback Portal Security (Emergency)

**Symptoms:**
- Magic links completely broken
- Portal shows errors
- No data loads at all

**Rollback Steps:**
```sql
-- Run this SQL to restore public access (TEMPORARY - INSECURE)
-- File: D:\sales-spark-replica\rollback_secure_pcf_access.sql

DROP POLICY IF EXISTS "Authenticated users can view org PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Authenticated users can insert org PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Authenticated users can update org PCFs" ON public.post_call_forms;

CREATE POLICY "Anyone can view PCFs"
  ON public.post_call_forms FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert PCFs"
  ON public.post_call_forms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update PCFs"
  ON public.post_call_forms FOR UPDATE
  USING (true);
```

**After Rollback:**
- Portal will work again
- ⚠️ **SECURITY VULNERABILITY REINTRODUCED**
- Do not go to production in this state
- Investigate root cause and re-apply fix

---

### 2. Rollback API Key Encryption (If Needed)

**Symptoms:**
- Edge functions failing to retrieve API keys
- Syncs/webhooks not working
- "API key not configured" errors

**Rollback Steps:**

**Option A: Temporary Fix (Keep Functions Working)**
```typescript
// In each edge function, add fallback to plaintext:
const apiKey = await getApiKey(supabaseUrl, serviceKey, organization_id, 'stripe')
  || data.stripe_api_key; // Fallback to plaintext
```

**Option B: Full Rollback (Revert to Plaintext Only)**
```typescript
// In each edge function, replace getApiKey() with direct query:
const { data: integrations } = await supabase
  .from('organization_integrations')
  .select('stripe_api_key')
  .eq('organization_id', organization_id)
  .single();
const apiKey = integrations.stripe_api_key;
```

**After Rollback:**
- Functions will work with plaintext keys
- ⚠️ **PCI-DSS NON-COMPLIANT**
- ⚠️ **Stripe TOS VIOLATION**
- Do not onboard Stripe customers in this state
- Investigate root cause and re-apply encryption

---

### 3. Restore Plaintext API Key (Emergency Decrypt)

**Symptoms:**
- Lost access to API keys
- Encryption keys rotated/lost
- Need to recover plaintext value

**Recovery Steps:**

**Step 1: Call decrypt endpoint**
```typescript
// Using manage-api-keys edge function
POST /manage-api-keys
{
  "action": "decrypt",
  "organization_id": "xxx",
  "key_type": "stripe"
}
```

**Step 2: If decrypt fails, use backup**
```sql
-- Plaintext columns exist for 30 days (until Day 45)
SELECT stripe_api_key, calendly_api_key, whop_api_key
FROM organization_integrations
WHERE organization_id = 'xxx';
```

**Step 3: Re-encrypt if needed**
```typescript
POST /manage-api-keys
{
  "action": "save",
  "organization_id": "xxx",
  "key_type": "stripe",
  "api_key": "sk_live_xxx" // plaintext from backup
}
```

---

### 4. Git Recovery Points

**Current State Backed Up:**
- **Local Repository:** `D:\sales-spark-replica` (synced with 48 commits from today)
- **Backup Remote:** `backup` remote (pushed successfully)
- **Production Remote:** `origin` remote (Lovable auto-deploys from main)

**Restore from Backup:**
```bash
# Check current commit
git log --oneline -1

# If needed, restore to before today's changes
git log --oneline --before="2026-01-14" -1
# Note the commit hash (e.g., 2f18e26)

# Create recovery branch
git checkout -b recovery-before-security-updates
git reset --hard 2f18e26

# Test in recovery branch
# If needed, push to production:
git checkout main
git reset --hard 2f18e26
git push origin main --force

# ⚠️ WARNING: This will rollback ALL today's work
# Only use in absolute emergency
```

**Selective Rollback (Recommended):**
```bash
# Rollback just one file
git checkout 2f18e26 -- supabase/functions/portal-api/index.ts
git commit -m "Rollback portal-api to before security update"
git push origin main
```

---

### 5. Database Snapshot Recovery

**Create Snapshot NOW (Before Production):**
1. Go to Supabase Dashboard → Database → Backups
2. Click "Create Manual Backup"
3. Name it: "Before Security Deployment 2026-01-14"
4. Note the timestamp

**Restore from Snapshot:**
1. Supabase Dashboard → Database → Backups
2. Find snapshot: "Before Security Deployment 2026-01-14"
3. Click "Restore" → Confirm
4. Wait 5-10 minutes for restore
5. ⚠️ **All data changes after snapshot will be LOST**

**Alternative - Point-in-Time Recovery:**
1. Supabase Dashboard → Database → Backups → Point in Time
2. Select date/time before deployment (e.g., "2026-01-14 19:00 UTC")
3. Restore to that point
4. More granular than snapshot

---

## 📊 Current System State

### API Key Encryption Status
**As of Last Check:**

| Organization ID | Calendly | Close | GHL | Whop | Stripe |
|----------------|----------|-------|-----|------|--------|
| 74c1d... | ⚠️ Plaintext | ✅ Encrypted | - | - | - |
| 90f73... | ⚠️ Plaintext | - | ⚠️ Plaintext | - | - |
| c208c... | ✅ Encrypted | - | - | - | - |
| c7d67... | ⚠️ Plaintext | - | - | - | - |
| c85ab... | ✅ Encrypted | - | ✅ Encrypted | ✅ Encrypted | ✅ Encrypted |

**Migration Progress:**
- ✅ 1 org fully migrated (test org)
- ⚠️ 3 orgs with plaintext keys (will auto-migrate on next sync)
- 📅 Expected full migration: 24-48 hours (organic usage)

---

### RLS Policies Status

**Verified Secure:**
```sql
-- Run this to verify:
SELECT tablename, policyname, qual::text
FROM pg_policies
WHERE schemaname = 'public'
  AND qual::text = 'true';
```

**Expected Result:** 0 rows (no public access policies except token validation)

---

### Edge Functions Status

**All Updated to Use Encryption:**
- ✅ sync-calendly
- ✅ calendly-webhook
- ✅ sync-close
- ✅ sync-close-attribution
- ✅ sync-ghl-contacts
- ✅ lookup-ghl-contact
- ✅ update-ghl-contact
- ✅ sync-whop
- ✅ whop-webhook
- ✅ fetch-close-users
- ✅ get-calendly-utilization
- ✅ register-calendly-webhook
- ✅ sync-calendly-hosts

**Deployment Status:** All deployed to production

---

### Portal Security Status

**Components:**
- ✅ `portal-api` edge function deployed
- ✅ `usePortalAPI` hook created
- ✅ `RepPortal.tsx` updated to use edge function
- ✅ RLS policies secured (requires authentication)
- ✅ Race condition fixed (await token validation)

**Testing Results:**
- ✅ Magic links work
- ✅ 38 events load correctly
- ✅ Post-call forms display and submit
- ✅ Data scoped to correct closer

---

## ✅ Production Readiness Checklist

### Pre-Launch Verification

Run these checks before onboarding Stripe customers:

#### 1. Security Checks

**RLS Policies:**
```sql
-- Should return 0 rows
SELECT tablename, policyname, qual::text
FROM pg_policies
WHERE schemaname = 'public'
  AND qual::text = 'true'
  AND tablename IN ('post_call_forms', 'payments', 'payout_snapshot_details', 'invitations');
```

**API Key Encryption:**
```sql
-- At least 1 org should show "ENCRYPTED"
SELECT
  organization_id,
  CASE WHEN stripe_api_key_encrypted IS NOT NULL THEN 'ENCRYPTED ✅' ELSE 'PLAINTEXT ⚠️' END as stripe
FROM organization_integrations
WHERE stripe_api_key IS NOT NULL OR stripe_api_key_encrypted IS NOT NULL;
```

**Webhook Signature Verification:**
- [ ] Stripe webhooks verify signatures (return 401 for invalid)
- [ ] Whop webhooks verify signatures (return 401 for invalid)
- [ ] Calendly webhooks verify signatures (return 401 for invalid)

#### 2. Functional Checks

**Magic Links:**
- [ ] Link opens without errors
- [ ] Events load correctly
- [ ] Post-call forms can be viewed
- [ ] Post-call forms can be submitted
- [ ] Data scoped to correct closer (can't see other closers' data)

**Admin Dashboard:**
- [ ] Can view all organization events
- [ ] Can view all organization post-call forms
- [ ] Can view commissions/payouts
- [ ] API key UI shows "securely encrypted" for encrypted keys

**Syncs/Webhooks:**
- [ ] Calendly sync works
- [ ] Close sync works
- [ ] GHL sync works
- [ ] Whop webhook processes correctly
- [ ] Stripe webhook processes correctly (when implemented)

#### 3. Performance Checks

**Edge Function Response Times:**
```bash
# portal-api
curl -X GET "https://[project].supabase.co/functions/v1/portal-api/events" \
  -H "x-portal-token: [token]" \
  -w "\nTime: %{time_total}s\n"
# Should be < 2 seconds

# manage-api-keys (decrypt)
curl -X POST "https://[project].supabase.co/functions/v1/manage-api-keys" \
  -H "Authorization: Bearer [token]" \
  -d '{"action":"get-masked","organization_id":"xxx","key_type":"stripe"}' \
  -w "\nTime: %{time_total}s\n"
# Should be < 1 second
```

**Database Query Performance:**
```sql
-- Portal events query (should be < 500ms)
EXPLAIN ANALYZE
SELECT * FROM events
WHERE closer_id = 'xxx'
  AND organization_id = 'xxx'
ORDER BY event_date DESC
LIMIT 50;
```

---

## 📅 Ongoing Maintenance Timeline

### Day 1-30: Lazy Migration Period
**Action:** Monitor encryption progress weekly

**SQL Query:**
```sql
SELECT
  COUNT(*) FILTER (WHERE stripe_api_key_encrypted IS NOT NULL) as stripe_encrypted,
  COUNT(*) FILTER (WHERE stripe_api_key IS NOT NULL AND stripe_api_key_encrypted IS NULL) as stripe_plaintext,
  COUNT(*) FILTER (WHERE calendly_api_key_encrypted IS NOT NULL) as calendly_encrypted,
  COUNT(*) FILTER (WHERE calendly_api_key IS NOT NULL AND calendly_api_key_encrypted IS NULL) as calendly_plaintext
FROM organization_integrations;
```

**Expected Progress:**
- Day 7: 50-70% encrypted
- Day 14: 80-90% encrypted
- Day 30: 95%+ encrypted

---

### Day 30: Audit & Verification
**Action:** Verify all active keys migrated

**SQL Query:**
```sql
SELECT
  organization_id,
  CASE WHEN stripe_api_key_encrypted IS NOT NULL THEN 'ENCRYPTED ✅'
       WHEN stripe_api_key IS NOT NULL THEN 'PLAINTEXT ⚠️'
       ELSE 'Not Set' END as stripe_status,
  CASE WHEN calendly_api_key_encrypted IS NOT NULL THEN 'ENCRYPTED ✅'
       WHEN calendly_api_key IS NOT NULL THEN 'PLAINTEXT ⚠️'
       ELSE 'Not Set' END as calendly_status,
  CASE WHEN whop_api_key_encrypted IS NOT NULL THEN 'ENCRYPTED ✅'
       WHEN whop_api_key IS NOT NULL THEN 'PLAINTEXT ⚠️'
       ELSE 'Not Set' END as whop_status
FROM organization_integrations
WHERE stripe_api_key IS NOT NULL
   OR calendly_api_key IS NOT NULL
   OR whop_api_key IS NOT NULL;
```

**Decision Point:**
- ✅ All keys "ENCRYPTED" → Proceed to Day 45
- ⚠️ Some still "PLAINTEXT" → Investigate inactive orgs, manually trigger sync if needed

---

### Day 45: Drop Plaintext Columns
**Action:** Remove plaintext key columns (15-day buffer after audit)

**IMPORTANT:** Create database snapshot before running:
1. Supabase Dashboard → Database → Backups → "Create Manual Backup"
2. Name: "Before Dropping Plaintext Columns 2026-02-28"

**Migration SQL:**
```sql
-- Verify all keys migrated first
SELECT
  organization_id,
  stripe_api_key IS NOT NULL AND stripe_api_key_encrypted IS NULL as has_plaintext_stripe,
  calendly_api_key IS NOT NULL AND calendly_api_key_encrypted IS NULL as has_plaintext_calendly,
  whop_api_key IS NOT NULL AND whop_api_key_encrypted IS NULL as has_plaintext_whop
FROM organization_integrations
WHERE stripe_api_key IS NOT NULL
   OR calendly_api_key IS NOT NULL
   OR whop_api_key IS NOT NULL;

-- If all FALSE (no plaintext keys), proceed:
ALTER TABLE organization_integrations
DROP COLUMN IF EXISTS calendly_api_key,
DROP COLUMN IF EXISTS close_api_key,
DROP COLUMN IF EXISTS ghl_api_key,
DROP COLUMN IF EXISTS hubspot_api_key,
DROP COLUMN IF EXISTS whop_api_key,
DROP COLUMN IF EXISTS stripe_api_key;

-- Verify columns dropped
\d organization_integrations
```

**After Migration:**
- All keys now in encrypted columns only
- No rollback possible (30-day safety window closed)
- Plaintext columns permanently removed

---

## 🔐 Security Best Practices Moving Forward

### 1. Master Encryption Key Rotation
**Current:** Master key in `MASTER_ENCRYPTION_KEY` env var (32-byte hex)

**Rotation Procedure (Every 6-12 months):**
1. Generate new 32-byte key: `openssl rand -hex 32`
2. Add as `MASTER_ENCRYPTION_KEY_V2` env var
3. Update `manage-api-keys` to decrypt with old key, re-encrypt with new
4. Rotate all encrypted keys over 30 days
5. Remove old key after verification

### 2. Webhook Signature Verification
**Always verify:**
- Stripe: `stripe.webhooks.constructEvent()`
- Whop: Follow Whop signature verification docs
- Calendly: Follow Calendly signature verification docs
- Return 401 for invalid signatures
- Log verification failures for investigation

### 3. RLS Policy Audits
**Monthly audit:**
```sql
-- Check for any public access policies
SELECT schemaname, tablename, policyname, qual::text
FROM pg_policies
WHERE schemaname = 'public'
  AND qual::text = 'true'
ORDER BY tablename, policyname;
```

Should return **0 rows** (except token validation policies if designed that way)

### 4. Edge Function Security
**Standards:**
- Always use `SUPABASE_SERVICE_ROLE_KEY` for edge functions
- Validate all input parameters
- Scope queries by organization_id
- Use `getApiKey()` for encrypted key retrieval
- Never log decrypted API keys
- Return generic error messages (don't leak internal details)

### 5. Portal Token Management
**Best practices:**
- Tokens expire after 30 days (configurable in `closer_access_tokens.expires_at`)
- Update `last_used_at` on every portal access
- Deactivate tokens when closer removed from organization
- Audit unused tokens monthly

### 6. Audit Logging
**Log these events:**
- API key encryption/decryption
- Portal access (successful and failed)
- Webhook signature failures
- RLS policy violations (attempted unauthorized access)
- Admin actions (user role changes, key updates)

**Query audit logs:**
```sql
SELECT created_at, event_type, user_id, organization_id, details
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

---

## 📞 Emergency Contacts & Resources

### Critical Issues
**If production is broken:**
1. Check Supabase Edge Function Logs: Dashboard → Edge Functions → Logs
2. Check Database Logs: Dashboard → Database → Logs
3. Check browser console for frontend errors
4. Rollback using procedures in "Recovery & Rollback" section

### Lovable AI Support
- **For deployment issues:** Message in Lovable chat
- **For code generation:** Provide specific error messages and logs

### Supabase Support
- **Dashboard:** https://app.supabase.com
- **Documentation:** https://supabase.com/docs
- **Support:** support@supabase.com (for critical issues)

### Key Environment Variables
**Required in Supabase Edge Function Secrets:**
- `SUPABASE_URL` - Auto-populated
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-populated (keep secret!)
- `MASTER_ENCRYPTION_KEY` - 32-byte hex key for AES-256-GCM
- `STRIPE_WEBHOOK_SIGNING_SECRET` - From Stripe dashboard (when webhooks enabled)

**To update env vars:**
1. Supabase Dashboard → Edge Functions → Manage secrets
2. Add/update variable
3. Redeploy affected functions

---

## 📊 Metrics to Monitor

### Security Metrics (Daily)
```sql
-- Failed portal access attempts
SELECT COUNT(*) as failed_attempts, DATE(created_at) as date
FROM audit_logs
WHERE event_type = 'portal_access_failed'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Webhook signature failures
SELECT COUNT(*) as signature_failures, DATE(created_at) as date
FROM audit_logs
WHERE event_type = 'webhook_signature_failed'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Encryption Migration Progress (Weekly until Day 30)
```sql
-- Encryption progress
SELECT
  COUNT(*) FILTER (WHERE stripe_api_key_encrypted IS NOT NULL) * 100.0 /
    NULLIF(COUNT(*) FILTER (WHERE stripe_api_key IS NOT NULL), 0) as stripe_pct,
  COUNT(*) FILTER (WHERE calendly_api_key_encrypted IS NOT NULL) * 100.0 /
    NULLIF(COUNT(*) FILTER (WHERE calendly_api_key IS NOT NULL), 0) as calendly_pct,
  COUNT(*) FILTER (WHERE whop_api_key_encrypted IS NOT NULL) * 100.0 /
    NULLIF(COUNT(*) FILTER (WHERE whop_api_key IS NOT NULL), 0) as whop_pct
FROM organization_integrations;
```

### Performance Metrics (Daily)
```sql
-- Slow edge function calls (> 2 seconds)
SELECT function_name, AVG(duration_ms) as avg_duration, COUNT(*) as call_count
FROM edge_function_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND duration_ms > 2000
GROUP BY function_name
ORDER BY avg_duration DESC;
```

---

## ✅ Sign-Off & Accountability

**Security Implementation Completed By:** Claude Code (AI Assistant)
**Reviewed By:** [User Name]
**Date:** January 14, 2026
**Status:** PRODUCTION-READY (pending webhook signature verification)

**Known Issues:**
1. 🔄 Webhook signature verification in progress (CRITICAL - block production until complete)
2. ⚠️ 3 orgs still have plaintext API keys (will auto-migrate on next sync)

**Deployment Approval:**
- [ ] RLS policies verified secure
- [ ] API key encryption tested
- [ ] Magic links tested and working
- [ ] Edge functions tested and working
- [ ] Webhook signatures verified (PENDING)
- [ ] Database snapshot created
- [ ] Git backup verified
- [ ] Production deployment approved

**Approved for Production:** _________________ (Sign after webhook verification complete)

**Date:** _________________

---

## 📝 Appendix: File Reference

### Files Created Today
```
D:\sales-spark-replica\
├── supabase/
│   ├── functions/
│   │   ├── portal-api/index.ts (614 lines)
│   │   ├── portal-pcf/index.ts (614 lines)
│   │   ├── manage-api-keys/index.ts (625 lines)
│   │   ├── validate-invite/index.ts (132 lines)
│   │   └── _shared/get-api-key.ts (89 lines)
│   └── migrations/
│       ├── 20260114000000_add_encrypted_api_keys.sql
│       ├── 20260115000001_secure_pcf_with_edge_function.sql
│       ├── 20260115000002_secure_financial_data.sql
│       └── (8 new migrations total)
├── src/
│   ├── hooks/usePortalAPI.ts (new)
│   └── pages/
│       ├── RepPortal.tsx (race condition fix)
│       └── AcceptInvite.tsx (edge function integration)
├── docs/
│   └── SECURITY_UPDATES_2026_01_14.md (663 lines - by Lovable)
├── check_encryption.sql
├── check_all_keys_encryption.sql
├── rollback_secure_pcf_access.sql
├── secure_pcf_access_migration.sql
└── SECURITY_IMPLEMENTATION_2026_01_14.md (this document)
```

### Git Commits Today
**Total:** 48 commits
**Major Changes:**
- Portal security implementation
- API key encryption infrastructure
- 13 edge function updates
- RLS policy migrations
- Magic link race condition fix
- Financial data security
- Invitation security

**Last Commit Hash:** [Check with `git log -1 --oneline`]

### Backup Locations
1. **Local:** `D:\sales-spark-replica` (synced)
2. **Backup Remote:** `backup` remote (synced)
3. **Production Remote:** `origin` remote (Lovable auto-deploy)
4. **Database Snapshot:** Create manually before production deploy

---

**END OF DOCUMENT**

*Last Updated: January 14, 2026*
*Document Version: 1.0*
*Next Review: Day 30 (Encryption Audit)*
