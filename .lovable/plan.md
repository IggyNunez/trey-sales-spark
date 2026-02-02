

# Calls by Platform (Daily) - Day-Specific Journey Drill-Down

## Summary
Enhance the "Calls by Platform (Daily)" component to allow clicking into specific day cells to see UTM breakdown **for that day only** (not totals), plus a list of all events for that day with full Cal.com payload data. This creates a granular drill-down journey for each day + platform combination.

## Current State

**What exists:**
- Daily platform table with clickable **Total** row that shows UTM breakdowns for the entire period
- UTM breakdowns include: utm_source, utm_medium, utm_campaign, utm_content, utm_term
- Uses `useCallsByPlatformPerDay` hook that aggregates UTM data per platform (but not per day+platform)

**Data available in Cal.com payload:**
| Field | Location | Example |
|-------|----------|---------|
| utm_platform | booking_metadata | "Instagram" |
| utm_source | booking_metadata | "Newsletter" |
| utm_medium | booking_metadata | "dm", "email" |
| utm_channel | booking_metadata | "Organic", "Paid" |
| utm_setter | booking_metadata | "Amadou" |
| utm_campaign | booking_metadata | "q1_promo" |
| IGHANDLE | booking_responses | "Dougokamura" |
| Capital tier | booking_responses | "$25,000-$100,000" |
| Citizenship | booking_responses | "Yes" |
| Other form responses | booking_responses | Various |

---

## Implementation Plan

### Phase 1: Hook Enhancement - Add Day+Platform Aggregation

**File:** `src/hooks/useCallsByPlatformPerDay.ts`

**Changes:**
1. Add new interface for day-specific UTM breakdown:
```typescript
export interface DayPlatformBreakdown {
  date: string;
  platform: string;
  count: number;
  utmBreakdowns: PlatformUTMBreakdowns;
  events: EventSummary[]; // List of events for this day+platform
}

export interface EventSummary {
  id: string;
  lead_name: string;
  lead_email: string;
  lead_phone?: string;
  closer_name?: string;
  setter_name?: string;
  event_outcome?: string;
  booked_at?: string;
  scheduled_at: string;
  booking_metadata: Record<string, unknown>;
  booking_responses: Record<string, unknown>;
}
```

2. Modify the query to also fetch: `lead_name`, `lead_email`, `lead_phone`, `closer_name`, `setter_name`, `event_outcome`, `booking_responses`

3. Add new aggregation structure:
```typescript
// New: Track per day+platform breakdown
const dayPlatformMap: Record<string, Record<string, { 
  utmAggregates: Record<UTMKey, Map<string, number>>,
  events: EventSummary[] 
}>> = {};
```

4. Add to return value:
```typescript
return {
  days: dayData,
  platforms,
  totals,
  grandTotal,
  platformBreakdowns,
  dayPlatformBreakdowns: dayPlatformMap, // NEW
} as CallsByPlatformResult;
```

### Phase 2: Update Component - Clickable Day Cells

**File:** `src/components/dashboard/CallsPipelineByPlatform.tsx`

**Changes:**

1. Add state for selected day+platform:
```typescript
const [selectedDayPlatform, setSelectedDayPlatform] = useState<{
  date: string;
  dateLabel: string;
  platform: string;
} | null>(null);
```

2. Make individual day cells clickable (not just totals):
```tsx
<TableCell key={platform} className="text-right">
  {(day.platforms[platform] || 0) > 0 ? (
    <button
      onClick={() => handleDayPlatformClick(day.date, day.dateLabel, platform)}
      className="inline-flex items-center gap-1 hover:text-primary hover:underline cursor-pointer"
    >
      {day.platforms[platform] || 0}
      <ChevronRight className="h-3 w-3 opacity-50" />
    </button>
  ) : (
    <span className="text-muted-foreground">0</span>
  )}
</TableCell>
```

3. Create new `DayPlatformDetailSheet` component:

```tsx
interface DayPlatformDetailSheetProps {
  date: string | null;
  dateLabel: string;
  platform: string | null;
  breakdown: { utmBreakdowns: PlatformUTMBreakdowns; events: EventSummary[] } | null;
  onClose: () => void;
  onEventClick: (event: EventSummary) => void;
}
```

### Phase 3: Create Day Journey Sheet Content

**File:** `src/components/dashboard/CallsPipelineByPlatform.tsx` (or new file)

The sheet will show:

1. **Header**: Date + Platform + Event Count
2. **UTM Breakdown Section**: Same as current total breakdown, but filtered to that day
3. **Events List**: All events for that day+platform with:
   - Lead name (clickable → opens Lead Journey Sheet)
   - Closer name
   - Setter name (resolved)
   - Event outcome badge
   - Time scheduled
   - Key booking responses (capital tier, citizenship, etc.)

