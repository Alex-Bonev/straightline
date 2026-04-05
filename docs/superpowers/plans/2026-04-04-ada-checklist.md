# ADA Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the grade/percentage BrowserUse section with a 10-item ADA physical-barrier checklist that shows source URL and verbatim quote evidence for each finding.

**Architecture:** Three-file change. The BrowserUse API route gets a new prompt and a new response schema. The map page and google-map component drop the old grade/score system. The PlacePanel gets a new two-column checklist section with per-item INFO slide-outs.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS v4, BrowserUse Cloud API v3, Anthropic SDK (Claude fallback parser)

---

## File Map

| File | Change |
|---|---|
| `app/api/score/route.ts` | **Delete** — removed entirely |
| `components/map/google-map.tsx` | Remove `grade` from `MapPlace`, remove `gradeToColor()`, fix marker color |
| `app/map/page.tsx` | Remove `scorePlace`, `score`/`scoring` from `Place`, remove grade helpers, simplify `LocationCard` |
| `app/api/places/browseruse/route.ts` | Rewrite POST prompt; rewrite GET validation + Claude fallback |
| `components/map/place-panel.tsx` | New types, `CHECKLIST_INFO`, `ChecklistRow` component, new BrowserUse section JSX |

---

## Task 1: Remove the old grade/scoring system

**Files:**
- Delete: `app/api/score/route.ts`
- Modify: `components/map/google-map.tsx`
- Modify: `app/map/page.tsx`

- [ ] **Step 1: Delete the score API route**

```bash
rm app/api/score/route.ts
```

- [ ] **Step 2: Simplify `google-map.tsx` — remove grade from MapPlace and gradeToColor**

Replace the entire file content with:

```ts
'use client'

import { useEffect, useImperativeHandle, forwardRef } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps'

export interface MapPlace {
  placeId: string
  name: string
  location: { lat: number; lng: number }
}

export interface GoogleMapHandle {
  focusPlace: (location: { lat: number; lng: number }, panelOpen?: boolean) => void
}

function offsetLatLng(
  location: { lat: number; lng: number },
  xPixels: number,
  yPixels: number,
  zoom: number
): { lat: number; lng: number } {
  const scale   = Math.pow(2, zoom)
  const worldX  = ((location.lng + 180) / 360) * 256
  const sinLat  = Math.sin((location.lat * Math.PI) / 180)
  const worldY  = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * 256
  const newX    = worldX + xPixels / scale
  const newY    = worldY + yPixels / scale
  const newLng  = (newX / 256) * 360 - 180
  const n       = Math.PI - (2 * Math.PI * newY) / 256
  const newLat  = (Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) * 180) / Math.PI
  return { lat: newLat, lng: newLng }
}

interface Props {
  center: { lat: number; lng: number }
  places: MapPlace[]
  selectedPlaceId?: string | null
  onMarkerClick?: (placeId: string) => void
  onReady?: () => void
  userLocation?: { lat: number; lng: number } | null
}

const MapInner = forwardRef<GoogleMapHandle, Props>(function MapInner(
  { center, places, selectedPlaceId, onMarkerClick, onReady, userLocation },
  ref
) {
  const map = useMap()

  useImperativeHandle(ref, () => ({
    focusPlace(location, panelOpen = false) {
      if (map) {
        const zoom   = 17
        const target = offsetLatLng(location, -100, panelOpen ? 100 : 0, zoom)
        map.panTo(target)
        map.setZoom(zoom)
      }
    },
  }), [map])

  useEffect(() => {
    if (!map) return
    map.setOptions({
      mapTypeControl: false,
      rotateControl: false,
      scaleControl: false,
    })
  }, [map])

  useEffect(() => {
    if (!map) return
    const listener = map.addListener('tilesloaded', () => {
      onReady?.()
      listener.remove()
    })
    return () => listener.remove()
  }, [map, onReady])

  useEffect(() => {
    if (!map) return
    map.panTo(center)
  }, [map, center])

  return (
    <>
      {userLocation && (
        <AdvancedMarker position={userLocation} title="Your location" zIndex={1000}>
          <div style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: '#1a73e8',
            border: '3px solid #fff',
            boxShadow: '0 2px 10px rgba(26,115,232,0.55)',
          }} />
        </AdvancedMarker>
      )}
      {places.map((place) => (
        <AdvancedMarker
          key={place.placeId}
          position={place.location}
          title={place.name}
          onClick={() => onMarkerClick?.(place.placeId)}
        >
          <Pin
            background="#1a73e8"
            borderColor={selectedPlaceId === place.placeId ? '#fff' : 'transparent'}
            glyphColor="#fff"
            scale={selectedPlaceId === place.placeId ? 1.4 : 1}
          />
        </AdvancedMarker>
      ))}
    </>
  )
})

export function GoogleMapView({
  apiKey,
  mapRef,
  ...props
}: Props & { apiKey: string; mapRef?: React.Ref<GoogleMapHandle> }) {
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        mapId="straightline-map"
        defaultCenter={props.center}
        defaultZoom={14}
        gestureHandling="greedy"
        style={{ width: '100%', height: '100%' }}
        mapTypeControl={false}
        fullscreenControl={false}
        zoomControl={false}
      >
        <MapInner ref={mapRef} {...props} />
      </Map>
    </APIProvider>
  )
}
```

