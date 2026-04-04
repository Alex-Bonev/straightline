# Google Maps + Accessibility Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock map and dummy location data in `app/map/page.tsx` with real Google Maps, live nearby places via the Places API, location search with autocomplete, and Claude-powered accessibility grades.

**Architecture:** Three server-side API routes proxy calls to Google Places API and Anthropic Claude (keeping API keys server-only). A client-side Google Maps component uses `@vis.gl/react-google-maps`. The map page fetches nearby places on mount, searches via autocomplete as the user types, and scores each selected place lazily via Claude.

**Tech Stack:** `@vis.gl/react-google-maps`, `@anthropic-ai/sdk`, Google Places API (Nearby Search, Autocomplete, Details), Anthropic Claude claude-sonnet-4-6

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `.env` | Modify | Add `NEXT_PUBLIC_MAPS_KEY` (browser-safe copy of `MAPS_KEY`) |
| `app/api/places/nearby/route.ts` | Create | Proxy Google Places Nearby Search |
| `app/api/places/autocomplete/route.ts` | Create | Proxy Google Places Autocomplete |
| `app/api/places/details/route.ts` | Create | Proxy Google Places Details + fire Claude scoring |
| `app/api/score/route.ts` | Create | Claude accessibility scoring from place details + reviews |
| `components/map/google-map.tsx` | Create | Google Maps component with markers, pan/zoom control |
| `app/map/page.tsx` | Modify | Wire real APIs, real map, real search, real scoring |

---

### Task 1: Install dependencies and configure environment

**Files:**
- Modify: `.env`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install packages**

```bash
cd /Users/alexanderbonev/.superset/worktrees/straightline/google-maps
npm install @vis.gl/react-google-maps @anthropic-ai/sdk
```

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Add browser-safe map key to .env**

Append to `.env`:
```
NEXT_PUBLIC_MAPS_KEY=AIzaSyDjB8sxzf7I9L8jBXiMEgcTGXxPH-dOuck
```

(The `NEXT_PUBLIC_` prefix exposes this key to the browser bundle — required for the Maps JS SDK.)

- [ ] **Step 3: Verify packages installed**

```bash
node -e "require('@vis.gl/react-google-maps'); require('@anthropic-ai/sdk'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env
git commit -m "chore: add @vis.gl/react-google-maps and @anthropic-ai/sdk"
```

---

### Task 2: Places Nearby API route

**Files:**
- Create: `app/api/places/nearby/route.ts`

GET `/api/places/nearby?lat=32.88&lng=-117.23&radius=1500`

- [ ] **Step 1: Create the route**

```typescript
// app/api/places/nearby/route.ts
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const radius = searchParams.get('radius') ?? '1500'

  if (!lat || !lng) {
    return Response.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
  url.searchParams.set('location', `${lat},${lng}`)
  url.searchParams.set('radius', radius)
  url.searchParams.set('type', 'establishment')
  url.searchParams.set('key', process.env.MAPS_KEY!)

  const res = await fetch(url.toString())
  const data = await res.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return Response.json({ error: data.status }, { status: 502 })
  }

  const places = (data.results ?? []).slice(0, 20).map((p: any) => ({
    placeId: p.place_id,
    name: p.name,
    address: p.vicinity,
    location: p.geometry.location,
    rating: p.rating ?? null,
    userRatingsTotal: p.user_ratings_total ?? 0,
    types: p.types ?? [],
    openNow: p.opening_hours?.open_now ?? null,
  }))

  return Response.json({ places })
}
```

- [ ] **Step 2: Verify the route starts cleanly**

Start the dev server: `npm run dev`

Visit: `http://localhost:3000/api/places/nearby?lat=32.8801&lng=-117.2340&radius=1000`

Expected: JSON with a `places` array of real nearby places.

- [ ] **Step 3: Commit**

```bash
git add app/api/places/nearby/route.ts
git commit -m "feat: add Places nearby search API route"
```

---

### Task 3: Places Autocomplete API route

**Files:**
- Create: `app/api/places/autocomplete/route.ts`

GET `/api/places/autocomplete?query=library&lat=32.88&lng=-117.23`

