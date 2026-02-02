# SalesSpark Platform - Handover Document

**Prepared for:** Client Deployment
**Date:** January 2026
**Version:** 1.0

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Credentials & Environment](#credentials--environment)
3. [Security Setup](#security-setup)
4. [Integrations](#integrations)
5. [Database Schema](#database-schema)
6. [Edge Functions](#edge-functions)
7. [Deployment](#deployment)
8. [Important Notes](#important-notes)

---

## Architecture Overview

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| **Backend** | Supabase (PostgreSQL), Deno Edge Functions |
| **Auth** | Supabase Auth (JWT-based) |
| **Hosting** | Lovable Cloud |
| **State Management** | TanStack React Query, React Context |

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT BROWSER                          │
│                   React + TypeScript App                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE BACKEND                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Auth      │  │  Database   │  │   Edge Functions    │  │
│  │  (JWT)      │  │ (PostgreSQL)│  │      (Deno)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │Calendly │  │  Whop   │  │Close CRM│
   │   API   │  │   API   │  │   API   │
   └─────────┘  └─────────┘  └─────────┘
```

### Data Flow

```
Calendly Booking → Webhook → Edge Function → Database → Dashboard
Whop Payment → Webhook → Edge Function → Database → Commission Tracking
Close CRM → Sync Function → Database → Attribution
```

---

## Credentials & Environment

### Required Environment Variables

These are managed via Lovable's integrated secrets management:

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `SUPABASE_URL` | Database URL | Auto-configured by Lovable |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend API key | Auto-configured by Lovable |
| `SUPABASE_ANON_KEY` | Frontend API key | Auto-configured by Lovable |
| `RESEND_API_KEY` | Email service | resend.com dashboard |

### Per-Organization Credentials (stored in database)

Each organization configures their own:

| Credential | Table | Column |
|------------|-------|--------|
| Calendly API Key | `organization_integrations` | `calendly_api_key` |
| Whop API Key | `organization_integrations` | `whop_api_key` |
| Whop Company ID | `organization_integrations` | `whop_company_id` |
| Close CRM API Key | Per-request via edge function | Org-specific |
| Webhook Signing Keys | `organization_integrations` | `calendly_webhook_signing_key`, `whop_webhook_signing_key` |

### Accessing Credentials

- **Lovable Secrets:** Managed in Lovable dashboard → Project Settings → Secrets
- **Organization Keys:** Stored encrypted in `organization_integrations` table
- **Never in client code:** All sensitive keys accessed server-side only via `Deno.env.get()`

---

## Security Setup

### Implemented Security Measures

#### 1. Data Isolation (Multi-Tenancy)
- **Row Level Security (RLS)** enforced on all tables
- Every query filtered by `organization_id`
- Users can only access their organization's data

#### 2. Authentication & Authorization
- JWT-based authentication via Supabase Auth
- Role-based access control:
  - `super_admin` - System-wide access
  - `owner` - Full organization access
  - `admin` - Organization management
  - `sales_rep` - Limited to own data

#### 3. API Key Security
- Encrypted at rest (Supabase Vault)
- Server-side only access
- Never exposed to browsers or client code

#### 4. Webhook Security
- **Signature Verification:** HMAC-SHA256 for Calendly & Whop
- **Rate Limiting:** 100 requests/minute per IP
- **Fail-Closed:** Blocks requests if rate limit check fails
- **Replay Prevention:** 5-minute timestamp window

#### 5. Access Token Security
- Magic links expire after 90 days
- Tokens validated on every request

#### 6. Infrastructure Security
- HTTPS/TLS encryption in transit
- Database encryption at rest
- Security headers configured

### Security Checklist for Deployment

- [ ] Verify RLS policies are enabled on all tables
- [ ] Confirm webhook signing keys are configured per organization
- [ ] Test rate limiting is working
- [ ] Ensure no API keys in client-side code
- [ ] Verify token expiration is enforced

---

## Integrations

### Calendly

**Purpose:** Captures booked calls and scheduling data

**Setup:**
1. Get API key from Calendly → Integrations → API & Webhooks
2. Add to Settings → Integrations in the app
3. Register webhook endpoint (automatic)
4. (Optional) Add webhook signing key for extra security

**Webhook Events Handled:**
- `invitee.created` - New booking
- `invitee.canceled` - Cancellation

**Data Captured:**
- Lead name, email, phone
- Scheduled time, event type
- Setter attribution (from UTM params or form questions)
- Closer assignment

---

### Whop

**Purpose:** Payment processing and commission tracking

**Setup:**
1. Get API key from Whop Dashboard → Developer → API Keys
2. Get Company ID from Whop Dashboard → Settings
3. Add both to Settings → Integrations
4. Configure webhook in Whop to point to your endpoint
5. (Optional) Add signing key for verification

**Data Captured:**
- Payment amount, date
- Customer email (for attribution)
- Product/plan details

---

### Close CRM

**Purpose:** Lead management and source attribution

**Setup:**
1. Get API key from Close → Settings → API Keys
2. Configure per organization via sync functions

**Data Synced:**
- Lead contact info
- Deal status
- Source attribution
- Call logs

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `organizations` | Multi-tenant organization data |
| `organization_members` | User-org membership & roles |
| `profiles` | User profile data |
| `events` | Scheduled/completed calls |
| `leads` | Lead information |
| `payments` | Payment records |
| `post_call_forms` | Post-call form submissions |
| `closers` | Sales closer profiles |
| `setters` | Sales setter profiles |

### Configuration Tables

| Table | Purpose |
|-------|---------|
| `organization_integrations` | API keys & integration settings |
| `organization_custom_fields` | Custom dropdown values |
| `organization_form_configs` | Custom form definitions |
| `portal_settings` | Portal & domain settings |
| `webhook_connections` | Custom webhook registrations |

### Tracking Tables

| Table | Purpose |
|-------|---------|
| `sources` | Traffic sources |
| `payout_snapshots` | Monthly payout summaries |
| `audit_logs` | Change tracking |
| `rate_limits` | Rate limiting data |

---

## Edge Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `calendly-webhook` | Calendly events | Process bookings & cancellations |
| `whop-webhook` | Whop events | Process payments |
| `generic-webhook` | Custom webhooks | Flexible integration handler |
| `sync-calendly` | Manual | Sync Calendly data |
| `sync-close` | Manual | Sync Close CRM data |
| `sync-whop` | Manual | Sync Whop payments |
| `send-invite-email` | User action | Send team invitations |
| `send-commission-link` | User action | Send commission links |
| `create-payout-snapshot` | Admin action | Generate payout reports |
| `slack-daily-report` | Scheduled | Daily Slack notifications |

---

## Deployment

### Lovable Cloud (Current)

The app is deployed on Lovable Cloud with:
- Automatic deployments on code push
- Managed Supabase database
- Integrated secrets management
- Edge function auto-deployment

### Custom Domain Setup

1. Go to Settings → Portal Settings
2. Add custom domain
3. Configure DNS (CNAME to Lovable)
4. SSL auto-provisioned

### Post-Deployment Checklist

- [ ] Verify all integrations connect successfully
- [ ] Test webhook endpoints receive data
- [ ] Confirm email sending works
- [ ] Test user authentication flow
- [ ] Verify RLS policies working (test cross-org access)
- [ ] Check rate limiting is active

---

## Important Notes

### Known Considerations

1. **Webhook Signing Keys:** Optional but recommended for production. Prevents fake webhook attacks.

2. **Rate Limits:** Set to 100 requests/minute. Adjust in edge function code if needed.

3. **Token Expiration:** Magic links expire after 90 days. Users need new links after expiration.

4. **Multi-Tenancy:** All data is isolated by `organization_id`. Never remove RLS policies.

5. **API Key Storage:** Keys are encrypted via Supabase Vault. Never log or expose them.

### Support Contacts

- **Platform Issues:** Lovable support
- **Database Issues:** Supabase support
- **Integration Issues:** Respective provider (Calendly, Whop, Close)

### Maintenance Tasks

| Task | Frequency | How |
|------|-----------|-----|
| Rotate API keys | Every 90 days (recommended) | Update in Settings → Integrations |
| Review audit logs | Weekly | Check `audit_logs` table |
| Monitor rate limits | As needed | Check `rate_limits` table |
| Backup verification | Monthly | Supabase dashboard |

---

## Quick Reference

### Key URLs

| Resource | URL |
|----------|-----|
| App Dashboard | `/dashboard` |
| Settings | `/settings` |
| Rep Portal | `/rep` |
| Analytics | `/analytics` |

### Common Operations

**Add New Team Member:**
Settings → Team → Invite Member

**Configure Integration:**
Settings → Integrations → Add API Key

**View Payout Report:**
Payouts → Create Snapshot → Select Date Range

**Generate Commission Link:**
Commission Links → Generate for Closer

---

*Document generated January 2026. For updates, regenerate from current codebase.*
