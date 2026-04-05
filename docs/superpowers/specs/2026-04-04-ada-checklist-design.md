# ADA Checklist — Design Spec
**Date:** 2026-04-04  
**Status:** Approved

---

## Goal

Replace the current BrowserUse Insights section (which displays a grade, compliance percentage, and bullet lists) with a transparent, trust-first ADA checklist system. For every selected location, BrowserUse determines which of 10 physical-barrier checklist items are met, and shows the source evidence for each finding.

Core principle: **trust and transparency over summary scores**. Users must be able to see exactly what evidence the model used and where it came from.

---

## The 10 Checklist Items

Physical-barrier focused, sourced from the ADA Checklist for Existing Facilities (Priorities 1–3). Each item is verifiable from web sources (reviews, photos, official pages).

| # | Item | What "Met" means | ADA Reference |
|---|---|---|---|
| 1 | Accessible Route | Continuous path from street/parking to entrance — curb cuts, no stairs | Priority 1 · Section 1A |
| 2 | Accessible Entrance | Step-free entry usable without assistance | Priority 1 · Section 1B |
| 3 | Door Width & Type | Entry doors ≥32" clear width; automatic or push-button opener | Priority 1 · Section 1C |
| 4 | Ramp Availability | Ramp present where level changes exist (max 1:12 slope) | Priority 1 · Section 1D |
| 5 | Accessible Parking | Designated spaces with access aisle near entrance | Priority 1 · Section 1A |
| 6 | Elevator / Lift | Available if building is multi-story | Priority 2 · Section 2B |
| 7 | Accessible Restroom | Grab bars, turning radius, accessible fixtures | Priority 3 · Section 3A |
| 8 | Interior Pathway Width | Corridors/aisles ≥36" wide and obstacle-free | Priority 2 · Section 2A |
| 9 | Service Counter Height | Lowered counter section reachable from a wheelchair (≤36") | Priority 2 · Section 2F |
| 10 | Accessible Signage | ISA symbols marking accessible routes and facilities | Priority 2 · Section 2G |

---

## Data Model

### ChecklistItemStatus
```ts
type ChecklistItemStatus = 'met' | 'not_met' | 'unknown' | 'na'
```

- `met` — evidence confirms the feature is present
- `not_met` — evidence confirms the feature is absent or non-compliant
- `unknown` — insufficient information found in web sources
- `na` — item does not apply to this location (e.g. elevator for a single-story building)

### ChecklistItem
```ts
interface ChecklistItem {
  id: number           // 1–10, matches the table above
  status: ChecklistItemStatus
  sourceUrl: string | null   // URL of the page where evidence was found
  sourceQuote: string | null // Verbatim excerpt from that source
  naReason: string | null    // Explanation when status === 'na'
}
```

### BrowserUseInsights (new shape)
```ts
interface BrowserUseInsights {
  checklist: ChecklistItem[]   // always 10 items, one per checklist entry
  metCount: number             // count of items with status === 'met'
}
```

The old `adaPercent`, `grade`, `compliance[]`, and `limitations[]` fields are removed entirely.

---

## API Changes

### `POST /api/places/browseruse`

The BrowserUse task prompt is rewritten to request the 10-item checklist JSON directly:

```
Search the web for physical accessibility information about "{name}" at "{address}".

Check Google Maps, Yelp, the official website, and any local accessibility review sites.

For each of the following 10 items, determine if it is met, not met, unknown, or n/a.
Return a JSON array with exactly 10 objects in the same order.

Items:
1. Accessible Route — continuous path from street/parking to entrance (curb cuts, no stairs)
2. Accessible Entrance — step-free entry usable without assistance
3. Door Width & Type — entry doors ≥32" wide; automatic or push-button opener
4. Ramp Availability — ramp present where level changes exist (max 1:12 slope)
5. Accessible Parking — designated spaces with access aisle near entrance
6. Elevator / Lift — elevator or lift available (mark n/a if building is single-story)
7. Accessible Restroom — grab bars, turning radius, accessible fixtures
8. Interior Pathway Width — corridors/aisles ≥36" wide and obstacle-free
9. Service Counter Height — lowered counter section reachable from a wheelchair (≤36")
10. Accessible Signage — ISA symbols marking accessible routes and facilities

Return ONLY this JSON (no explanation, no markdown):
{
  "checklist": [
    {
      "id": 1,
      "status": "met",
      "sourceUrl": "https://...",
      "sourceQuote": "verbatim excerpt from the source",
      "naReason": null
    },
    ...
  ]
}

Rules:
- status must be one of: "met", "not_met", "unknown", "na"
- sourceUrl and sourceQuote are required when status is "met" or "not_met"; null otherwise
- naReason is required when status is "na"; null otherwise
- sourceQuote must be a verbatim excerpt — never paraphrase or invent
- Return exactly 10 items in order
```

### `GET /api/places/browseruse?taskId=xxx`

On success, derives `metCount` before returning:
```ts
const metCount = checklist.filter(i => i.status === 'met').length
return { status: 'done', insights: { checklist, metCount } }
```

Claude fallback parsing is updated to extract the new schema (same pattern: regex match on `{...}`, parse, validate shape).

### `POST /api/score` (route.ts)

This route is **removed**. It was only used to generate `grade`, `tags`, and `summary` — all of which are replaced by the checklist. The `place.score` prop is removed from the `Place` interface.

---

## UI Changes — `place-panel.tsx`

### Section header

Replaces the old grade/percentage block:

```
[ Globe icon ]  BrowserUse Insights  [BETA badge]
                ADA Accessibility Checklist ⓘ
                                      X / 10 items confirmed
```

The ⓘ next to "ADA Accessibility Checklist" is a hover tooltip explaining: "The Americans with Disabilities Act (ADA) is a federal law requiring physical accessibility for people with disabilities."

`X / 10 items confirmed` counts only `status === 'met'` items. The progress bar is removed.

### Checklist grid

Two-column layout, 5 items per column. Each row:

```
[✓/✗/?/—]  Item name          [INFO]
```

Status icons and colors:
- `met` → ✓ green (`#1e8e3e`), background `#f0f9f0`, border `#1e8e3e`
- `not_met` → ✗ orange (`#fa7b17`), background `#fff8f0`, border `#fa7b17`
- `unknown` → ? grey (`#9aa0b8`), background `#f5f5f8`, border `#ccc`
- `na` → — neutral grey (`#9aa0b8`), background `#f5f5f8`, border `#ccc`

### INFO slide-out card

- Only one INFO card is open at a time. Clicking INFO on a different item closes the current one.
- The card slides out from beneath the checklist item, sharing its border color, with no top border — visually attached.
- Card structure:

```
Explanation:
[description of what this item means]
[ADA citation as small subtext, e.g. "Priority 1 · Section 1B"]

Referenced source:               (only shown if sourceUrl is not null)
[verbatim sourceQuote in a styled blockquote]
[🔗 View source → (links to sourceUrl)]

OR if status is 'unknown':
[italic grey text: "No source found. Insufficient information available from web sources."]

OR if status is 'na':
[italic grey text: naReason from API]
```

### Removed elements

- Grade badge (large coloured box with letter grade)
- `adaPercent` percentage display
- Progress bar
- "Areas of Compliance" / "Limitations" two-column lists
- `TagIcon` and tags display in the header row (the score tags were derived from the old score route)
- `gradeStyle()` helper function
- `BrowserUseInsights` old interface

### Skeleton loading states

During `buStatus === 'loading'`:
- Header shows "Scanning accessibility data…" pulse
- `X / 10` shows skeleton placeholders
- Checklist grid shows 10 skeleton rows (two columns of 5)

---

## Checklist Item Definitions (for INFO cards)

Static lookup table in the component, keyed by item `id`:

```ts
const CHECKLIST_INFO: Record<number, { label: string; explanation: string; adaRef: string }> = {
  1:  { label: 'Accessible Route',        explanation: 'A continuous, obstacle-free path from public street or parking to the entrance — including curb cuts and no stairs.', adaRef: 'Priority 1 · Section 1A' },
  2:  { label: 'Accessible Entrance',     explanation: 'Step-free entry usable without assistance. Includes automatic doors or push-button openers. Must not require using a separate side entrance.', adaRef: 'Priority 1 · Section 1B' },
  3:  { label: 'Door Width & Type',       explanation: 'Entry doors must provide at least 32" of clear width. Automatic openers or push-button assistors count toward compliance.', adaRef: 'Priority 1 · Section 1C' },
  4:  { label: 'Ramp Availability',       explanation: 'Where level changes exist, a ramp must be present with a slope no steeper than 1:12 (one inch of rise per 12 inches of run).', adaRef: 'Priority 1 · Section 1D' },
  5:  { label: 'Accessible Parking',      explanation: 'Designated accessible parking spaces with a proper access aisle, located as close as possible to the accessible entrance.', adaRef: 'Priority 1 · Section 1A' },
  6:  { label: 'Elevator / Lift',         explanation: 'If the building has more than one story, an elevator or platform lift must serve all publicly accessible floors.', adaRef: 'Priority 2 · Section 2B' },
  7:  { label: 'Accessible Restroom',     explanation: 'At least one restroom must have grab bars, sufficient turning radius (60"), and fixtures reachable from a wheelchair.', adaRef: 'Priority 3 · Section 3A' },
  8:  { label: 'Interior Pathway Width',  explanation: 'Interior corridors and aisles must be at least 36" wide and kept free of obstructions to allow wheelchair navigation.', adaRef: 'Priority 2 · Section 2A' },
  9:  { label: 'Service Counter Height',  explanation: 'At least one section of any service or reception counter must be no higher than 36" to be reachable from a seated wheelchair position.', adaRef: 'Priority 2 · Section 2F' },
  10: { label: 'Accessible Signage',      explanation: 'The International Symbol of Accessibility (ISA) must mark accessible entrances, restrooms, parking, and routes throughout the facility.', adaRef: 'Priority 2 · Section 2G' },
}
```

---

## Out of Scope

- Sensory/cognitive accessibility items (hearing loops, braille signage) — physical barriers only
- Multiple BrowserUse sessions per location
- Caching checklist results across page loads (future work)
- The `/api/score` route is removed, not replaced