- [ ] **Step 1: Create the route**

```typescript
// app/api/places/autocomplete/route.ts
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('query')
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!query) {
    return Response.json({ suggestions: [] })
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', query)
  url.searchParams.set('key', process.env.MAPS_KEY!)
  if (lat && lng) {
    url.searchParams.set('location', `${lat},${lng}`)
    url.searchParams.set('radius', '10000')
  }

  const res = await fetch(url.toString())
  const data = await res.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return Response.json({ suggestions: [] })
  }

  const suggestions = (data.predictions ?? []).slice(0, 6).map((p: any) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting.main_text,
    secondaryText: p.structured_formatting.secondary_text ?? '',
  }))

  return Response.json({ suggestions })
}
```

- [ ] **Step 2: Verify**

`http://localhost:3000/api/places/autocomplete?query=library&lat=32.8801&lng=-117.2340`

Expected: JSON with `suggestions` array including Geisel Library and other nearby libraries.

- [ ] **Step 3: Commit**

```bash
git add app/api/places/autocomplete/route.ts
git commit -m "feat: add Places autocomplete API route"
```

---

### Task 4: Place Details API route

**Files:**
- Create: `app/api/places/details/route.ts`

GET `/api/places/details?placeId=ChIJ...`

Returns full details including reviews, used as input for the score route.

- [ ] **Step 1: Create the route**

```typescript
// app/api/places/details/route.ts
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const placeId = searchParams.get('placeId')

  if (!placeId) {
    return Response.json({ error: 'placeId required' }, { status: 400 })
  }

  const fields = [
    'place_id',
    'name',
    'formatted_address',
    'geometry',
    'rating',
    'user_ratings_total',
    'reviews',
    'wheelchair_accessible_entrance',
    'types',
    'photos',
    'opening_hours',
    'website',
    'formatted_phone_number',
  ].join(',')

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', fields)
  url.searchParams.set('key', process.env.MAPS_KEY!)

  const res = await fetch(url.toString())
  const data = await res.json()

  if (data.status !== 'OK') {
    return Response.json({ error: data.status }, { status: 502 })
  }

  const r = data.result
  const detail = {
    placeId: r.place_id,
    name: r.name,
    address: r.formatted_address,
    location: r.geometry?.location,
    rating: r.rating ?? null,
    userRatingsTotal: r.user_ratings_total ?? 0,
    wheelchairAccessibleEntrance: r.wheelchair_accessible_entrance ?? null,
    types: r.types ?? [],
    openNow: r.opening_hours?.open_now ?? null,
    website: r.website ?? null,
    phone: r.formatted_phone_number ?? null,
    reviews: (r.reviews ?? []).slice(0, 5).map((rev: any) => ({
      author: rev.author_name,
      rating: rev.rating,
      text: rev.text,
      relativeTime: rev.relative_time_description,
    })),
    photoRef: r.photos?.[0]?.photo_reference ?? null,
  }

  return Response.json({ detail })
}
```

- [ ] **Step 2: Verify**

Get a real placeId from the nearby endpoint, then:

`http://localhost:3000/api/places/details?placeId=<id>`

Expected: JSON with `detail` containing reviews, wheelchair info, etc.

- [ ] **Step 3: Commit**

```bash
git add app/api/places/details/route.ts
git commit -m "feat: add Places details API route"
```

---

### Task 5: Claude accessibility scoring API route

**Files:**
- Create: `app/api/score/route.ts`

POST with `{ detail: PlaceDetail }` → returns `{ grade, tags, summary }`

- [ ] **Step 1: Create the route**

```typescript
// app/api/score/route.ts
import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const client = new Anthropic({ apiKey: process.env.CLAUDE_KEY })

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { detail } = body

  if (!detail) {
    return Response.json({ error: 'detail required' }, { status: 400 })
  }

  const reviewsText = detail.reviews.length > 0
    ? detail.reviews.map((r: any, i: number) =>
        `Review ${i + 1} (${r.rating}/5 stars, ${r.relativeTime}): ${r.text}`
      ).join('\n\n')
    : 'No reviews available.'

  const prompt = `You are an accessibility expert analyzing a public location for people with disabilities.

