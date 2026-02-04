# Client Onboarding Guide

**Version:** 1.0  
**Last Updated:** February 3, 2026
**Purpose:** Step-by-step guide for new clients to understand and use the Sales Dashboard platform

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Analytics](#3-analytics)
4. [Settings & Integrations](#4-settings--integrations)
5. [Rep Portal](#5-rep-portal)
6. [Reports & Exports](#6-reports--exports)
7. [Best Practices](#7-best-practices)

---

## 1. Getting Started

### 1.1 First Login

After receiving your invitation email:
1. Click the invitation link
2. Create your password
3. You'll be logged into your organization's dashboard

### 1.2 Navigation

The sidebar provides access to all major sections:

| Icon | Section | Purpose |
|------|---------|---------|
| 📊 | **Dashboard** | Real-time metrics and event management |
| 📈 | **Analytics** | Deep-dive performance analysis |
| 👥 | **Team** | Manage closers, setters, and invitations |
| ⚙️ | **Settings** | Configure integrations and forms |
| 📋 | **Reports** | Export data and view call history |

---

## 2. Dashboard Overview

The Dashboard is your command center for daily operations.

### 2.1 Date Filters

At the top of the dashboard, you'll find date presets:
- **Today** - Current day's calls
- **This Week** - Sunday to Saturday
- **This Month** - Current calendar month (default)
- **Custom** - Select any date range

💡 **Tip:** All metrics update instantly when you change the date range.

### 2.2 Metric Cards (Top Row)

These summary cards show your key performance indicators:

| Card | What It Shows | How It's Calculated |
|------|---------------|---------------------|
| **Total Calls** | Number of scheduled calls | All non-canceled events in date range |
| **Show Rate** | Percentage of leads who showed up | (Showed ÷ Scheduled) × 100 |
| **Close Rate** | Percentage of shows that closed | (Closed ÷ Showed) × 100 |
| **Cash Collected** | Total revenue | Sum of all payments linked to closed deals |
| **Overdue PCFs** | Post-call forms not yet submitted | Past calls without PCF submission |

**Click any card** to see the underlying events that make up that metric.

### 2.3 Filter Bar

Below the metrics, use filters to narrow your view:

| Filter | Options | Use Case |
|--------|---------|----------|
| **Calendar** | All / Calendly / Cal.com | Filter by booking platform |
| **Traffic Source** | Instagram, YouTube, Newsletter, etc. | See where leads came from |
| **Call Type** | Strategy, Qualifier, etc. | Filter by event type |
| **Closer** | Team member names | View a specific closer's calls |
| **Lead Source** | CRM source values | Filter by CRM-assigned sources |
| **Status** | Scheduled, Completed, Canceled | Filter by call status |
| **PCF Status** | Pending, Submitted | Find calls needing follow-up |

### 2.4 Performance by Lead Source

This collapsible table shows metrics grouped by traffic source:

```
Platform         | Calls | Show% | Close% | Cash
─────────────────────────────────────────────────
Instagram        |   45  |  78%  |   32%  | $45,000
YouTube          |   23  |  82%  |   28%  | $22,500
Newsletter       |   12  |  91%  |   45%  | $18,000
```

**Click any row** to drill down into that source's events.

### 2.5 Calls by Platform (Daily)

A daily breakdown showing scheduled vs. booked calls over time:

```
Date        | Scheduled | Booked | Platform
────────────────────────────────────────────
Feb 3, 2026 |    12     |   15   | Cal.com
Feb 2, 2026 |    10     |   12   | Cal.com
Feb 1, 2026 |     8     |   11   | Calendly
```

**Click a row** to see the UTM breakdown for that day.

### 2.6 Recent Events Table

The main events table shows all calls with key details:

| Column | Description |
|--------|-------------|
| **Lead Name** | Click to open the Lead Journey sheet |
| **Date** | Scheduled date/time |
| **Closer** | Assigned closer |
| **Status** | Current call status |
| **PCF** | Post-call form status (✓ or Pending) |
| **Source** | Traffic source with badge (UTM/CRM indicator) |
| **Outcome** | Call result after PCF submission |

**Actions:**
- **Click a lead name** → Opens Lead Journey with full attribution path
- **Click "Submit PCF"** → Opens post-call form for that event
- **Toggle columns** → Use the column bar above the table to show/hide fields

### 2.7 UTM Health Indicator

A small badge showing your attribution coverage:

```
🟢 UTM Coverage: 85% (Good)
🟡 UTM Coverage: 65% (Needs Work)
🔴 UTM Coverage: 40% (Critical)
```

Higher coverage means better marketing attribution.

### 2.8 Overdue PCFs

Two cards track missing post-call forms:

1. **Overdue PCFs Card** - Count of calls past due for PCF
2. **Overdue by Closer Card** - Breakdown by team member

💡 **Tip:** Click to see the specific events that need attention.

---

## 3. Analytics

The Analytics page (`/analytics`) provides deep performance analysis.

### 3.1 Tabs

| Tab | Purpose |
|-----|---------|
| **Closer Performance** | Individual closer metrics and rankings |
| **Platform Performance** | Source attribution and channel analysis |

### 3.2 Closer Performance Tab

A comprehensive table ranking closers by performance:

| Metric | Description |
|--------|-------------|
| **Name** | Closer's display name |
| **Calls** | Total calls taken |
| **Showed** | Number of attended calls |
| **Show Rate** | Attendance percentage |
| **Deals** | Total closed deals |
| **Close Rate** | Conversion percentage |
| **Cash** | Revenue generated |

**Click a row** to see that closer's detailed event history.

### 3.3 Platform Performance Tab

#### Source Attribution Drill-Down

A hierarchical tree showing lead flow:

```
Platform → Channel → Setter
─────────────────────────────────
▼ Instagram (45)        │ 14 │ 78% │ 3 │ 32%
  ▼ Organic (30)        │  9 │ 80% │ 2 │ 22%
    > John (12)         │  4 │ 75% │ 1 │ 25%
    > Sarah (18)        │  5 │ 83% │ 1 │ 20%
  ▼ Paid (15)           │  5 │ 73% │ 1 │ 20%
```

**Badges indicate data source:**
- 🔵 **UTM** - From tracking links
- 🟤 **CRM** - From Close/HubSpot
- 🟣 **DETECTED** - Quiz funnel or pattern matching
- ⚪ **IG** - Instagram handle cross-reference

**Filters:**
- All Platforms / specific platform
- All Channels / Organic / Paid
- All Setters / specific setter
- ☑️ Show Capital Tiers - adds revenue tier breakdown

#### Call Type Breakdown

Shows performance by event type with dual views:

| Call Type | Completed | Created |
|-----------|-----------|---------|
| Strategy Call | 23 | 28 |
| Qualifier | 15 | 18 |

**Click a row** to drill into those events.

#### Source Breakdown

Similar to Call Type but grouped by traffic source.

#### Platform Cash

Revenue ranking by marketing channel:

| Platform | Cash Collected |
|----------|---------------|
| Instagram | $85,000 |
| YouTube | $42,000 |
| Newsletter | $28,000 |

#### Metrics by Platform

Overall performance grouped by booking platform (Calendly vs Cal.com).

#### Closers by Platform

Closer performance with platform-specific metrics.

---

## 4. Settings & Integrations

Configure your organization at `/settings`.

### 4.1 Integrations Tab

Connect your external services:

#### Booking Software
| Platform | Setup |
|----------|-------|
| **Calendly** | Enter Personal Access Token, select webhook events |
| **Cal.com** | Enter API Key, configure webhook endpoint |

#### CRM
| Platform | Setup |
|----------|-------|
| **Close CRM** | Enter API Key, map custom fields |
| **GoHighLevel** | Enter API Key and Location ID |
| **HubSpot** | Enter API Key (attribution sync) |

#### Payment Processors
| Platform | Setup |
|----------|-------|
| **Whop** | Connect for payment tracking |

### 4.2 Webhooks Tab

Manage incoming webhook connections:

- View connected webhooks
- See payload history
- Debug delivery issues
- Create custom connections

### 4.3 Packages Tab

Define your products/packages for revenue tracking:

| Field | Purpose |
|-------|---------|
| **Name** | Package display name |
| **Price** | Package value for metrics |
| **Active** | Toggle availability |

### 4.4 Forms Tab

#### Post-Call Form Builder

Customize the form closers submit after calls:

**Available Fields:**
- Outcome (dropdown)
- Package Sold (if closed)
- Objection Bucket
- Follow-up Date
- Notes
- Custom fields

**Settings:**
- Required vs optional fields
- Field order
- Conditional logic

### 4.5 Dynamic Forms (if enabled)

Create custom forms beyond post-call:

| Form Type | Use Case |
|-----------|----------|
| **EOD Report** | Daily closer check-ins |
| **Intake Form** | Lead qualification |
| **Weekly Review** | Team retrospectives |

**Features:**
- Multiple field types (text, number, currency, select, date)
- Conditional visibility rules
- Automatic metric generation
- Dataset sync for dashboards

### 4.6 Team Tab

Manage your organization members:

#### Team Members
- Invite new members via email
- Set roles (Admin, Sales Rep)
- Deactivate departed team members

#### Display Name Manager
- Set preferred display names for closers
- Consolidate duplicate entries
- Backfill missing emails

#### Setter Alias Manager
- Map setter aliases (Instagram handles, nicknames)
- Ensure consistent attribution
- Handle name variations

#### Deleted Closer Mapping
- Reassign calls from deleted team members
- Preserve historical data integrity

---

## 5. Rep Portal

The Rep Portal (`/rep-portal`) is the closer-facing interface.

### 5.1 Access Methods

| Method | URL | Use Case |
|--------|-----|----------|
| **Magic Link** | `/rep-portal?token=xxx` | One-click access for closers |
| **Direct Login** | `/rep-login` | Email-based authentication |
| **Embedded** | Admin view | Manage on behalf of closers |

### 5.2 My Calls Tab

A personalized view of the closer's assigned calls:

| Feature | Description |
|---------|-------------|
| **Date Range** | Filter to specific time periods |
| **Search** | Find calls by lead name |
| **PCF Status** | Filter pending vs. completed forms |
| **Stats Cards** | Personal show rate, close rate, cash |

**Actions:**
- Submit PCF for past calls
- View call details
- Export personal data

### 5.3 My Forms Tab (if enabled)

Submit assigned dynamic forms:

- Daily EOD reports
- Weekly check-ins
- Custom organizational forms

### 5.4 Submitting a Post-Call Form

1. Find the call in your list
2. Click **"Submit PCF"**
3. Fill in the outcome and details:
   - **Did they show?** Yes/No
   - **Outcome** (if showed): Closed, Offer Made, No Offer, etc.
   - **Package** (if closed): Select the product sold
   - **Notes**: Any relevant details
4. Click **Submit**

The form updates the event record and triggers metrics recalculation.

---

## 6. Reports & Exports

### 6.1 Calls Report (`/calls-report`)

A full-screen report environment:

| Feature | Description |
|---------|-------------|
| **Summary Cards** | Show/Close rates, Revenue |
| **Source Breakdown** | Performance by traffic source |
| **Event List** | Detailed call records |
| **Filters** | Date, Platform, Source, Closer |

**Export:** Click the download button for CSV export.

### 6.2 Export Events (`/export-events`)

Bulk data export with customizable fields:

1. Select date range
2. Choose columns to include
3. Apply filters (optional)
4. Download CSV

### 6.3 Payout Snapshots (`/payout-snapshots`)

Commission reports for your team:

| Feature | Description |
|---------|-------------|
| **Create Snapshot** | Generate point-in-time commission report |
| **View History** | Access past snapshots |
| **Closer Breakdown** | Individual earnings |
| **Export** | Download for payroll |

### 6.4 Setter Metrics (`/setter-metrics`)

Attribution performance for your setters:

| Metric | Description |
|--------|-------------|
| **Calls Booked** | Number of appointments set |
| **Show Rate** | Attendance of their bookings |
| **Closing Rate** | Conversion of their leads |
| **Revenue Attributed** | Cash from their bookings |

---

## 7. Best Practices

### 7.1 UTM Tracking Setup

For accurate attribution, use UTM parameters on all booking links:

```
https://calendly.com/your-team/strategy-call
  ?utm_platform=Instagram
  &utm_channel=Organic
  &utm_setter=JohnDoe
```

Visit `/utm-setup` for the link builder tool.

**Recommended Parameters:**
| Parameter | Purpose | Example |
|-----------|---------|---------|
| `utm_platform` | Traffic source | Instagram, YouTube |
| `utm_channel` | Paid vs Organic | Paid, Organic |
| `utm_setter` | Who set the call | FirstnameLastname |
| `utm_campaign` | Specific campaign | Summer2026Sale |

### 7.2 Post-Call Form Discipline

✅ **Do:**
- Submit PCF same day
- Include detailed notes
- Select accurate outcome

❌ **Don't:**
- Leave forms pending > 24 hours
- Skip the notes field
- Use "Other" without explanation

### 7.3 Data Hygiene

**Weekly Tasks:**
- Review Overdue PCFs
- Check duplicate events
- Verify closer assignments

**Monthly Tasks:**
- Audit setter aliases
- Review display name mappings
- Export data backups

### 7.4 Understanding the Lead Journey

Click any lead name to see their full attribution path:

```
Traffic Source → Channel → Setter → Closer
      ↓
 [Instagram] → [Organic] → [John] → [Sarah]
```

The Lead Journey sheet also shows:
- Booking form responses
- Prior events (repeat leads)
- Payment history
- Change audit trail

---

## Quick Reference

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search |
| `Esc` | Close dialogs |
| `Tab` | Navigate fields |

### Status Colors

| Color | Meaning |
|-------|---------|
| 🟢 Green | Success / Closed / Good |
| 🟡 Amber | Warning / Pending |
| 🔴 Red | Error / Overdue / Critical |
| 🔵 Blue | Info / Scheduled |
| ⚪ Gray | Canceled / Inactive |

### Support

For issues or questions:
1. Check this guide
2. Review the in-app tooltips
3. Contact your administrator

---

*This guide is maintained by the platform team. For technical documentation, see `docs/COMPREHENSIVE_SYSTEM_DOCUMENTATION.md`.*