- [ ] **Step 3: Simplify `app/map/page.tsx` — remove score system**

Apply these changes to `app/map/page.tsx`:

**3a.** Remove these imports (lines 20–27):
```ts
  Accessibility,
  ArrowUpDown,
  ShieldCheck,
  Car,
  Loader2,
```
Also remove this import line entirely:
```ts
import { Glow } from '@/components/ui/glow'
```

**3b.** Replace the `Place` interface (lines 37–53) with:
```ts
interface Place {
  placeId: string
  name: string
  address: string
  location: { lat: number; lng: number }
  rating: number | null
  userRatingsTotal: number
  types: string[]
  openNow: boolean | null
  photoRef?: string | null
}
```

**3c.** Delete the three helper functions `getGradeConfig`, `getGlowVars`, and `tagIcon` (lines 62–88).

**3d.** Replace the `LocationCard` component (lines 136–207) with:
```tsx
function LocationCard({ place, selected, onClick }: { place: Place; selected: boolean; onClick: () => void }) {
  const photoUrl = place.photoRef
    ? `/api/places/photo?ref=${encodeURIComponent(place.photoRef)}&w=200`
    : null

  return (
    <Card
      onClick={onClick}
      className={`relative flex-row gap-0 overflow-hidden rounded-2xl border p-0 shadow-sm transition-all duration-200 cursor-pointer group min-h-[76px]
        ${selected
          ? 'border-[#1a73e8] shadow-[0_4px_20px_rgba(26,115,232,0.22)] bg-[#f0f6ff]'
          : 'border-[#eaecf0] hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:border-[#c8d0e0]'
        }`}
    >
      <div className="relative w-[68px] flex-shrink-0 overflow-hidden self-stretch">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={place.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: '#1a73e814' }}>
            <MapPin size={18} style={{ color: '#1a73e8' }} />
          </div>
        )}
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col justify-center px-3.5 py-3">
        <h3 className="truncate text-[13.5px] font-bold leading-snug transition-colors"
          style={{ color: selected ? '#1a52b4' : '#1a2035' }}>
          {place.name}
        </h3>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium truncate" style={{ color: '#6b7a99' }}>
          <MapPin size={9} className="flex-shrink-0" />
          <span className="truncate">{place.address}</span>
        </p>
      </div>
    </Card>
  )
}
```

**3e.** Delete the `scorePlace` useCallback (lines 240–259).

**3f.** In `fetchNearby`, remove the score call at the end. Replace:
```ts
      nearbyPlacesRef.current = raw
      setPlaces(raw)
      // Do NOT auto-select on boot — user picks their own first result
      ;(async () => { for (const p of raw.slice(0, 5)) await scorePlace(p.placeId) })()
```
With:
```ts
      nearbyPlacesRef.current = raw
      setPlaces(raw)
```

Also remove `scorePlace` from the `fetchNearby` dependency array: change `}, [scorePlace])` to `}, [])`.

**3g.** In `handleSearch`, remove the three score call lines (one in the fallback branch and two in the main success branch). Each looks like:
```ts
      ;(async () => { for (const p of raw.slice(0, 5)) await scorePlace(p.placeId) })()
```
or:
```ts
      ;(async () => { for (const p of fallback.slice(0, 5)) await scorePlace(p.placeId) })()
```
Delete all three occurrences. Also remove `scorePlace` from `handleSearch`'s dependency array.