Location: ${detail.name}
Address: ${detail.address}
Google Rating: ${detail.rating ?? 'N/A'} (${detail.userRatingsTotal} reviews)
Location Types: ${detail.types.slice(0, 5).join(', ')}
Wheelchair Accessible Entrance (per Google): ${detail.wheelchairAccessibleEntrance === true ? 'Yes' : detail.wheelchairAccessibleEntrance === false ? 'No' : 'Unknown'}

Recent reviews:
${reviewsText}

Based on the above, provide an accessibility assessment. Look for mentions of: wheelchair ramps, elevators, accessible parking, ADA compliance, wide doorways, accessible restrooms, step-free access, hearing loops, braille signage, staff helpfulness for disabled visitors.

Respond with ONLY valid JSON in this exact format:
{
  "grade": "A",
  "tags": ["Wheelchair", "Elevator", "ADA", "Parking"],
  "summary": "One sentence summary of accessibility for disabled visitors."
}

Grade scale: A+ (exceptional), A (excellent), A- (very good), B+ (good), B (decent), B- (adequate), C+ (fair), C (limited), C- (poor), D (very poor), F (inaccessible/unknown).
Tags must only be from: Wheelchair, Elevator, ADA, Parking, Ramp, RestRoom, Braille, HearingLoop, StepFree.
Include only tags that are explicitly mentioned or strongly implied. Return 0-4 tags.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (message.content[0] as { type: string; text: string }).text.trim()

  // Extract JSON even if Claude adds surrounding text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return Response.json({ error: 'Failed to parse score' }, { status: 502 })
  }

  const score = JSON.parse(jsonMatch[0])
  return Response.json({ score })
}
```

- [ ] **Step 2: Verify**

```bash
curl -X POST http://localhost:3000/api/score \
  -H "Content-Type: application/json" \
  -d '{"detail":{"name":"Geisel Library","address":"9500 Gilman Dr, La Jolla, CA","rating":4.5,"userRatingsTotal":1200,"wheelchairAccessibleEntrance":true,"types":["library"],"reviews":[{"author":"Jane","rating":5,"text":"Great wheelchair access, elevators work well","relativeTime":"2 months ago"}]}}'
```

Expected: `{"score":{"grade":"A","tags":["Wheelchair","Elevator"],"summary":"..."}}`

- [ ] **Step 3: Commit**

```bash
git add app/api/score/route.ts
git commit -m "feat: add Claude accessibility scoring API route"
```

---

### Task 6: Google Maps component

**Files:**
- Create: `components/map/google-map.tsx`

A client component that renders the map, shows markers for places, and exposes a `focusPlace` function via a ref.

- [ ] **Step 1: Create the component**

```typescript
// components/map/google-map.tsx
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
  grade?: string
}

export interface GoogleMapHandle {
  focusPlace: (location: { lat: number; lng: number }) => void
}

interface GoogleMapProps {
  center: { lat: number; lng: number }
  places: MapPlace[]
  selectedPlaceId?: string | null
  onMarkerClick?: (placeId: string) => void
}

function gradeToColor(grade?: string): string {
  if (!grade) return '#1a73e8'
  const letter = grade[0].toUpperCase()
  if (letter === 'A') return '#1e8e3e'
  if (letter === 'B') return '#1a73e8'
  if (letter === 'C') return '#f9ab00'
  if (letter === 'D') return '#fa7b17'
  return '#d93025'
}

function MapController({
  center,
  selectedPlaceId,
  places,
  onMarkerClick,
}: GoogleMapProps) {
  const map = useMap()

  useEffect(() => {
    if (!map) return
    map.panTo(center)
    map.setZoom(15)
  }, [map, center])

  return (
    <>
      {places.map((place) => (
        <AdvancedMarker
          key={place.placeId}
          position={place.location}
          title={place.name}
          onClick={() => onMarkerClick?.(place.placeId)}
        >
          <Pin
            background={gradeToColor(place.grade)}
            borderColor={selectedPlaceId === place.placeId ? '#fff' : 'transparent'}
            glyphColor="#fff"
            scale={selectedPlaceId === place.placeId ? 1.4 : 1}
          />
        </AdvancedMarker>
      ))}
    </>
  )
}

