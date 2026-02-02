# Sales Dashboard - Comprehensive System Documentation

**Version:** 2.0  
**Last Updated:** January 18, 2026  
**Purpose:** Complete technical and functional documentation for migration, maintenance, and onboarding

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Core Features](#3-core-features)
4. [Database Schema](#4-database-schema)
5. [Integrations](#5-integrations)
6. [Dashboard & Reporting](#6-dashboard--reporting)
7. [Workflow Diagrams](#7-workflow-diagrams)
8. [API & Edge Functions](#8-api--edge-functions)
9. [Security Implementation](#9-security-implementation)
10. [Configuration & Secrets](#10-configuration--secrets)

---

## 1. System Overview

### 1.1 Purpose

This is a **multi-tenant sales operations platform** designed to:
- Track and manage sales calls from booking to close
- Attribute revenue to closers and setters
- Process and reconcile payments from multiple sources
- Provide real-time performance analytics and leaderboards
- Automate commission calculations and payout reports

### 1.2 Target Users

| User Type | Description | Primary Actions |
|-----------|-------------|-----------------|
| **Super Admin** | Platform-level administrator | Manage all organizations, users, system settings |
| **Admin** | Organization owner/manager | Configure integrations, manage team, view all data |
| **Sales Rep (Closer)** | Takes sales calls | Submit post-call forms, view personal metrics |
| **Setter** | Books appointments | Track bookings, view attribution |

### 1.3 Business Problem Solved

1. **Attribution Tracking** - Know which setter booked which call and which closer worked it
2. **Revenue Attribution** - Link payments back to specific calls, closers, and setters
3. **Performance Visibility** - Real-time show rates, close rates, and revenue metrics
4. **Commission Calculation** - Automated payout snapshots based on actual performance
5. **Integration Hub** - Single source of truth pulling from Calendly, CRMs, and payment processors

### 1.4 Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND                               │
│  React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui    │
│  State: TanStack Query v5                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   LOVABLE CLOUD                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │    Auth     │  │  Database   │  │   Edge Functions    │ │
│  │  (Email)    │  │ (Postgres)  │  │   (Deno/TypeScript) │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  EXTERNAL SERVICES                          │
│  Calendly │ Close CRM │ GoHighLevel │ HubSpot │ Whop │ Stripe │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. User Roles & Permissions

### 2.1 Role Hierarchy

```
super_admin (highest)
    │
    ▼
  admin
    │
    ▼
sales_rep (lowest)
```

### 2.2 Role Definitions

#### Super Admin
- **Scope:** Platform-wide access
- **Stored in:** `user_roles` table with `role = 'super_admin'`
- **Capabilities:**
  - Access all organizations
  - Create/delete organizations
  - Invite client admins
  - Delete users from auth system
  - View all audit logs
  - Override any RLS policy

#### Admin
- **Scope:** Organization-level access
- **Stored in:** `user_roles` table with `role = 'admin'`
- **Capabilities:**
  - Full CRUD on organization data
  - Configure integrations (API keys, webhooks)
  - Manage team members (closers, setters)
  - Create/manage form configurations
  - Generate payout snapshots
  - Send commission links
  - View all organization events/payments

#### Sales Rep
- **Scope:** Personal data only
- **Stored in:** `user_roles` table with `role = 'sales_rep'`
- **Capabilities:**
  - View own assigned events
  - Submit post-call forms for their calls
  - View personal metrics (show rate, close rate)
  - Access rep portal

### 2.3 Organization Membership

The multi-tenancy model uses `organization_members` to link users to organizations:

```sql
organization_members
├── user_id       → Links to auth.users
├── organization_id → Links to organizations
└── role          → 'owner', 'admin', or 'member'
```

**Key Functions:**
- `user_is_org_member(user_id, org_id)` - Check membership
- `user_is_org_admin(user_id, org_id)` - Check admin status
- `get_user_organization_ids(user_id)` - Get all orgs for user
- `is_super_admin(user_id)` - Check super admin status

### 2.4 RLS Policy Pattern

All tables follow this pattern:
```sql
-- Super admins bypass all restrictions
CREATE POLICY "Super admins can manage all X" ON table
FOR ALL USING (is_super_admin(auth.uid()));

-- Org admins can manage their org's data
CREATE POLICY "Org admins can manage their X" ON table
FOR ALL USING (organization_id IN (
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
));

-- Org members can view their org's data
CREATE POLICY "Org members can view their X" ON table
FOR SELECT USING (organization_id IN (
  SELECT get_user_organization_ids(auth.uid())
));
```

---

## 3. Core Features

### 3.1 Lead Management

**Purpose:** Track potential customers from first contact through conversion

**Data Flow:**
```
External Source (Calendly/CRM) → Lead Record → Event Assignment → PCF → Payment
```

**Key Fields (leads table):**
| Field | Purpose |
|-------|---------|
| `full_name` | Lead's name |
| `email` | Primary identifier for matching |
| `phone` | Contact number |
| `source_id` | Where the lead came from |
| `original_setter_name` | Who first booked this lead |
| `current_setter_name` | Current assigned setter |

### 3.2 Event/Appointment Scheduling

**Purpose:** Track all scheduled sales calls

**Event Lifecycle:**
```
scheduled → [call occurs] → completed/no_show/canceled/rescheduled
```

**Key Fields (events table):**
| Field | Purpose |
|-------|---------|
| `lead_name`, `lead_email` | Who the call is with |
| `closer_id`, `closer_name` | Assigned sales rep |
| `setter_id`, `setter_name` | Who booked the call |
| `scheduled_at` | When the call is scheduled |
| `booked_at` | When the booking was made |
| `call_status` | Current status |
| `event_outcome` | Result (showed, no_show, closed, etc.) |
| `pcf_submitted` | Whether post-call form is done |
| `calendly_invitee_uuid` | Unique ID for deduplication |
| `ghl_contact_id` | Linked GHL contact |
| `hubspot_contact_id` | Linked HubSpot contact |

### 3.3 Post-Call Forms (PCFs)

**Purpose:** Capture call outcomes and sales data immediately after each call

**Standard PCF Fields (post_call_forms table):**
| Field | Purpose |
|-------|---------|
| `call_occurred` | Did the call happen? |
| `lead_showed` | Did the lead show up? |
| `offer_made` | Was an offer presented? |
| `deal_closed` | Was the deal closed? |
| `cash_collected` | Amount collected (if any) |
| `payment_type` | Type of payment (pif, payment_plan) |
| `opportunity_status_id` | Custom status from dropdown |
| `notes` | Rep's notes |

**Custom Form Configuration:**
Organizations can customize PCF fields via `form_configs` table:
```json
{
  "form_type": "post_call_form",
  "fields": [
    { "name": "custom_field", "type": "select", "options": [...] }
  ]
}
```

### 3.4 Payment Tracking

**Purpose:** Record and reconcile all revenue

**Payment Sources:**
1. **Manual Entry** - Via PCF submission
2. **Whop Webhooks** - Automated from Whop payments
3. **Stripe Webhooks** - Automated from Stripe payments

**Key Fields (payments table):**
| Field | Purpose |
|-------|---------|
| `amount` | Payment amount |
| `refund_amount` | Any refunds |
| `net_revenue` | Calculated: amount - refund |
| `payment_date` | When payment occurred |
| `event_id` | Linked event |
| `closer_id`, `setter_id` | Attribution |
| `whop_connection_id` | Which Whop connection |
| `customer_email` | For matching |
| `payment_type` | pif, payment_plan |
| `deal_type` | new_deal, upsell |

### 3.5 Closer & Setter Management

**Closers (closers table):**
- Sales reps who take calls
- Can be linked to `profile_id` (auth user)
- Have `is_active` flag

**Setters (setters table):**
- Team members who book calls
- Can be linked to Close CRM via `close_user_id`
- Have `is_active` flag

### 3.6 Source & Traffic Type Tracking

**Sources (sources table):**
- Where leads come from (Facebook, YouTube, Referral, etc.)
- Synced from Close CRM or manually created

**Traffic Types (traffic_types table):**
- Type of traffic (Paid, Organic, Cold, Warm, etc.)

---

## 4. Database Schema

### 4.1 Core Tables Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ORGANIZATION LAYER                            │
├─────────────────────────────────────────────────────────────────────────┤
│  organizations ◄─── organization_members ───► profiles (users)         │
│       │                                             │                   │
│       │                                             ▼                   │
│       │                                        user_roles               │
│       ▼                                                                 │
│  organization_integrations (API keys, settings)                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            SALES DATA LAYER                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   leads ───────► events ───────► post_call_forms                       │
│     │              │                    │                               │
│     │              │                    ▼                               │
│     │              └──────────────► payments                            │
│     │                                   │                               │
│     └───────────────────────────────────┘                               │
│                                                                         │
│   Attribution: closers, setters, sources, traffic_types                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CONFIGURATION LAYER                             │
├─────────────────────────────────────────────────────────────────────────┤
│  form_configs │ call_outcomes │ opportunity_statuses │ packages         │
│  custom_field_definitions │ custom_field_values │ portal_settings       │
│  dashboard_layouts │ webhook_connections │ closer_access_tokens         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            AUDIT & REPORTING                            │
├─────────────────────────────────────────────────────────────────────────┤
│  audit_logs │ calendly_webhook_audit │ payout_snapshots                 │
│  payout_snapshot_details │ payout_snapshot_summaries                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Table Purposes

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `organizations` | Multi-tenant company records | Parent of all org-scoped data |
| `organization_members` | User ↔ Organization mapping | Links users to orgs with roles |
| `profiles` | Extended user data | Created via trigger on auth.users |
| `user_roles` | Role assignments | Separate from profiles for security |
| `organization_integrations` | API keys & settings per org | Encrypted keys stored here |
| `events` | Scheduled calls/meetings | Core transaction table |
| `leads` | Customer/prospect records | Can exist without events |
| `post_call_forms` | Call outcome data | 1:1 with event |
| `payments` | Revenue records | Links to events for attribution |
| `closers` | Sales rep roster | Referenced by events |
| `setters` | Appointment setter roster | Referenced by events |
| `sources` | Lead sources | Synced from CRM or manual |
| `traffic_types` | Traffic categorization | Manual configuration |
| `call_types` | Event type categories | Synced from Calendly event types |
| `call_outcomes` | PCF dropdown options | Per-org customization |
| `opportunity_statuses` | Pipeline stages | Maps to GHL stages |
| `packages` | Product/service offerings | Used in PCF |
| `form_configs` | Custom PCF field definitions | JSON field configuration |
| `custom_field_definitions` | Generic custom fields | Flexible field system |
| `custom_field_options` | Options for custom fields | Linked to definitions |
| `custom_field_values` | Stored custom field data | Links record to field value |
| `webhook_connections` | Whop/Stripe webhook configs | Per-org payment webhooks |
| `portal_settings` | Rep portal configuration | What reps see |
| `dashboard_layouts` | Saved dashboard configs | Per-user/org |
| `closer_access_tokens` | Magic link tokens for portal | Token-based auth |
| `invitations` | Pending user invites | Email-based onboarding |
| `audit_logs` | Change tracking | Trigger-populated |
| `calendly_webhook_audit` | Webhook debugging | Raw webhook storage |
| `rate_limits` | API rate limiting | Per-endpoint tracking |
| `payout_snapshots` | Point-in-time payout reports | Header record |
| `payout_snapshot_details` | Individual payment records | Detail records |
| `payout_snapshot_summaries` | Aggregated summaries | By closer/setter/source |
| `metric_definitions` | Custom metric configs | For custom dashboard metrics |
| `setter_activities` | Setter dialing/talk metrics | From Close CRM sync |
| `integrations` | Legacy integration table | Deprecated, use organization_integrations |

### 4.3 Key Foreign Key Relationships

```sql
-- Event relationships
events.organization_id → organizations.id
events.closer_id → closers.id
events.setter_id → setters.id
events.source_id → sources.id
events.traffic_type_id → traffic_types.id
events.call_type_id → call_types.id
events.lead_id → leads.id

-- PCF relationships
post_call_forms.event_id → events.id
post_call_forms.closer_id → closers.id
post_call_forms.call_outcome_id → call_outcomes.id
post_call_forms.opportunity_status_id → opportunity_statuses.id

-- Payment relationships
payments.event_id → events.id
payments.closer_id → closers.id
payments.setter_id → setters.id
payments.source_id → sources.id
payments.whop_connection_id → webhook_connections.id
payments.package_id → packages.id

-- Organization membership
organization_members.organization_id → organizations.id
organization_members.user_id → auth.users.id

-- User relationships
closers.profile_id → profiles.user_id
profiles.user_id → auth.users.id
user_roles.user_id → auth.users.id
```

---

## 5. Integrations

### 5.1 Integration Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    ORGANIZATION INTEGRATIONS TABLE                   │
├──────────────────────────────────────────────────────────────────────┤
│  primary_crm: 'ghl' | 'close' | 'hubspot' | 'none'                   │
│  primary_booking_platform: 'calendly' | 'acuity' | 'none'            │
│  primary_payment_processor: 'whop' | 'stripe' | 'none'               │
├──────────────────────────────────────────────────────────────────────┤
│  Encrypted API Keys:                                                  │
│  - calendly_api_key_encrypted                                         │
│  - close_api_key_encrypted                                            │
│  - ghl_api_key_encrypted                                              │
│  - hubspot_api_key_encrypted                                          │
│  - whop_api_key_encrypted                                             │
│  - stripe_api_key_encrypted                                           │
├──────────────────────────────────────────────────────────────────────┤
│  Additional Config:                                                   │
│  - ghl_location_id (required for GHL API v2)                         │
│  - whop_company_id                                                    │
│  - stripe_publishable_key                                             │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 Calendly Integration

**Purpose:** Sync scheduled events and booking data

**Data Flow:**
```
Calendly Event Created
        │
        ▼
calendly-webhook edge function
        │
        ├─► Create/update events table
        ├─► Extract setter from UTM/questions
        ├─► Lookup GHL contact (if configured)
        └─► Store audit record
```

**Key Features:**
- HMAC signature verification
- Rate limiting (100 req/min)
- Automatic GHL contact lookup
- Setter extraction from UTM parameters or questions
- Handles: created, canceled, rescheduled events
- Deduplication via `calendly_invitee_uuid`

**Sync Functions:**
- `sync-calendly` - Bulk sync historical events
- `sync-calendly-hosts` - Sync team member list
- `register-calendly-webhook` - Register webhook endpoint
- `get-calendly-utilization` - Calculate slot availability

### 5.3 Close CRM Integration

**Purpose:** Lead source attribution and setter activity tracking

**Capabilities:**
- Sync lead sources to `sources` table
- Sync users to map setter activities
- Pull setter dial/talk metrics
- Push notes back to Close leads

**Edge Functions:**
- `sync-close` - Sync leads/deals
- `sync-close-activities` - Pull setter metrics
- `sync-close-attribution` - Source attribution
- `fetch-close-source` - Get source details
- `fetch-close-users` - Get Close user list

### 5.4 GoHighLevel (GHL) Integration

**Purpose:** CRM contact management and pipeline sync

**Capabilities:**
- Lookup contacts by email
- Update contact fields/tags after PCF submission
- Sync opportunity statuses to pipeline stages
- Push notes to contact timeline

**API Versions:**
- V1 (Agency token) - Simple header auth
- V2 (PIT token) - Requires `locationId` parameter

**Edge Functions:**
- `lookup-ghl-contact` - Find contact by email
- `update-ghl-contact` - Push updates to GHL
- `sync-ghl-contacts` - Bulk backfill GHL IDs
- `fetch-ghl-pipelines` - Get pipeline stages

### 5.5 HubSpot Integration

**Purpose:** CRM contact linking

**Capabilities:**
- Validate API key
- Lookup contacts by email
- Sync contact data

**Edge Functions:**
- `validate-hubspot-key` - Check API key validity
- `sync-hubspot-contacts` - Sync contacts

### 5.6 Whop Integration

**Purpose:** Process membership/payment events

**Webhook Events Handled:**
- `membership.went_valid` - New payment
- `membership.renewed` - Recurring payment
- `payment.succeeded` - One-time payment
- `membership.cancelled` - Cancellation
- `payment.refunded` - Refunds

**Data Flow:**
```
Whop Payment Event
        │
        ▼
whop-webhook / generic-webhook
        │
        ├─► Verify signature (HMAC-SHA256)
        ├─► Match customer email to events
        ├─► Create payment record
        └─► Link to closer/setter for attribution
```

**Edge Functions:**
- `whop-webhook` - Primary Whop handler
- `generic-webhook` - Alternative multi-purpose handler
- `sync-whop` - Bulk sync payments
- `sync-whop-connection` - Per-connection sync
- `backfill-whop-connection` - Historical data import

### 5.7 Stripe Integration

**Purpose:** Process Stripe payment events

**Webhook Events Handled:**
- `payment_intent.succeeded`
- `charge.succeeded`
- `charge.refunded`

**Edge Functions:**
- `generic-webhook` - Handles Stripe with signature verification

### 5.8 Webhook Connections Table

The `webhook_connections` table stores per-organization webhook configurations:

```sql
webhook_connections
├── name              -- Display name
├── connection_type   -- 'whop' or 'stripe'
├── api_key           -- For API calls
├── webhook_secret    -- For signature verification
├── organization_id   -- Owning org
├── is_active         -- Enabled/disabled
├── last_webhook_at   -- Health monitoring
├── webhook_count     -- Usage tracking
```

---

## 6. Dashboard & Reporting

### 6.1 Core Metrics

| Metric | Calculation | Purpose |
|--------|-------------|---------|
| **Booked Calls** | Count of events in period | Volume tracking |
| **Show Rate** | Shows ÷ (Completed + No-Shows) | Lead quality indicator |
| **Close Rate** | Closed ÷ Shows | Sales effectiveness |
| **Offer Rate** | Offers ÷ Shows | Pitch frequency |
| **Cash Collected** | Sum of payment amounts | Revenue tracking |
| **Pending PCFs** | Events without PCF (past scheduled) | Compliance tracking |
| **Utilization** | Booked slots ÷ Available slots | Capacity planning |

### 6.2 Dashboard Views

**Admin Dashboard (`/dashboard`):**
- Org-wide metrics with date filtering
- Events table with filtering
- Setter leaderboard
- Closer leaderboard
- Calendly utilization chart
- Overdue PCFs alerts
- Duplicate event detection

**Sales Rep Dashboard (`/rep`):**
- Personal metrics
- Today's calls
- Upcoming events
- Pending PCF queue
- Configurable via `portal_settings`

### 6.3 Payout Snapshots

**Purpose:** Create point-in-time commission reports

**Process:**
1. Admin selects date range
2. Edge function aggregates:
   - All payments in period
   - Attribution (closer, setter, source)
3. Creates snapshot records:
   - `payout_snapshots` - Header
   - `payout_snapshot_details` - Each payment
   - `payout_snapshot_summaries` - Aggregates by entity

### 6.4 Export Capabilities

**Available Exports:**
- Events (with date filtering)
- Payments
- Post-call forms
- Leads
- All configuration tables

**Export Edge Function:**
```
GET /functions/v1/export-data?table=events&start_date=2026-01-01&end_date=2026-01-31
```

### 6.5 Slack Notifications

**Daily Report (`slack-daily-report`):**
- Yesterday's metrics summary
- Top performers
- Sent to configured Slack channel

**Overdue PCF Reminder (`slack-overdue-pcf-reminder`):**
- Lists closers with pending PCFs
- Sent as actionable reminders

---

## 7. Workflow Diagrams

### 7.1 Lead Lifecycle

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              LEAD LIFECYCLE                                  │
└──────────────────────────────────────────────────────────────────────────────┘

     ┌─────────────┐
     │ Lead Source │
     │ (Calendly,  │
     │  CRM, etc.) │
     └──────┬──────┘
            │
            ▼
     ┌─────────────┐
     │ Event       │
     │ Created     │
     │ (scheduled) │
     └──────┬──────┘
            │
            ▼
     ┌─────────────┐         ┌─────────────┐
     │ Call        │────────►│ No-Show     │
     │ Scheduled   │         └─────────────┘
     └──────┬──────┘
            │ (call occurs)
            ▼
     ┌─────────────┐
     │ PCF         │
     │ Submitted   │
     └──────┬──────┘
            │
            ▼
     ┌─────────────────────────────────────────┐
     │              OUTCOME                     │
     ├───────────┬───────────┬────────────────┤
     │ Showed    │ Showed +  │ Closed         │
     │ No Offer  │ Offer     │ (Deal Won)     │
     └───────────┴───────────┴───────┬────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │ Payment     │
                              │ Recorded    │
                              └──────┬──────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │ Commission  │
                              │ Attribution │
                              └─────────────┘
```

### 7.2 Event Processing Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         EVENT PROCESSING FLOW                                │
└──────────────────────────────────────────────────────────────────────────────┘

  CALENDLY                    SYSTEM                        DATABASE
  ────────                    ──────                        ────────

  Booking Created ──────────► calendly-webhook
                                    │
                                    ├─► Verify signature
                                    │
                                    ├─► Check rate limit
                                    │
                                    ├─► Extract event data
                                    │   • invitee email/name
                                    │   • scheduled time
                                    │   • closer from host
                                    │   • setter from UTM/Q&A
                                    │
                                    ├─► Lookup org by ─────────► organization_integrations
                                    │   closer email
                                    │
                                    ├─► Check duplicate ───────► events (calendly_invitee_uuid)
                                    │
                                    ├─► Lookup GHL ────────────► External GHL API
                                    │   contact
                                    │
                                    └─► Insert event ──────────► events table
                                                                     │
                                                                     ▼
                                                              calendly_webhook_audit
```

### 7.3 Payment Attribution Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT ATTRIBUTION FLOW                              │
└──────────────────────────────────────────────────────────────────────────────┘

  PAYMENT SOURCE              WEBHOOK HANDLER              ATTRIBUTION
  ──────────────              ───────────────              ───────────

  Whop/Stripe ───────────────► generic-webhook
  Payment Event                      │
                                     ├─► Verify signature
                                     │
                                     ├─► Extract customer email
                                     │
                                     ├─► Find matching event ────► events table
                                     │   by customer email           (most recent)
                                     │   within org
                                     │
                                     ├─► Get closer/setter ───────► From matched event
                                     │   attribution
                                     │
                                     ├─► Create payment ──────────► payments table
                                     │   record                      • event_id
                                     │                               • closer_id
                                     │                               • setter_id
                                     │                               • source_id
                                     │
                                     └─► Update webhook ─────────► webhook_connections
                                         connection stats            • last_webhook_at
                                                                     • webhook_count++
```

### 7.4 Integration Data Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       INTEGRATION DATA FLOW                                  │
└──────────────────────────────────────────────────────────────────────────────┘

                           ┌─────────────────┐
                           │    CALENDLY     │
                           │    (Booking)    │
                           └────────┬────────┘
                                    │ webhook
                                    ▼
┌─────────────┐           ┌─────────────────┐           ┌─────────────┐
│   CLOSE     │◄─────────►│                 │◄─────────►│    GHL      │
│   (CRM)     │  sync     │   SALES DASH    │  lookup   │   (CRM)     │
└─────────────┘           │                 │           └─────────────┘
      │                   │   events table  │                 │
      │                   │   payments      │                 │
      ▼                   │   leads         │                 ▼
  sources sync            │                 │           contact update
  setter activities       └────────┬────────┘           after PCF
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
             ┌───────────┐  ┌───────────┐  ┌───────────┐
             │   WHOP    │  │  STRIPE   │  │  SLACK    │
             │ (Payment) │  │ (Payment) │  │ (Notify)  │
             └───────────┘  └───────────┘  └───────────┘
                    │              │              │
                    └──────────────┴──────────────┘
                                   │ webhooks
                                   ▼
                           payments table
```

---

## 8. API & Edge Functions

### 8.1 Complete Edge Function Reference

#### Webhook Handlers

| Function | Purpose | Auth | Rate Limit |
|----------|---------|------|------------|
| `calendly-webhook` | Process Calendly events | HMAC signature | 100/min |
| `whop-webhook` | Process Whop payments | HMAC signature | 60/min |
| `generic-webhook` | Multi-purpose (Stripe/Whop) | HMAC signature | 60/min |
| `manychat-webhook` | ManyChat automations | Token | - |

#### Sync Functions

| Function | Purpose | Trigger |
|----------|---------|---------|
| `sync-calendly` | Bulk sync Calendly events | Manual/Scheduled |
| `sync-calendly-hosts` | Sync Calendly team members | Manual |
| `sync-close` | Sync Close CRM data | Manual |
| `sync-close-activities` | Pull setter dial metrics | Manual |
| `sync-close-attribution` | Sync sources from Close | Manual |
| `sync-ghl-contacts` | Backfill GHL contact IDs | Manual |
| `sync-hubspot-contacts` | Sync HubSpot contacts | Manual |
| `sync-whop` | Bulk sync Whop payments | Manual |
| `sync-whop-connection` | Per-connection Whop sync | Manual |
| `sync-crm-notes` | Sync notes to CRM | Manual |

#### CRM Functions

| Function | Purpose | Params |
|----------|---------|--------|
| `lookup-ghl-contact` | Find GHL contact by email | email, event_id, organization_id |
| `update-ghl-contact` | Push data to GHL | contact_id, fields, organization_id |
| `fetch-ghl-pipelines` | Get GHL pipeline stages | organization_id |
| `fetch-close-source` | Get Close source details | source_id, organization_id |
| `fetch-close-users` | List Close users | organization_id |
| `validate-hubspot-key` | Check HubSpot API key | api_key |

#### User Management

| Function | Purpose | Auth Required |
|----------|---------|---------------|
| `create-invited-user` | Create user from invitation | Admin token |
| `delete-auth-user` | Delete user from auth | Super admin token |
| `validate-invite` | Check invitation validity | None |
| `send-invite-email` | Send invitation email | Admin token |

#### Portal & PCF

| Function | Purpose | Auth |
|----------|---------|------|
| `portal-pcf` | Portal PCF submission/retrieval | Magic link token |
| `send-commission-link` | Email commission link | Admin token |

#### Reporting

| Function | Purpose | Params |
|----------|---------|--------|
| `create-payout-snapshot` | Generate payout report | periodStart, periodEnd, name |
| `export-data` | Export table data as JSON | table, start_date, end_date |
| `get-calendly-utilization` | Calculate availability | organizationId, startDate, endDate |

#### Automation

| Function | Purpose | Trigger |
|----------|---------|---------|
| `slack-daily-report` | Post daily metrics to Slack | Scheduled/Manual |
| `slack-overdue-pcf-reminder` | Remind about pending PCFs | Scheduled/Manual |

#### Utilities

| Function | Purpose |
|----------|---------|
| `manage-api-keys` | Decrypt API keys for other functions |
| `register-calendly-webhook` | Register Calendly webhook endpoint |
| `debug-calendly-event` | Debug specific Calendly event |
| `delete-events` | Bulk delete events |
| `batch-restore-payments` | Restore deleted payments |
| `backfill-whop-connection` | Historical Whop data import |
| `qa-agent` | QA automation helper |

### 8.2 Shared Utilities

**`_shared/cors.ts`:**
Standard CORS headers for all functions.

**`_shared/get-api-key.ts`:**
```typescript
// Decrypt API key from organization_integrations
async function getApiKey(
  supabaseUrl: string,
  serviceKey: string,
  organizationId: string,
  keyType: 'calendly' | 'close' | 'ghl' | 'hubspot' | 'whop' | 'stripe'
): Promise<string | null>

// Throws if key not found
async function requireApiKey(...): Promise<string>
```

### 8.3 Edge Function URL Pattern

```
https://<project-id>.supabase.co/functions/v1/<function-name>
```

**Example Calls:**
```bash
# Export data
curl "https://yrlbwzxphjtnivjbpzsq.supabase.co/functions/v1/export-data?table=events"

# Create payout snapshot
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"periodStart":"2026-01-01","periodEnd":"2026-01-31"}' \
  "https://yrlbwzxphjtnivjbpzsq.supabase.co/functions/v1/create-payout-snapshot"
```

---

## 9. Security Implementation

### 9.1 Authentication

- **Method:** Email-based authentication via Lovable Cloud
- **Auto-confirm:** Enabled for non-production
- **Session:** Persisted in localStorage, auto-refreshed

### 9.2 Row Level Security (RLS)

**All tables have RLS enabled.** Policies follow the pattern:
1. Super admins bypass all restrictions
2. Org admins manage their org's data
3. Org members view their org's data
4. Sales reps access only their own records

### 9.3 API Key Security

- **Storage:** Encrypted in `organization_integrations` table
- **Encryption:** AES-256 via `ENCRYPTION_MASTER_KEY`
- **Access:** Only via `manage-api-keys` edge function
- **Never logged:** Sanitized from all log output

### 9.4 Webhook Security

- **HMAC Verification:** All webhooks verify signatures
- **Rate Limiting:** Database-backed rate limiting
- **Fail-Closed:** Denied if rate limit check fails
- **Timestamp Validation:** 5-minute replay protection

### 9.5 Audit Logging

- **Table:** `audit_logs`
- **Trigger:** `audit_log_trigger()` on sensitive tables
- **Captures:** INSERT, UPDATE, DELETE with old/new data
- **Access:** Admin-only viewing

---

## 10. Configuration & Secrets

### 10.1 Environment Variables (Frontend)

```
VITE_SUPABASE_URL           # Supabase project URL
VITE_SUPABASE_PUBLISHABLE_KEY  # Anon key (safe for frontend)
VITE_SUPABASE_PROJECT_ID    # Project identifier
```

### 10.2 Lovable Cloud Secrets (Edge Functions)

| Secret | Purpose | Used By |
|--------|---------|---------|
| `SUPABASE_URL` | Database URL | All functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin database access | All functions |
| `ENCRYPTION_MASTER_KEY` | API key encryption | manage-api-keys |
| `RESEND_API_KEY` | Email sending | send-invite-email, send-commission-link |
| `SLACK_WEBHOOK_URL` | Slack notifications | slack-daily-report, slack-overdue-pcf-reminder |
| `CALENDLY_API_KEY` | Legacy Calendly key | Deprecated, use per-org |
| `CLOSE_API_KEY` | Legacy Close key | Deprecated, use per-org |
| `WHOP_API_KEY` | Legacy Whop key | Deprecated, use per-org |
| `WHOP_COMPANY_ID` | Legacy Whop ID | Deprecated, use per-org |

### 10.3 Per-Organization Configuration

All integration API keys are now stored per-organization in `organization_integrations`:

```sql
-- Check if org has Calendly configured
SELECT calendly_api_key_encrypted IS NOT NULL 
FROM organization_integrations 
WHERE organization_id = 'org-uuid';
```

---

## Appendix A: Common Queries

### Get all events for an organization
```sql
SELECT e.*, c.name as closer_name, s.name as setter_name
FROM events e
LEFT JOIN closers c ON e.closer_id = c.id
LEFT JOIN setters s ON e.setter_id = s.id
WHERE e.organization_id = 'org-uuid'
ORDER BY e.scheduled_at DESC;
```

### Calculate show rate
```sql
SELECT 
  COUNT(CASE WHEN event_outcome IS NOT NULL AND event_outcome != 'no_show' THEN 1 END) as shows,
  COUNT(CASE WHEN call_status IN ('completed', 'no_show') THEN 1 END) as total,
  ROUND(
    COUNT(CASE WHEN event_outcome IS NOT NULL AND event_outcome != 'no_show' THEN 1 END)::numeric / 
    NULLIF(COUNT(CASE WHEN call_status IN ('completed', 'no_show') THEN 1 END), 0) * 100,
    1
  ) as show_rate
FROM events
WHERE organization_id = 'org-uuid'
  AND scheduled_at BETWEEN '2026-01-01' AND '2026-01-31';
```

### Get revenue by closer
```sql
SELECT 
  c.name as closer_name,
  COUNT(p.id) as payment_count,
  SUM(p.amount) as total_revenue,
  SUM(p.refund_amount) as total_refunds,
  SUM(p.amount - COALESCE(p.refund_amount, 0)) as net_revenue
FROM payments p
JOIN closers c ON p.closer_id = c.id
WHERE p.organization_id = 'org-uuid'
  AND p.payment_date BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY c.id, c.name
ORDER BY net_revenue DESC;
```

### Find overdue PCFs
```sql
SELECT e.*, c.name as closer_name
FROM events e
LEFT JOIN closers c ON e.closer_id = c.id
WHERE e.organization_id = 'org-uuid'
  AND e.scheduled_at < NOW()
  AND e.pcf_submitted = false
  AND e.call_status NOT IN ('canceled', 'rescheduled')
ORDER BY e.scheduled_at DESC;
```

---

## Appendix B: Troubleshooting

### Webhook not receiving events
1. Check `webhook_connections.last_webhook_at`
2. View `calendly_webhook_audit` for raw payloads
3. Check edge function logs for errors
4. Verify webhook URL is registered in Calendly/Whop

### Payment not attributed
1. Check customer email matches event lead_email
2. Verify event exists for the email
3. Check `webhook_connections.is_active = true`
4. Review payment matching logic in logs

### RLS policy blocking access
1. Verify user has correct role in `user_roles`
2. Check `organization_members` entry exists
3. Test with `is_super_admin()` function
4. Review specific policy conditions

---

**Document maintained by:** Engineering Team  
**Next review date:** February 2026