**3h.** Replace the `selectPlace` callback (lines 374–383) with:
```ts
  const selectPlace = useCallback((place: Place) => {
    if (selectedId === place.placeId) {
      setSelectedId(null)
      return
    }
    setSelectedId(place.placeId)
    mapHandleRef.current?.focusPlace(place.location, true)
  }, [selectedId])
```

**3i.** Replace the `mapPlaces` line (line 428) with:
```ts
  const mapPlaces: MapPlace[] = places.map((p) => ({ placeId: p.placeId, name: p.name, location: p.location }))
```

- [ ] **Step 4: Verify the app compiles with no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors. If you see errors about removed properties being referenced, trace them and remove the reference.

- [ ] **Step 5: Start the dev server and verify the map loads**

```bash
npm run dev
```

Open http://localhost:3000/map. Confirm:
- Map loads and nearby places appear in the sidebar as cards (name + address only, no grade badge)
- All map markers are blue
- Clicking a card opens the PlacePanel (BrowserUse section will still show old UI until Task 3)
- No console errors about `scorePlace` or `/api/score`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove grade/score system in preparation for ADA checklist"
```

---

## Task 2: Rewrite BrowserUse API for checklist schema

**Files:**
- Modify: `app/api/places/browseruse/route.ts`

- [ ] **Step 1: Rewrite the POST handler task prompt**

In `app/api/places/browseruse/route.ts`, replace the `task` template string (everything assigned to `const task = \`...\``) with:

```ts
  const task = `
Search the web for physical accessibility information about "${name}" located at "${address}".

Check Google Maps reviews, Yelp reviews, the official website, and any local accessibility review sites.

For each of the 10 items below, determine whether it is met, not_met, unknown, or na.
Return a JSON object with exactly 10 checklist items in the same order.

Items:
1. Accessible Route — continuous path from street/parking to entrance (curb cuts, no stairs)
2. Accessible Entrance — step-free entry usable without assistance
3. Door Width & Type — entry doors ≥32" wide; automatic or push-button opener
4. Ramp Availability — ramp present where level changes exist (max 1:12 slope)
5. Accessible Parking — designated spaces with access aisle near entrance
6. Elevator / Lift — elevator or lift available (use na if building is confirmed single-story)
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
    }
  ]
}

Rules:
- status must be exactly one of: "met", "not_met", "unknown", "na"
- sourceUrl and sourceQuote must be present (non-null) when status is "met" or "not_met"
- sourceUrl and sourceQuote must be null when status is "unknown" or "na"
- naReason must be a short explanation when status is "na"; null otherwise
- sourceQuote must be a verbatim excerpt — never paraphrase or invent text
- Return exactly 10 items in order (id 1 through 10)
`
```

- [ ] **Step 2: Rewrite the GET handler — update schema validation and Claude fallback**

In the GET handler, replace the direct JSON parse block (the `if (directMatch)` block) with:

```ts
  // Try to parse JSON directly from the output first
  const directMatch = rawOutput.match(/\{[\s\S]*\}/)
  if (directMatch) {
    try {
      const parsed = JSON.parse(directMatch[0])
      if (Array.isArray(parsed.checklist) && parsed.checklist.length === 10) {
        const metCount = parsed.checklist.filter((i: { status: string }) => i.status === 'met').length
        return Response.json({ status: 'done', insights: { checklist: parsed.checklist, metCount } })
      }
    } catch {
      // fall through to Claude parsing
    }
  }
```

Then replace the Claude fallback `messages` content with:

```ts
        {
          role: 'user',
          content: `Extract ADA accessibility checklist data from the text below and return ONLY valid JSON.

Text:
${rawOutput}

Return this exact JSON (no extra text, no markdown):
{
  "checklist": [
    {
      "id": 1,
      "status": "met",
      "sourceUrl": "https://... or null",
      "sourceQuote": "verbatim excerpt or null",
      "naReason": null
    }
  ]
}

Rules:
- Include exactly 10 items (id 1–10) in order
- status: "met", "not_met", "unknown", or "na"
- sourceUrl/sourceQuote: non-null only when status is "met" or "not_met"
- naReason: non-null only when status is "na"
- Never invent sourceUrl or sourceQuote — use null if not found in the text