const GoogleMapComponent = forwardRef<GoogleMapHandle, GoogleMapProps>(
  function GoogleMapComponent(props, ref) {
    const map = useMap()

    useImperativeHandle(ref, () => ({
      focusPlace(location) {
        if (map) {
          map.panTo(location)
          map.setZoom(17)
        }
      },
    }))

    return <MapController {...props} />
  }
)

export function GoogleMapView({
  apiKey,
  mapRef,
  ...props
}: GoogleMapProps & {
  apiKey: string
  mapRef?: React.Ref<GoogleMapHandle>
}) {
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        mapId="straightline-map"
        defaultCenter={props.center}
        defaultZoom={14}
        gestureHandling="greedy"
        disableDefaultUI={false}
        style={{ width: '100%', height: '100%' }}
      >
        <GoogleMapComponent ref={mapRef} {...props} />
      </Map>
    </APIProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/map/google-map.tsx
git commit -m "feat: add Google Maps component with grade-colored markers"
```

---

### Task 7: Update the map page with real data

**Files:**
- Modify: `app/map/page.tsx`

Replace mock data, add real APIs, search autocomplete, Claude scoring, and map focus on selection.

- [ ] **Step 1: Replace app/map/page.tsx entirely**

```typescript
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { animate, createScope, stagger } from 'animejs'
import { Nunito } from 'next/font/google'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Search,
  MapPin,
  Navigation,
  Accessibility,
  ArrowUpDown,
  ShieldCheck,
  Car,
  Layers,
  Locate,
  ChevronRight,
  Map,
  Loader2,
  Ramp,
  Bath,
  Volume2,
} from 'lucide-react'
import { GoogleMapView, type GoogleMapHandle, type MapPlace } from '@/components/map/google-map'

// ── Font ─────────────────────────────────────────────────────────────────────

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface Place {
  placeId: string
  name: string
  address: string
  location: { lat: number; lng: number }
  rating: number | null
  userRatingsTotal: number
  types: string[]
  openNow: boolean | null
  score?: {
    grade: string
    tags: string[]
    summary: string
  }
  scoring?: boolean
}

interface Suggestion {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

// ── Grade config ──────────────────────────────────────────────────────────────

function getGradeConfig(grade: string): { bg: string; border: string } {
  const letter = grade[0].toUpperCase()
  if (letter === 'A') return { bg: '#1e8e3e', border: '#1a7a37' }
  if (letter === 'B') return { bg: '#1a73e8', border: '#1557b0' }
  if (letter === 'C') return { bg: '#f9ab00', border: '#d6940a' }
  if (letter === 'D') return { bg: '#fa7b17', border: '#e06c0e' }
  return { bg: '#d93025', border: '#c5221f' }
}

// ── Tag icon map ──────────────────────────────────────────────────────────────

function tagIcon(tag: string) {
  switch (tag) {
    case 'Wheelchair': return <Accessibility size={10} />
    case 'Elevator':   return <ArrowUpDown size={10} />
    case 'ADA':        return <ShieldCheck size={10} />
    case 'Parking':    return <Car size={10} />
    case 'Ramp':       return <Ramp size={10} />
    case 'RestRoom':   return <Bath size={10} />
    case 'HearingLoop':return <Volume2 size={10} />
    default:           return <MapPin size={10} />
  }
}

// ── Location Card ─────────────────────────────────────────────────────────────

function LocationCard({
  place,
  selected,
  onClick,
}: {
  place: Place
  selected: boolean
  onClick: () => void
}) {
  const grade = place.score?.grade
  const gradeConfig = grade ? getGradeConfig(grade) : null

  return (
    <Card
      onClick={onClick}
      className={`location-card flex-row gap-0 overflow-hidden rounded-xl border-[#e8eaed] p-0 shadow-none transition-all duration-200 hover:border-[#c5cae9] hover:shadow-[0_3px_12px_rgba(0,0,0,0.1)] cursor-pointer group ${selected ? 'border-[#1a73e8] shadow-[0_3px_12px_rgba(26,115,232,0.18)]' : ''}`}
    >
      {/* Left color strip */}
      <div
        className="relative w-24 flex-shrink-0 overflow-hidden"
        style={{ backgroundColor: gradeConfig ? gradeConfig.bg + '18' : '#1a73e815' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: gradeConfig ? gradeConfig.bg + '25' : '#1a73e825' }}
          >
            <MapPin size={18} style={{ color: gradeConfig?.bg ?? '#1a73e8' }} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3.5">
        <h3
          className="truncate text-[13px] font-bold leading-tight transition-colors group-hover:text-[#1a73e8]"
          style={{ color: '#202124' }}
        >
          {place.name}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: '#5f6368' }}>
          <MapPin size={9} className="flex-shrink-0" />
          <span className="truncate">{place.address}</span>
        </p>
        {place.rating && (
          <p className="mt-0.5 text-[11px]" style={{ color: '#5f6368' }}>
            ★ {place.rating} · {place.userRatingsTotal.toLocaleString()} reviews
          </p>
        )}

