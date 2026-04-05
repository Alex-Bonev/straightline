import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

const BROWSER_USE_BASE = 'https://api.browser-use.com/api/v3'
const claude = new Anthropic({ apiKey: process.env.CLAUDE_KEY })

function buHeaders() {
  return {
    'X-Browser-Use-API-Key': process.env.BROWSER_USE_KEY ?? '',
    'Content-Type': 'application/json',
  }
}

// ── Coordinate math ──────────────────────────────────────────────────────────

function projectPoint(lat: number, lng: number, bearingDeg: number, distanceM: number) {
  const R = 6371000
  const bearingRad = (bearingDeg * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  const angularDist = distanceM / R

  const newLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDist) +
    Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearingRad)
  )
  const newLng = lngRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(angularDist) * Math.cos(latRad),
    Math.cos(angularDist) - Math.sin(latRad) * Math.sin(newLat)
  )

  return { lat: (newLat * 180) / Math.PI, lng: (newLng * 180) / Math.PI }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface VisionFeature {
  type: 'entrance' | 'ramp' | 'stairs'
  position: number // -1.0 to 1.0 horizontal
  confidence: 'high' | 'medium' | 'low'
  description: string
}

interface PlacedFeature {
  lat: number
  lng: number
  label: string
  note: string
  confidence: string
}

const LABEL_MAP: Record<string, string> = {
  entrance: 'accessible_entrance',
  ramp: 'ramp',
  stairs: 'hazard',
}

// ── POST /api/annotations/auto ───────────────────────────────────────────────
// Body: { placeId, lat, lng, name, address }
// Checks for cached ADA checklist, starts BrowserUse Street View session.

export async function POST(request: NextRequest) {
  const { placeId, lat, lng, name, address } = await request.json()

  if (!placeId || !lat || !lng || !name || !address) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!process.env.BROWSER_USE_KEY) {
    return Response.json({ error: 'BROWSER_USE_KEY not set' }, { status: 500 })
  }

  // Check for cached ADA checklist
  const { data: loc } = await supabase
    .from('locations')
    .select('browser_use')
    .eq('name', name)
    .maybeSingle()

  if (!loc?.browser_use?.checklist) {
    return Response.json({ error: 'no_checklist' }, { status: 400 })
  }

  // Extract which features the checklist found
  const checklist = loc.browser_use.checklist as { id: number; status: string }[]
  const features: string[] = []
  const item2 = checklist.find(i => i.id === 2) // Accessible Entrance
  if (item2 && (item2.status === 'met' || item2.status === 'unknown')) features.push('accessible entrances')
  const item4 = checklist.find(i => i.id === 4) // Ramp Availability
  if (item4 && (item4.status === 'met' || item4.status === 'unknown')) features.push('ramps')
  const item1 = checklist.find(i => i.id === 1) // Accessible Route (stairs implied if not met)
  if (item1 && item1.status === 'not_met') features.push('stairs or steps (barriers)')
  // Always look for entrances even if not in checklist
  if (!features.includes('accessible entrances')) features.push('entrances')
  // Always look for stairs as potential hazards
  if (!features.includes('stairs or steps (barriers)')) features.push('stairs or steps')

  const featureList = features.join(', ')

  const task = `Navigate to Google Street View for "${name}" located at "${address}" (coordinates: ${lat}, ${lng}).

Steps:
1. Go to google.com/maps and search for "${address}"
2. Enter Street View mode — look for the Street View thumbnail or drag the pegman onto the street
3. Position yourself on the street as close to the building "${name}" as possible
4. Take a screenshot facing the building
5. Note the compass heading shown in the Street View interface
6. Rotate the camera approximately 90 degrees clockwise
7. Take another screenshot and note the heading
8. Rotate approximately 90 degrees clockwise again
9. Take another screenshot and note the heading
10. Rotate approximately 90 degrees clockwise one more time
11. Take the final screenshot and note the heading

After completing all screenshots, return a summary in this exact format:
SCREENSHOTS_COMPLETE
Heading 1: [degrees]
Heading 2: [degrees]
Heading 3: [degrees]
Heading 4: [degrees]
Camera position: [lat], [lng] (read from the Street View UI or estimate from your position)

The building is known to have: ${featureList}. Make sure to capture views that show the building's entrances and ground-level features.`

  try {
    const res = await fetch(`${BROWSER_USE_BASE}/sessions`, {
      method: 'POST',
      headers: buHeaders(),
      body: JSON.stringify({ task }),
    })

    if (res.status === 429) {
      return Response.json({ error: 'rate_limited' }, { status: 429 })
    }

    if (!res.ok) {
      const text = await res.text()
      console.error('[auto-annotate] BrowserUse start failed:', res.status, text)
      return Response.json({ error: 'BrowserUse API error' }, { status: 502 })
    }

    const data = await res.json()
    console.log('[auto-annotate] session started:', data.id, 'for:', name)
    return Response.json({ taskId: data.id })
  } catch (e) {
    console.error('[auto-annotate] POST fetch error:', e)
    return Response.json({ error: 'Network error' }, { status: 502 })
  }
}