Items in order:
1. Accessible Route
2. Accessible Entrance
3. Door Width & Type
4. Ramp Availability
5. Accessible Parking
6. Elevator / Lift
7. Accessible Restroom
8. Interior Pathway Width
9. Service Counter Height
10. Accessible Signage`,
        },
```

And update the Claude response handling to derive `metCount`:

```ts
    const insights = JSON.parse(match[0])
    if (!Array.isArray(insights.checklist)) return Response.json({ status: 'error' })
    const metCount = insights.checklist.filter((i: { status: string }) => i.status === 'met').length
    return Response.json({ status: 'done', insights: { checklist: insights.checklist, metCount } })
```

- [ ] **Step 3: Verify the API compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke-test the POST endpoint**

Start the dev server if not already running, then in a second terminal:

```bash
curl -s -X POST http://localhost:3000/api/places/browseruse \
  -H 'Content-Type: application/json' \
  -d '{"name":"Geisel Library","address":"9500 Gilman Dr, La Jolla, CA 92093"}' | jq .
```

Expected output: `{"taskId":"<some-id>"}`. Save the taskId.

- [ ] **Step 5: Poll until done and verify checklist shape**

```bash
# Replace <taskId> with the value from step 4
curl -s "http://localhost:3000/api/places/browseruse?taskId=<taskId>" | jq .
```

Repeat every 10 seconds until `status` is `"done"`. Then confirm:
- Response has `insights.checklist` — an array of 10 objects
- Each object has `id` (1–10), `status` (one of met/not_met/unknown/na), `sourceUrl`, `sourceQuote`, `naReason`
- Response has `insights.metCount` — a number 0–10

- [ ] **Step 6: Commit**

```bash
git add app/api/places/browseruse/route.ts
git commit -m "feat: rewrite BrowserUse API to return 10-item ADA checklist schema"
```

---

## Task 3: Rewrite PlacePanel BrowserUse section

**Files:**
- Modify: `components/map/place-panel.tsx`

- [ ] **Step 1: Update imports and interfaces at the top of the file**

Replace the import from lucide-react:
```ts
import {
  ChevronLeft, ChevronRight, MapPin,
  Accessibility, ShieldCheck, ArrowUpDown, Car,
  Globe, X, CheckCircle2, AlertTriangle,
} from 'lucide-react'
```
With:
```ts
import {
  ChevronLeft, ChevronRight, MapPin,
  Globe, X,
} from 'lucide-react'
```

Replace the `Place` interface:
```ts
interface Place {
  placeId: string
  name: string
  address: string
  types: string[]
  score?: { grade: string; tags: string[]; summary: string }
}
```
With:
```ts
interface Place {
  placeId: string
  name: string
  address: string
  types: string[]
}
```

Replace the `BrowserUseInsights` interface:
```ts
interface BrowserUseInsights {
  adaPercent: number
  grade: string
  compliance: string[]
  limitations: string[]
}
```
With:
```ts
type ChecklistItemStatus = 'met' | 'not_met' | 'unknown' | 'na'

interface ChecklistItem {
  id: number
  status: ChecklistItemStatus
  sourceUrl: string | null
  sourceQuote: string | null
  naReason: string | null
}

interface BrowserUseInsights {
  checklist: ChecklistItem[]
  metCount: number
}
```

- [ ] **Step 2: Delete dead helper functions**

Delete the following functions entirely (they are no longer used):
- `gradeStyle(grade: string)` (the function that returns `{ bg, label }`)
- `TagIcon({ tag }: { tag: string })` component
- `ComplianceSkeletons({ count }: { count: number })` component

- [ ] **Step 3: Add CHECKLIST_INFO lookup table and helper functions**

Add these after the `shortAddress` function (before the `PlaceTitle` component):