        {/* Tags */}
        {place.score && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {place.score.tags.map((tag) => (
              <Badge
                key={tag}
                className="inline-flex h-auto items-center gap-1 rounded-full border-none px-2 py-1 text-[10px] font-semibold leading-none"
                style={{ backgroundColor: '#e8f0fe', color: '#1a73e8' }}
              >
                {tagIcon(tag)}
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Score summary */}
        {place.score?.summary && (
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: '#5f6368' }}>
            {place.score.summary}
          </p>
        )}
      </div>

      {/* Grade badge */}
      <div
        className="flex w-[52px] flex-shrink-0 flex-col items-center justify-center gap-1"
        style={
          gradeConfig
            ? { backgroundColor: gradeConfig.bg, borderLeft: `1px solid ${gradeConfig.border}` }
            : { backgroundColor: '#f1f3f4', borderLeft: '1px solid #e8eaed' }
        }
      >
        {place.scoring ? (
          <Loader2
            size={16}
            className="animate-spin"
            style={{ color: gradeConfig?.bg ?? '#9aa0a6' }}
          />
        ) : grade ? (
          <>
            <span className="text-[16px] font-black leading-none tracking-tight text-white">
              {grade}
            </span>
            <span className="text-[7px] font-bold uppercase tracking-widest text-white/70">
              score
            </span>
          </>
        ) : (
          <span className="text-[11px] font-semibold" style={{ color: '#9aa0a6' }}>—</span>
        )}
      </div>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const MAPS_KEY = process.env.NEXT_PUBLIC_MAPS_KEY ?? ''

export default function MapPage() {
  const sidebarRef    = useRef<HTMLDivElement>(null)
  const scopeRef      = useRef<{ revert: () => void } | null>(null)
  const mapHandleRef  = useRef<GoogleMapHandle>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [mapCenter, setMapCenter]       = useState<{ lat: number; lng: number }>({ lat: 32.8801, lng: -117.2340 })
  const [places, setPlaces]             = useState<Place[]>([])
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)

  const [query, setQuery]               = useState('')
  const [suggestions, setSuggestions]   = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  // ── Intro animation ──────────────────────────────────────────────────────

  useEffect(() => {
    scopeRef.current = createScope({ root: sidebarRef }).add(() => {
      animate('.sidebar-header', { translateX: [-28, 0], opacity: [0, 1], duration: 650, ease: 'outExpo' })
      animate('.search-section',  { translateX: [-28, 0], opacity: [0, 1], duration: 650, delay: 80,  ease: 'outExpo' })
      animate('.nearby-header',   { translateX: [-22, 0], opacity: [0, 1], duration: 550, delay: 180, ease: 'outExpo' })
    })
    return () => scopeRef.current?.revert()
  }, [])

  // ── Geolocation + nearby fetch ───────────────────────────────────────────

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const loc = { lat: coords.latitude, lng: coords.longitude }
        setUserLocation(loc)
        setMapCenter(loc)
        fetchNearby(loc)
      },
      () => {
        // Fallback: UCSD campus
        const fallback = { lat: 32.8801, lng: -117.2340 }
        setMapCenter(fallback)
        fetchNearby(fallback)
      }
    )
  }, [])

  const fetchNearby = useCallback(async (loc: { lat: number; lng: number }) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/places/nearby?lat=${loc.lat}&lng=${loc.lng}&radius=1500`)
      const data = await res.json()
      const raw: Place[] = (data.places ?? []).map((p: any) => ({
        placeId:          p.placeId,
        name:             p.name,
        address:          p.address,
        location:         p.location,
        rating:           p.rating,
        userRatingsTotal: p.userRatingsTotal,
        types:            p.types,
        openNow:          p.openNow,
      }))
      setPlaces(raw)

      // Animate cards in
      setTimeout(() => {
        animate('.location-card', {
          translateX: [-30, 0],
          opacity:    [0, 1],
          delay:      stagger(60, { start: 0 }),
          duration:   450,
          ease:       'outExpo',
        })
      }, 50)

      // Score top 5 lazily
      raw.slice(0, 5).forEach((p) => scorePlace(p.placeId))
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Scoring ──────────────────────────────────────────────────────────────

  const scorePlace = useCallback(async (placeId: string) => {
    setPlaces((prev) =>
      prev.map((p) => p.placeId === placeId ? { ...p, scoring: true } : p)
    )
    try {
      const detailRes  = await fetch(`/api/places/details?placeId=${placeId}`)
      const detailData = await detailRes.json()
      if (!detailData.detail) return

      const scoreRes  = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detail: detailData.detail }),
      })
      const scoreData = await scoreRes.json()

      setPlaces((prev) =>
        prev.map((p) =>
          p.placeId === placeId
            ? { ...p, scoring: false, score: scoreData.score }
            : p
        )
      )
    } catch {
      setPlaces((prev) =>
        prev.map((p) => p.placeId === placeId ? { ...p, scoring: false } : p)
      )
    }
  }, [])

  // ── Select a place ────────────────────────────────────────────────────────

  const selectPlace = useCallback((place: Place) => {
    setSelectedId(place.placeId)
    setMapCenter(place.location)
    mapHandleRef.current?.focusPlace(place.location)
    if (!place.score && !place.scoring) {
      scorePlace(place.placeId)
    }
  }, [scorePlace])

  // ── Search / Autocomplete ─────────────────────────────────────────────────

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)

    if (!value.trim()) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    searchTimeout.current = setTimeout(async () => {
      const loc = userLocation ?? mapCenter
      const res  = await fetch(
        `/api/places/autocomplete?query=${encodeURIComponent(value)}&lat=${loc.lat}&lng=${loc.lng}`
      )
      const data = await res.json()
      setSuggestions(data.suggestions ?? [])
      setShowSuggestions(true)
    }, 300)
  }

  const handleSuggestionSelect = async (suggestion: Suggestion) => {
    setQuery(suggestion.mainText)
    setShowSuggestions(false)
    setSuggestions([])

    // Fetch full details for this place
    const detailRes  = await fetch(`/api/places/details?placeId=${suggestion.placeId}`)
    const detailData = await detailRes.json()
    if (!detailData.detail) return

    const d = detailData.detail
    const place: Place = {
      placeId:          d.placeId,
      name:             d.name,
      address:          d.address,
      location:         d.location,
      rating:           d.rating,
      userRatingsTotal: d.userRatingsTotal,
      types:            d.types,
      openNow:          d.openNow,
    }

    setPlaces((prev) => {
      const exists = prev.find((p) => p.placeId === place.placeId)
      if (exists) return prev
      return [place, ...prev]
    })
    selectPlace(place)
  }

  // ── Locate me ─────────────────────────────────────────────────────────────

  const handleLocateMe = () => {
    if (userLocation) {
      setMapCenter({ ...userLocation })
      mapHandleRef.current?.focusPlace(userLocation)
    }
  }

  const mapPlaces: MapPlace[] = places.map((p) => ({
    placeId:  p.placeId,
    name:     p.name,
    location: p.location,
    grade:    p.score?.grade,
  }))

  return (
    <div className={`${nunito.className} flex h-screen overflow-hidden bg-[#f1f3f4]`}>

      {/* ══════════════════════ Left Sidebar ══════════════════════ */}
      <aside
        ref={sidebarRef}
        className="flex w-[420px] flex-shrink-0 flex-col overflow-hidden bg-white"
        style={{ boxShadow: '2px 0 10px rgba(0,0,0,0.07)', zIndex: 10 }}
      >

        {/* Header */}
        <div
          className="sidebar-header flex items-center gap-3.5 px-5 py-4 opacity-0"
          style={{ borderBottom: '1px solid #e8eaed' }}
        >
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: '#1a73e8' }}
          >
            <Navigation size={15} className="text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-extrabold leading-none tracking-tight" style={{ color: '#202124' }}>
              Straightline
            </h1>
            <p className="mt-1 text-[11px] font-medium" style={{ color: '#5f6368' }}>
              Accessibility Navigation
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="search-section relative px-4 py-4 opacity-0" style={{ borderBottom: '1px solid #e8eaed' }}>
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#9aa0a6' }} />
            <Input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search accessible locations..."
              className="h-10 rounded-full border-transparent pl-10 text-[13px] placeholder:text-[#9aa0a6] focus-visible:ring-0"
              style={{ backgroundColor: '#f1f3f4', color: '#202124' }}
            />
          </div>

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              className="absolute left-4 right-4 top-[calc(100%-8px)] z-20 overflow-hidden rounded-xl border border-[#e8eaed] bg-white shadow-lg"
            >
              {suggestions.map((s) => (
                <button
                  key={s.placeId}
                  onMouseDown={() => handleSuggestionSelect(s)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#f1f3f4] transition-colors"
                >
                  <MapPin size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#9aa0a6' }} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold" style={{ color: '#202124' }}>
                      {s.mainText}
                    </p>
                    <p className="truncate text-[11px]" style={{ color: '#5f6368' }}>
                      {s.secondaryText}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nearby list */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="nearby-header flex items-center justify-between px-5 pb-3 pt-4 opacity-0">
            <div className="flex items-center gap-2">
              <Layers size={13} style={{ color: '#1a73e8' }} />
              <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#202124' }}>
                {query ? 'Search Results' : 'Nearby Locations'}
              </h2>
            </div>
            <Badge
              className="h-auto rounded-full border-none px-2.5 py-1 text-[10px] font-bold"
              style={{ backgroundColor: '#e8f0fe', color: '#1a73e8' }}
            >
              {places.length} found
            </Badge>
          </div>

          <Separator className="mx-5 w-auto" style={{ width: 'calc(100% - 2.5rem)' }} />

          <ScrollArea className="flex-1 px-4 pt-3 pb-4">
            {loading ? (
              <div className="flex flex-col gap-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {places.map((place) => (
                  <LocationCard
                    key={place.placeId}
                    place={place}
                    selected={selectedId === place.placeId}
                    onClick={() => selectPlace(place)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </aside>

      {/* ══════════════════════ Map Area ══════════════════════ */}
      <main className="relative flex-1 overflow-hidden">
        <GoogleMapView
          apiKey={MAPS_KEY}
          mapRef={mapHandleRef}
          center={mapCenter}
          places={mapPlaces}
          selectedPlaceId={selectedId}
          onMarkerClick={(placeId) => {
            const place = places.find((p) => p.placeId === placeId)
            if (place) selectPlace(place)
          }}
        />

        {/* Locate me */}
        <Button
          variant="outline"
          size="icon"
          onClick={handleLocateMe}
          className="absolute bottom-10 right-4 rounded-full border-[#dadce0] bg-white hover:bg-[#f1f3f4]"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.14)' }}
          aria-label="Center on my location"
        >
          <Locate size={18} style={{ color: '#1a73e8' }} />
        </Button>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Fix icon imports** — Lucide v1.x may not have `Ramp` or `Bath`. Replace with available icons:

In `app/map/page.tsx`, replace the imports:
```typescript
import {
  Search, MapPin, Navigation, Accessibility, ArrowUpDown, ShieldCheck,
  Car, Layers, Locate, ChevronRight, Map, Loader2,
} from 'lucide-react'
```

And in `tagIcon`:
```typescript
function tagIcon(tag: string) {
  switch (tag) {
    case 'Wheelchair':  return <Accessibility size={10} />
    case 'Elevator':    return <ArrowUpDown size={10} />
    case 'ADA':         return <ShieldCheck size={10} />
    case 'Parking':     return <Car size={10} />
    default:            return <MapPin size={10} />
  }
}
```

- [ ] **Step 3: Start dev server and verify**

```bash
npm run dev
```

Open `http://localhost:3000/map`

Verify:
- Google Maps renders on the right side
- Browser asks for geolocation permission
- Nearby places load in the sidebar
- Typing in the search bar shows autocomplete suggestions
- Clicking a suggestion zooms the map to that location
- Accessibility scores load (with spinner then grade badge)
- Clicking a location card zooms the map to it

- [ ] **Step 4: Commit**

```bash
git add app/map/page.tsx components/map/google-map.tsx
git commit -m "feat: wire Google Maps, Places API, and Claude accessibility scoring"
```

---

### Task 8: Fix @vis.gl/react-google-maps forwardRef pattern

The `useImperativeHandle` inside a component that also renders JSX won't work as written — the `GoogleMapComponent` inner component needs the map hook but the `forwardRef` wrapper renders the `Map` container. Restructure so the ref lives inside the `APIProvider` context.

**Files:**
- Modify: `components/map/google-map.tsx`

- [ ] **Step 1: Restructure the component**

```typescript
// components/map/google-map.tsx
'use client'

import { useEffect, useImperativeHandle, forwardRef, useRef } from 'react'
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
  grade?: string
}

export interface GoogleMapHandle {
  focusPlace: (location: { lat: number; lng: number }) => void
}

interface Props {
  center: { lat: number; lng: number }
  places: MapPlace[]
  selectedPlaceId?: string | null
  onMarkerClick?: (placeId: string) => void
}

function gradeToColor(grade?: string): string {
  if (!grade) return '#1a73e8'
  const letter = grade[0].toUpperCase()
  if (letter === 'A') return '#1e8e3e'
  if (letter === 'B') return '#1a73e8'
  if (letter === 'C') return '#f9ab00'
  if (letter === 'D') return '#fa7b17'
  return '#d93025'
}

// Inner component — has access to the map instance via useMap()
const MapInner = forwardRef<GoogleMapHandle, Props>(function MapInner(
  { center, places, selectedPlaceId, onMarkerClick },
  ref
) {
  const map = useMap()

  useImperativeHandle(ref, () => ({
    focusPlace(location) {
      if (map) {
        map.panTo(location)
        map.setZoom(17)
      }
    },
  }), [map])

  useEffect(() => {
    if (!map) return
    map.panTo(center)
  }, [map, center])

  return (
    <>
      {places.map((place) => (
        <AdvancedMarker
          key={place.placeId}
          position={place.location}
          title={place.name}
          onClick={() => onMarkerClick?.(place.placeId)}
        >
          <Pin
            background={gradeToColor(place.grade)}
            borderColor={selectedPlaceId === place.placeId ? '#fff' : 'transparent'}
            glyphColor="#fff"
            scale={selectedPlaceId === place.placeId ? 1.4 : 1}
          />
        </AdvancedMarker>
      ))}
    </>
  )
})

// Outer component — wraps APIProvider + Map, passes ref into MapInner
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
      >
        <MapInner ref={mapRef} {...props} />
      </Map>
    </APIProvider>
  )
}
```

- [ ] **Step 2: Verify map focus works**

In the browser: click a location card and confirm the map pans + zooms to that location.

- [ ] **Step 3: Commit**

```bash
git add components/map/google-map.tsx
git commit -m "fix: correct forwardRef pattern for map focus handle"
```