```tsx
<div className="space-y-6">
  {/* UTM Breakdown */}
  <div>
    <h4 className="text-sm font-semibold mb-3">UTM Parameters</h4>
    <div className="grid grid-cols-2 gap-4">
      <UTMBreakdownSection label="Source" items={breakdown.utmBreakdowns.utm_source} />
      <UTMBreakdownSection label="Medium" items={breakdown.utmBreakdowns.utm_medium} />
      <UTMBreakdownSection label="Campaign" items={breakdown.utmBreakdowns.utm_campaign} />
      {/* Include utm_channel and utm_setter too */}
    </div>
  </div>

  {/* Events List */}
  <div>
    <h4 className="text-sm font-semibold mb-3">Events ({events.length})</h4>
    <div className="space-y-3">
      {events.map(event => (
        <EventCard 
          key={event.id}
          event={event}
          onClick={() => onEventClick(event)}
        />
      ))}
    </div>
  </div>
</div>
```

4. **Event Card** displays:
   - Lead name + email
   - Attribution badges (utm_platform, utm_channel, utm_setter)
   - Booking form responses summary
   - Click to open full Lead Journey Sheet

### Phase 4: Connect to Lead Journey Sheet

When clicking an event in the day breakdown:
1. Open the existing `LeadJourneySheet` with full event data
2. Pass all `booking_metadata` and `booking_responses` for complete journey display

---

## UI Flow

```text
┌─────────────────────────────────────────────────────────────┐
│  Calls by Platform (Daily)                                  │
├─────────────────────────────────────────────────────────────┤
│  Date        │ Instagram │ YouTube │ Newsletter │ Total    │
│─────────────────────────────────────────────────────────────│
│  Sun Feb 2   │    3→     │   1→    │    2→      │    6     │
│  Mon Feb 3   │    5→     │   0     │    1→      │    6     │
│  ...                                                        │
│─────────────────────────────────────────────────────────────│
│  Total       │    8→     │   1→    │    3→      │   12     │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ Click on "3" (Sun Feb 2 + Instagram)
┌─────────────────────────────────────────────────────────────┐
│  Sheet: Sun Feb 2 • Instagram • 3 calls                     │
├─────────────────────────────────────────────────────────────┤
│  UTM Parameters                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Source       │  │ Medium       │  │ Channel      │      │
│  │ dm: 2        │  │ link: 3      │  │ Organic: 2   │      │
│  │ link: 1      │  │              │  │ Paid: 1      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  Setter           │                                         │
│  Amadou: 2        │                                         │
│  (none): 1        │                                         │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│  Events (3)                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Diego Reino         • Matt Yogarajah (closer)      →│   │
│  │ 🏷️ Instagram 🏷️ Organic 🏷️ Amadou                  │   │
│  │ Capital: $25,000-$100,000 • US Citizen: Yes         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Kahil Wright        • Sean Wilson (closer)         →│   │
│  │ 🏷️ Instagram 🏷️ Organic                             │   │
│  │ Capital: $100,000-$300,000 • US Citizen: Yes        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ Click on event card
┌─────────────────────────────────────────────────────────────┐
│  Lead Journey Sheet (existing)                              │
│  Full attribution path, timeline, form responses, history   │
└─────────────────────────────────────────────────────────────┘
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useCallsByPlatformPerDay.ts` | Add day+platform aggregation, fetch event details |
| `src/components/dashboard/CallsPipelineByPlatform.tsx` | Add clickable day cells, new detail sheet |

---

## Technical Notes

- **Performance**: Query already fetches events with date range; we're just adding more fields and a second layer of aggregation
- **Setter Resolution**: Events list will use raw `setter_name`; clicking into Lead Journey will use `useSetterAliasMap` for resolution
- **Missing data handling**: Events without UTM data show "(none)" in breakdowns and "No attribution data" in event cards
- **Current Total breakdown**: Still works as before (clicking Total row); this is additive

---

## What Data Will Be Visible Per Event

From `booking_metadata`:
- utm_platform, utm_source, utm_medium, utm_channel, utm_campaign, utm_content, utm_term, utm_setter

From `booking_responses`:
- IGHANDLE
- Capital tier (How much investible capital...)
- Citizenship (US Citizen/Green Card)
- Other form-specific questions

From event record:
- lead_name, lead_email, lead_phone
- closer_name, setter_name
- event_outcome, scheduled_at, booked_at