```ts
const CHECKLIST_INFO: Record<number, { label: string; explanation: string; adaRef: string }> = {
  1:  { label: 'Accessible Route',       explanation: 'A continuous, obstacle-free path from public street or parking to the entrance — including curb cuts and no stairs.', adaRef: 'Priority 1 · Section 1A' },
  2:  { label: 'Accessible Entrance',    explanation: 'Step-free entry usable without assistance. Includes automatic doors or push-button openers. Must not require using a separate side entrance.', adaRef: 'Priority 1 · Section 1B' },
  3:  { label: 'Door Width & Type',      explanation: 'Entry doors must provide at least 32" of clear width. Automatic openers or push-button assistors count toward compliance.', adaRef: 'Priority 1 · Section 1C' },
  4:  { label: 'Ramp Availability',      explanation: 'Where level changes exist, a ramp must be present with a slope no steeper than 1:12 (one inch of rise per 12 inches of run).', adaRef: 'Priority 1 · Section 1D' },
  5:  { label: 'Accessible Parking',     explanation: 'Designated accessible parking spaces with a proper access aisle, located as close as possible to the accessible entrance.', adaRef: 'Priority 1 · Section 1A' },
  6:  { label: 'Elevator / Lift',        explanation: 'If the building has more than one story, an elevator or platform lift must serve all publicly accessible floors.', adaRef: 'Priority 2 · Section 2B' },
  7:  { label: 'Accessible Restroom',    explanation: 'At least one restroom must have grab bars, sufficient turning radius (60"), and fixtures reachable from a wheelchair.', adaRef: 'Priority 3 · Section 3A' },
  8:  { label: 'Interior Pathway Width', explanation: 'Interior corridors and aisles must be at least 36" wide and kept free of obstructions to allow wheelchair navigation.', adaRef: 'Priority 2 · Section 2A' },
  9:  { label: 'Service Counter Height', explanation: 'At least one section of any service or reception counter must be no higher than 36" to be reachable from a seated wheelchair position.', adaRef: 'Priority 2 · Section 2F' },
  10: { label: 'Accessible Signage',     explanation: 'The International Symbol of Accessibility (ISA) must mark accessible entrances, restrooms, parking, and routes throughout the facility.', adaRef: 'Priority 2 · Section 2G' },
}

function statusStyle(status: ChecklistItemStatus) {
  switch (status) {
    case 'met':     return { icon: '✓', itemBg: '#f0f9f0', itemBorder: '#1e8e3e', iconColor: '#1e8e3e', slideColor: '#1e8e3e' }
    case 'not_met': return { icon: '✗', itemBg: '#fff8f0', itemBorder: '#fa7b17', iconColor: '#fa7b17', slideColor: '#fa7b17' }
    case 'na':      return { icon: '—', itemBg: '#f5f5f8', itemBorder: '#ccc',    iconColor: '#9aa0b8', slideColor: '#ccc'    }
    default:        return { icon: '?', itemBg: '#f5f5f8', itemBorder: '#ccc',    iconColor: '#9aa0b8', slideColor: '#ccc'    }
  }
}
```

- [ ] **Step 4: Add the ChecklistRow and ChecklistSkeleton components**

Add these after the `CHECKLIST_INFO` block, before `PlaceTitle`:

