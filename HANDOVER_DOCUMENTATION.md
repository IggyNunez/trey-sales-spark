# Sales Dashboard - Technical Handover

**Updated:** Jan 12, 2026

---

## Quick Overview

This is a multi-tenant sales tracking platform. Teams use it to track Calendly bookings, record call outcomes, and attribute revenue to closers/setters. It pulls data from Calendly, Close CRM, Go High Level, and processes payments from Whop/Stripe.

The whole thing runs on Lovable Cloud (Postgres + Edge Functions). Frontend is React/TypeScript.

---

## How It's Built

**Frontend:** React 18 + Vite + Tailwind + shadcn/ui components. State managed with TanStack Query.

**Backend:** Lovable Cloud handles auth, database, and serverless functions. Everything's in TypeScript.

**Database:** Postgres with Row Level Security. All data is scoped to organizations - users only see their org's stuff.

```
Frontend (React) 
    ↓
Lovable Cloud
    ├── Auth (email-based)
    ├── Postgres DB  
    └── Edge Functions (webhooks, syncs, etc.)
         ↓
External APIs: Calendly, Close, GHL, Whop, Stripe, Slack
```

---

## Database - Main Tables

**Core stuff:**
- `organizations` - each team/company
- `organization_members` - who's in which org, what role
- `profiles` - user info
- `user_roles` - admin/sales_rep/super_admin

**Sales data:**
- `events` - calendar bookings from Calendly
- `leads` - contact records
- `post_call_forms` - what happened on each call
- `payments` - money in from Whop/Stripe
- `closers` / `setters` - the sales team

**Config:**
- `organization_integrations` - API keys per org (Calendly, Close, GHL, Whop)
- `webhook_connections` - payment webhook endpoints
- `form_configs` - custom PCF form setups
- `call_outcomes` / `opportunity_statuses` - dropdown options

---

## Auth & Permissions

Three roles: `super_admin` > `admin` > `sales_rep`

Roles live in `user_roles` table (not on profiles - security thing). There are helper functions:
- `has_role(user_id, role)` - check if someone has a role
- `is_admin(user_id)` - shorthand for admin check
- `user_is_org_member(user_id, org_id)` - org membership check

Every table has RLS policies. Users can only query data from orgs they belong to.

---

## Integrations

**Calendly**
- Webhook receives new bookings → creates events
- Also does GHL contact lookup automatically now
- Manual sync available in settings

**Close CRM**
- Used for lead source attribution
- Syncs setter activity (dials, talk time, etc.)

**Go High Level**
- Contacts get linked by email
- PCF submissions push notes/tags back to GHL
- Bulk sync available for existing events

**Whop / Stripe**
- Webhooks process payments
- Matches to events by customer email
- Handles refunds too

**Slack**
- Daily reports
- Overdue PCF reminders

---

## Edge Functions

**Webhooks:**
- `calendly-webhook` - processes bookings
- `generic-webhook` - handles Whop/Stripe payments

**Syncs:**
- `sync-calendly`, `sync-close`, `sync-whop`
- `sync-ghl-contacts` - backfill GHL IDs
- `sync-close-activities` - pull setter metrics

**Utilities:**
- `lookup-ghl-contact` / `update-ghl-contact`
- `send-invite-email`, `send-commission-link`
- `create-payout-snapshot`

---

## Secrets & API Keys

**System-level (in Lovable Cloud secrets):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY` - for emails
- `SLACK_WEBHOOK_URL` - notifications

**Per-org (in `organization_integrations` table):**
- Calendly API key
- Close API key  
- GHL API key + location ID
- Whop API key + company ID

Frontend env vars are in `.env` - just the public Supabase URL and anon key.

---

## Security Notes

- RLS enabled everywhere - data is org-scoped
- Rate limiting on webhooks (100 req/min default)
- Calendly webhooks verified with HMAC signatures
- All API keys encrypted in database
- Audit logging on sensitive tables

---

## Things to Know

1. **GHL pipeline sync** - The opportunity statuses in the app need to be mapped to actual GHL pipeline stages. That's a per-org config thing.

2. **Duplicate prevention** - Events dedupe on `calendly_invitee_uuid`. Won't create duplicates.

3. **Payment matching** - Whop/Stripe payments match to events by email within the org.

4. **Webhook health** - Check `webhook_connections.last_webhook_at` to see if webhooks are flowing.

---

## Before Go-Live

- [ ] All Lovable Cloud secrets configured
- [ ] Org integration API keys are valid
- [ ] Calendly webhook receiving events
- [ ] Whop/Stripe webhooks connected
- [ ] Test a user login + PCF submission
- [ ] Slack notifications working
- [ ] Run GHL contact sync for existing events

---

## Data Export

See the Export page in the app (Settings → Export Events) for CSV exports.

For full database access, use the Lovable Cloud dashboard - you can export individual tables from there.

**Quick exports via edge functions:**

```bash
# Payout snapshot (creates exportable report)
POST /functions/v1/create-payout-snapshot
{"organization_id": "...", "period_start": "2026-01-01", "period_end": "2026-01-31"}
```

---

That's the gist. Code's pretty well commented if you need to dig deeper. The types file at `src/integrations/supabase/types.ts` has the full schema if you want to see all the columns.
