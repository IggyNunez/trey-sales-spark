# New Supabase Project Setup Guide

## Step 1: Create New Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Choose organization or create one
4. Project name: `sales-spark-production` (or your choice)
5. Database password: **Save this securely!**
6. Region: Choose closest to your users
7. Click **"Create new project"** (takes ~2 minutes)

## Step 2: Get Your New Credentials

After project is created, go to **Settings → API** and copy:

| Credential | Where to find |
|------------|---------------|
| `Project URL` | Settings → API → Project URL |
| `anon/public key` | Settings → API → anon public |
| `service_role key` | Settings → API → service_role (keep secret!) |
| `Project ID` | From URL: `https://[PROJECT_ID].supabase.co` |

## Step 3: Run Database Schema

Go to **SQL Editor** and run these files in order:

### 3.1 Run Combined Schema
Copy the contents of `COMBINED_SCHEMA.sql` (I'll create this next)

### 3.2 Run Security Fixes
Copy the contents of `supabase/migrations/20260116000000_fix_dangerous_rls_policies.sql`

## Step 4: Set Up Edge Function Secrets

Go to **Edge Functions → Secrets** and add:

| Secret Name | Value |
|-------------|-------|
| `SUPABASE_URL` | Your new project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your new service_role key |
| `ENCRYPTION_MASTER_KEY` | Generate: `openssl rand -hex 32` |
| `RESEND_API_KEY` | Your Resend API key (for emails) |

## Step 5: Deploy Edge Functions

Install Supabase CLI:
```bash
npm install -g supabase
```

Login and link:
```bash
supabase login
supabase link --project-ref YOUR_NEW_PROJECT_ID
```

Deploy all functions:
```bash
supabase functions deploy --all
```

## Step 6: Update Vercel Environment

In Vercel Dashboard → Settings → Environment Variables, update:

| Variable | New Value |
|----------|-----------|
| `VITE_SUPABASE_URL` | `https://YOUR_NEW_PROJECT_ID.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your new anon key |
| `VITE_SUPABASE_PROJECT_ID` | Your new project ID |

Then **Redeploy** in Vercel.

## Step 7: Migrate Data (Optional)

If you need to migrate existing data from Lovable's Supabase:

### Export from old project:
```bash
# In Lovable's Supabase SQL Editor, run:
COPY (SELECT * FROM organizations) TO STDOUT WITH CSV HEADER;
COPY (SELECT * FROM profiles) TO STDOUT WITH CSV HEADER;
# ... repeat for each table
```

### Import to new project:
```bash
# In new Supabase SQL Editor:
COPY organizations FROM STDIN WITH CSV HEADER;
# Paste CSV data
```

Or use pg_dump/pg_restore for full migration.

## Step 8: Update Webhooks

Update webhook URLs in external services:

- **Calendly**: Settings → Webhooks → Update URL to new Supabase
- **Stripe**: Developers → Webhooks → Update endpoint
- **Whop**: Settings → Webhooks → Update URL
- **GHL**: Settings → Webhooks → Update URL

New webhook URL format:
```
https://YOUR_NEW_PROJECT_ID.supabase.co/functions/v1/[function-name]
```

## Step 9: Update CORS Origins

Edit `supabase/functions/_shared/cors.ts` and add your Vercel domain:
```typescript
const ALLOWED_ORIGINS = [
  "https://your-app.vercel.app",  // Add your Vercel URL
  "https://your-custom-domain.com",  // Add custom domain if any
  // ... existing origins
];
```

Then redeploy functions.

---

## Quick Checklist

- [ ] Created new Supabase project
- [ ] Ran COMBINED_SCHEMA.sql
- [ ] Ran RLS security fixes
- [ ] Added Edge Function secrets
- [ ] Deployed edge functions (`supabase functions deploy --all`)
- [ ] Updated Vercel environment variables
- [ ] Redeployed Vercel
- [ ] Migrated data (if needed)
- [ ] Updated webhook URLs in external services
- [ ] Tested login/signup
- [ ] Tested all integrations

---

## Estimated Time: 1-2 hours

Most time spent on:
- Deploying edge functions (~15 min)
- Migrating data (~30 min if needed)
- Testing (~30 min)