```tsx
function ChecklistRow({
  item,
  isOpen,
  onToggle,
}: {
  item: ChecklistItem
  isOpen: boolean
  onToggle: () => void
}) {
  const info = CHECKLIST_INFO[item.id]
  const { icon, itemBg, itemBorder, iconColor, slideColor } = statusStyle(item.status)

  return (
    <div>
      {/* Row */}
      <div style={{
        background: itemBg,
        border: `1.5px solid ${itemBorder}`,
        borderRadius: 8,
        padding: '7px 9px',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        position: 'relative',
        zIndex: 2,
      }}>
        <span style={{ color: iconColor, fontSize: 13, flexShrink: 0, width: 14, textAlign: 'center', fontWeight: 700 }}>
          {icon}
        </span>
        <span style={{ fontWeight: 700, fontSize: 10.5, color: '#1a2035', flex: 1, minWidth: 0, lineHeight: 1.3 }}>
          {info.label}
        </span>
        <button
          onClick={onToggle}
          style={{
            fontSize: 8,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '3px 6px',
            borderRadius: 4,
            background: isOpen ? '#1a52b4' : '#e8f0fe',
            color: isOpen ? 'white' : '#1a52b4',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label={`${isOpen ? 'Hide' : 'Show'} info for ${info.label}`}
        >
          INFO
        </button>
      </div>

      {/* Slide-out card */}
      <div style={{
        background: 'white',
        border: `1.5px solid ${isOpen ? slideColor : 'transparent'}`,
        borderTop: 'none',
        borderRadius: '0 0 8px 8px',
        maxHeight: isOpen ? 320 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.28s ease, padding 0.28s ease, border-color 0.15s ease',
        padding: isOpen ? '11px 9px 10px' : '0 9px',
        marginTop: -4,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Explanation */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9aa0b8', marginBottom: 3 }}>
            Explanation
          </div>
          <div style={{ fontSize: 11, color: '#2d3a50', lineHeight: 1.55 }}>{info.explanation}</div>
          <div style={{ fontSize: 9, color: '#b0b8d0', marginTop: 3, fontStyle: 'italic' }}>{info.adaRef}</div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#eef0f4', margin: '8px 0' }} />

        {/* Referenced source */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9aa0b8', marginBottom: 4 }}>
            Referenced Source
          </div>
          {item.status === 'na' ? (
            <div style={{ fontSize: 11, color: '#9aa0b8', fontStyle: 'italic' }}>
              {item.naReason ?? 'Not applicable for this location.'}
            </div>
          ) : item.sourceQuote ? (
            <>
              <div style={{
                fontSize: 11, color: '#2d3a50', fontStyle: 'italic', lineHeight: 1.5,
                background: '#f5f8ff', borderLeft: '3px solid #1a73e8',
                padding: '6px 8px', borderRadius: '0 4px 4px 0', marginBottom: 5,
              }}>
                &ldquo;{item.sourceQuote}&rdquo;
              </div>
              {item.sourceUrl && (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 10, color: '#1a73e8', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  🔗 View source →
                </a>
              )}
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#9aa0b8', fontStyle: 'italic' }}>
              No source found. Insufficient information available from web sources for this location.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChecklistSkeleton() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px',
      borderRadius: 8, background: '#f5f5f8', border: '1.5px solid #e8eaed',
    }}>
      <Skeleton className="h-3.5 w-3.5 rounded-full flex-shrink-0" />
      <Skeleton className="h-3 flex-1 rounded" />
      <Skeleton className="h-4 w-8 rounded" />
    </div>
  )
}
```

- [ ] **Step 5: Update PlacePanel component state and derived values**

Inside the `PlacePanel` component function body, make these changes:

**5a.** Add two new state variables after the existing `buPollCountRef` line:
```ts
  const [openInfoId, setOpenInfoId]         = useState<number | null>(null)
  const [adaTooltipVisible, setAdaTooltipVisible] = useState(false)
```

**5b.** Remove the entire "Derived insights" block:
```ts
  // Derived insights: BrowserUse data when ready, fall back to score/defaults
  const scoreGrade = place.score?.grade ?? 'B'
  const insights = {
    grade:       buInsights?.grade      ?? scoreGrade,
    adaPercent:  buInsights?.adaPercent ?? null,
    compliance:  buInsights?.compliance ?? null,
    limitations: buInsights?.limitations ?? null,
    tags:        place.score?.tags ?? [],
  }
  const g   = gradeStyle(insights.grade)
```

- [ ] **Step 6: Update the header row — remove tags display**

In the JSX, find the section that renders type · address · tags (around line 272–295). Replace it with:

```tsx
            {/* Type · address */}
            <div className="flex items-center gap-2 overflow-hidden mt-2" style={{ whiteSpace: 'nowrap' }}>
              <span className="flex-shrink-0 text-[11px] font-semibold" style={{ color: '#9aa0b8' }}>
                {typeLabel(place.types)}
              </span>
              <span style={{ color: '#d0d5e0' }}>·</span>
              <span className="flex shrink items-center gap-1 text-[11px] font-medium overflow-hidden" style={{ color: '#6b7a99' }}>
                <MapPin size={10} className="flex-shrink-0" />
                <span className="truncate">{shortAddress(place.address)}</span>
              </span>
            </div>
```

- [ ] **Step 7: Replace the BrowserUse section JSX**

Find the entire `{/* ── 2 · BrowserUse Insights ───────────────────────── */}` div and replace it with:

```tsx
        {/* ── 2 · BrowserUse Insights ───────────────────────── */}
        <div
          className="pp-s opacity-0"
          style={{ background: 'linear-gradient(160deg, #eef3ff 0%, #f5f8ff 100%)', borderBottom: '1px solid #dce6fc' }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: '#1a73e8' }}>
                <Globe size={17} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[19px] font-black leading-none tracking-tight" style={{ color: '#1a2035' }}>
                    BrowserUse Insights
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest"
                    style={{ backgroundColor: '#fff3e0', color: '#bf5000' }}>
                    BETA
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <p className="text-[11px] font-semibold" style={{ color: '#6b7a99' }}>
                    ADA Accessibility Checklist
                  </p>
                  {/* ADA info tooltip */}
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <span
                      onMouseEnter={() => setAdaTooltipVisible(true)}
                      onMouseLeave={() => setAdaTooltipVisible(false)}
                      style={{ width: 14, height: 14, borderRadius: '50%', background: '#e8f0fe', color: '#1a52b4', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', flexShrink: 0 }}
                    >
                      i
                    </span>
                    {adaTooltipVisible && (
                      <div style={{ position: 'absolute', left: 18, top: -4, width: 210, background: '#1a2035', color: 'white', fontSize: 10, padding: '8px 10px', borderRadius: 7, lineHeight: 1.5, zIndex: 50, pointerEvents: 'none' }}>
                        The Americans with Disabilities Act (ADA) is a federal civil rights law requiring physical accessibility for people with disabilities in public places.
                        <div style={{ position: 'absolute', left: -4, top: 8, width: 8, height: 8, background: '#1a2035', transform: 'rotate(45deg)' }} />
                      </div>
                    )}
                  </div>
                </div>
                {buStatus === 'loading' && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#1a73e8' }} />
                    <span className="text-[11px] font-semibold" style={{ color: '#1a73e8' }}>
                      Scanning accessibility data…
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* X / 10 count */}
            <div className="flex-shrink-0 text-right">
              {buStatus === 'loading' ? (
                <Skeleton className="h-7 w-16 rounded-lg" />
              ) : (
                <div>
                  <span className="text-[28px] font-black leading-none tracking-tight" style={{ color: '#1a2035' }}>
                    {buInsights?.metCount ?? 0}
                  </span>
                  <span className="text-[16px] font-bold" style={{ color: '#9aa0b8' }}>
                    {' '}/ 10
                  </span>
                  <p className="text-[8px] font-bold uppercase tracking-widest mt-0.5" style={{ color: '#9aa0b8' }}>
                    items confirmed
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Checklist grid — 2 columns of 5 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px', padding: '14px 20px 16px' }}>
            {/* Column 1: items 1–5 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {buStatus === 'loading'
                ? Array.from({ length: 5 }).map((_, i) => <ChecklistSkeleton key={i} />)
                : (buInsights?.checklist ?? []).slice(0, 5).map(item => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      isOpen={openInfoId === item.id}
                      onToggle={() => setOpenInfoId(openInfoId === item.id ? null : item.id)}
                    />
                  ))
              }
            </div>
            {/* Column 2: items 6–10 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {buStatus === 'loading'
                ? Array.from({ length: 5 }).map((_, i) => <ChecklistSkeleton key={i} />)
                : (buInsights?.checklist ?? []).slice(5, 10).map(item => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      isOpen={openInfoId === item.id}
                      onToggle={() => setOpenInfoId(openInfoId === item.id ? null : item.id)}
                    />
                  ))
              }
            </div>
          </div>
        </div>
```

- [ ] **Step 8: Verify the file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Common issues to fix:
- If `insights` is still referenced anywhere in the file, remove or replace those references
- If `g` (from the deleted `gradeStyle` call) is referenced, remove it

- [ ] **Step 9: Manual UI verification**

Start the dev server (`npm run dev`), open http://localhost:3000/map, and select a location.

Confirm in the PlacePanel:
- [ ] BrowserUse section shows "Scanning accessibility data…" pulse while loading
- [ ] Header shows "BrowserUse Insights" + BETA badge + "ADA Accessibility Checklist" + ⓘ icon
- [ ] Hovering the ⓘ shows the ADA tooltip
- [ ] Skeleton rows appear in a 2-column grid of 5 while loading
- [ ] After polling completes, `X / 10 items confirmed` count appears
- [ ] 10 checklist items render across two columns (5 + 5) with correct status icons and colors
- [ ] Clicking INFO on an item slides out the card beneath it with Explanation + Referenced Source
- [ ] Clicking INFO on a second item closes the first and opens the second
- [ ] Clicking an open INFO button closes it
- [ ] Items with a source show the quote and a clickable link
- [ ] Items without a source show the "No source found" fallback
- [ ] N/A items show the naReason text

- [ ] **Step 10: Commit**

```bash
git add components/map/place-panel.tsx
git commit -m "feat: replace grade section with ADA 10-item checklist and INFO slide-outs"
```