// ── GET /api/annotations/auto ────────────────────────────────────────────────
// Query: ?taskId=xxx&placeId=xxx&lat=xxx&lng=xxx&name=xxx
// Polls BrowserUse, then runs Claude Vision analysis and creates annotations.

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const taskId = sp.get('taskId')
  const placeId = sp.get('placeId')
  const lat = parseFloat(sp.get('lat') ?? '0')
  const lng = parseFloat(sp.get('lng') ?? '0')
  const name = sp.get('name') ?? ''

  if (!taskId || !placeId) {
    return Response.json({ error: 'Missing taskId or placeId' }, { status: 400 })
  }

  if (!process.env.BROWSER_USE_KEY) {
    return Response.json({ error: 'BROWSER_USE_KEY not set' }, { status: 500 })
  }

  // ── Poll BrowserUse session ──────────────────────────────────────────────
  let buData: any
  try {
    const res = await fetch(`${BROWSER_USE_BASE}/sessions/${taskId}`, {
      headers: buHeaders(),
    })
    if (!res.ok) {
      console.error('[auto-annotate] poll failed:', res.status)
      return Response.json({ status: 'error', message: 'Failed to poll BrowserUse session' })
    }
    buData = await res.json()
  } catch (e) {
    console.error('[auto-annotate] poll fetch error:', e)
    return Response.json({ status: 'error', message: 'Network error polling BrowserUse' })
  }

  const running = buData.status === 'created' || buData.status === 'running'
  if (running) {
    return Response.json({ status: 'loading', step: 'street_view' })
  }

  if (buData.status === 'timed_out' || buData.status === 'error' || !buData.output) {
    console.error('[auto-annotate] BrowserUse terminal failure:', buData.status)
    return Response.json({ status: 'error', message: 'BrowserUse session failed — Street View may not be available for this location' })
  }

  // ── Extract headings from BrowserUse output ──────────────────────────────
  const output = typeof buData.output === 'string' ? buData.output : JSON.stringify(buData.output)
  console.log('[auto-annotate] BrowserUse output length:', output.length)

  // Parse headings from the structured output
  const headingMatches = output.matchAll(/[Hh]eading\s*\d*\s*:\s*([\d.]+)/g)
  const headings: number[] = []
  for (const m of headingMatches) {
    headings.push(parseFloat(m[1]))
  }

  // Parse camera position if reported
  const camPosMatch = output.match(/[Cc]amera\s*position\s*:\s*([-\d.]+)\s*,\s*([-\d.]+)/)
  const camLat = camPosMatch ? parseFloat(camPosMatch[1]) : lat
  const camLng = camPosMatch ? parseFloat(camPosMatch[2]) : lng

  // If no headings found, use defaults (0, 90, 180, 270)
  if (headings.length === 0) {
    headings.push(0, 90, 180, 270)
    console.log('[auto-annotate] No headings parsed, using defaults')
  }

  console.log('[auto-annotate] Parsed headings:', headings, 'Camera:', camLat, camLng)

  // ── Extract screenshots from BrowserUse steps ────────────────────────────
  const screenshots: { base64: string; heading: number }[] = []
  const steps = buData.steps ?? []
  let headingIdx = 0
  for (const step of steps) {
    if (step.screenshot && headingIdx < headings.length) {
      screenshots.push({
        base64: step.screenshot,
        heading: headings[headingIdx],
      })
      headingIdx++
    }
  }

  if (screenshots.length === 0) {
    console.error('[auto-annotate] No screenshots found in BrowserUse output')
    return Response.json({ status: 'error', message: 'BrowserUse captured no screenshots' })
  }

  console.log('[auto-annotate] Processing', screenshots.length, 'screenshots')

  // ── Fetch ADA checklist for context ──────────────────────────────────────
  const { data: loc } = await supabase
    .from('locations')
    .select('browser_use')
    .eq('name', name)
    .maybeSingle()

  const checklist = loc?.browser_use?.checklist as { id: number; status: string }[] | undefined
  const featureHints: string[] = []
  if (checklist) {
    const item1 = checklist.find(i => i.id === 1)
    if (item1?.status === 'not_met') featureHints.push('stairs or steps blocking the accessible route')
    const item2 = checklist.find(i => i.id === 2)
    if (item2?.status === 'met') featureHints.push('an accessible entrance')
    if (item2?.status === 'not_met') featureHints.push('entrance that is NOT step-free')
    const item4 = checklist.find(i => i.id === 4)
    if (item4?.status === 'met') featureHints.push('a ramp')
  }
  const hintText = featureHints.length > 0
    ? `Based on an ADA compliance audit, this building has: ${featureHints.join(', ')}.`
    : 'No prior accessibility data is available.'

  // ── Claude Vision analysis per screenshot ────────────────────────────────
  const allFeatures: PlacedFeature[] = []

  for (const shot of screenshots) {
    try {
      const msg = await claude.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: shot.base64,
                },
              },
              {
                type: 'text',
                text: `This is a Google Street View screenshot facing heading ${shot.heading}° from approximately (${camLat}, ${camLng}).
The building "${name}" should be visible in this image.

${hintText}

Identify any of these accessibility features you can see in the image:
- entrance (any building entrance/door)
- ramp (wheelchair ramp or sloped access)
- stairs (steps, staircases — these are hazards for wheelchair users)

For each feature you can identify, report:
1. type: "entrance" | "ramp" | "stairs"
2. position: a number from -1.0 (far left of image) to 1.0 (far right of image)
3. confidence: "high" | "medium" | "low"
4. description: brief note about what you see (e.g. "Main glass entrance with double doors")

Return ONLY a JSON array. If you see no relevant features, return [].
Do NOT guess — only report features you can actually see in the image.
Ignore the browser UI elements (address bar, navigation controls) — focus on the Street View imagery.

Example: [{"type":"entrance","position":0.2,"confidence":"high","description":"Main glass entrance with automatic doors"}]`,
              },
            ],
          },
        ],
      })

      const text = (msg.content[0] as { type: string; text: string }).text
      const arrMatch = text.match(/\[[\s\S]*\]/)
      if (!arrMatch) continue

      const features: VisionFeature[] = JSON.parse(arrMatch[0])
      for (const f of features) {
        const bearing = shot.heading + f.position * 45
        const projected = projectPoint(camLat, camLng, bearing, 12)
        allFeatures.push({
          lat: projected.lat,
          lng: projected.lng,
          label: LABEL_MAP[f.type] ?? 'other',
          note: `Auto-detected: ${f.description} (${f.confidence} confidence)`,
          confidence: f.confidence,
        })
      }
    } catch (e) {
      console.error('[auto-annotate] Vision analysis failed for heading', shot.heading, e)
      // Continue with other screenshots
    }
  }

  if (allFeatures.length === 0) {
    return Response.json({ status: 'done', annotations: [] })
  }

  // ── Deduplicate features within ~10m ─────────────────────────────────────
  const deduped: PlacedFeature[] = []
  const DEDUP_THRESHOLD_M = 10
  const confidenceRank = { high: 3, medium: 2, low: 1 }

  for (const f of allFeatures) {
    const nearby = deduped.find(d => {
      if (d.label !== f.label) return false
      const dlat = (d.lat - f.lat) * 111320
      const dlng = (d.lng - f.lng) * 111320 * Math.cos((f.lat * Math.PI) / 180)
      return Math.sqrt(dlat * dlat + dlng * dlng) < DEDUP_THRESHOLD_M
    })
    if (nearby) {
      // Keep higher confidence
      const fRank = confidenceRank[f.confidence as keyof typeof confidenceRank] ?? 0
      const nRank = confidenceRank[nearby.confidence as keyof typeof confidenceRank] ?? 0
      if (fRank > nRank) {
        nearby.lat = f.lat
        nearby.lng = f.lng
        nearby.note = f.note
        nearby.confidence = f.confidence
      }
    } else {
      deduped.push({ ...f })
    }
  }

  console.log('[auto-annotate] Features:', allFeatures.length, '→ deduped:', deduped.length)

  // ── Create annotations ───────────────────────────────────────────────────
  const created: any[] = []
  for (const f of deduped) {
    const { data, error } = await supabase
      .from('annotations')
      .insert({
        place_id: placeId,
        position: { lat: f.lat, lng: f.lng, altitude: 0 },
        note: f.note,
        label: f.label,
      })
      .select('id, place_id, position, note, label, created_at')
      .single()

    if (error) {
      console.error('[auto-annotate] insert failed:', error.message)
      continue
    }

    created.push({
      id: data.id,
      placeId: data.place_id,
      position: data.position,
      note: data.note,
      label: data.label,
      createdAt: data.created_at,
    })
  }

  console.log('[auto-annotate] Created', created.length, 'annotations for', name)
  return Response.json({ status: 'done', annotations: created })
}
