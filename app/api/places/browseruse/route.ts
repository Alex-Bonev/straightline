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

type ChecklistItemStatus = 'met' | 'not_met' | 'unknown' | 'na'

interface ChecklistItem {
  id: number
  status: ChecklistItemStatus
  sourceUrl: string | null
  sourceLabel: string | null
  sourceQuote: string | null
  naReason: string | null
}

// ── Output schema for BrowserUse structured output ──────────────────────────
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    checklist: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          status: { type: 'string', enum: ['met', 'not_met', 'unknown', 'na'] },
          sourceUrl: { type: ['string', 'null'] },
          sourceLabel: { type: ['string', 'null'] },
          sourceQuote: { type: ['string', 'null'] },
          naReason: { type: ['string', 'null'] },
        },
        required: ['id', 'status'],
      },
      minItems: 10,
      maxItems: 10,
    },
  },
  required: ['checklist'],
}

// ── Visual agent prompt (photos only) ───────────────────────────────────────
function makeVisualTask(name: string, address: string): string {
  return `Assess ADA accessibility of "${name}" at "${address}" using ONLY photos. Budget: 8 browser actions max.

ONLY visit Google Maps. Do NOT visit any other website.

Step 1: Search Google Maps for "${name} ${address}". Open the listing.
Step 2: Open the Photos tab. Look at EXACTLY 4 photos — pick entrance/exterior shots. STOP after 4.
  - Look for: ramps or curb cuts (items 1,4), step-free entrance or auto doors (items 2,3), accessible parking signs (item 5), elevator doors (item 6), wide corridors (item 8), ISA wheelchair symbols (item 10).
Step 3: Output the JSON checklist immediately.

Items: 1. Accessible Route 2. Accessible Entrance 3. Door Width & Type 4. Ramp Availability 5. Accessible Parking 6. Elevator / Lift 7. Accessible Restroom 8. Interior Pathway Width 9. Service Counter Height 10. Accessible Signage

Status: "met"=visible in photo. "not_met"=clearly absent/blocked. "unknown"=can't tell from photos (USE THIS for most items — photos rarely show restrooms, counters, etc). "na"=structurally impossible.
sourceLabel: "Google Maps Photos". sourceQuote: briefly describe what you see.
For items you can't assess from photos, use "unknown" with null source fields.`
}

// ── Text agent: direct Google Places API call (instant, no BrowserUse) ──────

interface PlacesApiResult {
  checklist: ChecklistItem[]
  reviews: { author: string; text: string; rating: number }[]
}

async function getTextChecklist(placeId: string, name: string): Promise<PlacesApiResult> {
  const apiKey = process.env.MAPS_KEY
  const checklist: ChecklistItem[] = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    status: 'unknown' as ChecklistItemStatus,
    sourceUrl: null,
    sourceLabel: null,
    sourceQuote: null,
    naReason: null,
  }))

  if (!apiKey) {
    console.warn('[browseruse] MAPS_KEY not set — text agent skipped')
    return { checklist, reviews: [] }
  }

  // Fetch place details with accessibility options and reviews
  const fields = [
    'accessibilityOptions',
    'reviews',
  ].join(',')

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&key=${apiKey}`,
      { headers: { 'X-Goog-FieldMask': fields } }
    )

    if (!res.ok) {
      // Fallback to legacy API
      console.warn('[browseruse] Places v1 failed, trying legacy API')
      return await getTextChecklistLegacy(placeId, apiKey, checklist)
    }

    const data = await res.json()
    const acc = data.accessibilityOptions

    if (acc) {
      // Wheelchair accessible entrance → items 1,2,3,4
      if (acc.wheelchairAccessibleEntrance === true) {
        for (const id of [1, 2, 3, 4]) {
          checklist[id - 1] = { id, status: 'met', sourceUrl: null, sourceLabel: 'Google Maps', sourceQuote: 'Wheelchair accessible entrance confirmed', naReason: null }
        }
      }
      // Wheelchair accessible parking → item 5
      if (acc.wheelchairAccessibleParking === true) {
        checklist[4] = { id: 5, status: 'met', sourceUrl: null, sourceLabel: 'Google Maps', sourceQuote: 'Wheelchair accessible parking confirmed', naReason: null }
      }
      // Wheelchair accessible restroom → item 7
      if (acc.wheelchairAccessibleRestroom === true) {
        checklist[6] = { id: 7, status: 'met', sourceUrl: null, sourceLabel: 'Google Maps', sourceQuote: 'Wheelchair accessible restroom confirmed', naReason: null }
      }
      // Wheelchair accessible seating → helps confirm item 9 (service counter)
      if (acc.wheelchairAccessibleSeating === true) {
        checklist[8] = { id: 9, status: 'met', sourceUrl: null, sourceLabel: 'Google Maps', sourceQuote: 'Wheelchair accessible seating confirmed', naReason: null }
      }
      console.log(`[browseruse] ✓ text agent (API) — ${checklist.filter(i => i.status === 'met').length} items met from attributes`)
    } else {
      console.log('[browseruse] text agent (API) — no accessibility attributes found')
    }

    // Parse reviews for additional accessibility clues
    const reviews = (data.reviews ?? []).slice(0, 5).map((r: { authorAttribution?: { displayName: string }; rating: number; text?: { text: string } }) => ({
      author: r.authorAttribution?.displayName ?? 'Anonymous',
      text: r.text?.text ?? '',
      rating: r.rating,
    }))

    await enrichFromReviews(checklist, reviews, name)

    return { checklist, reviews }
  } catch (e) {
    console.error('[browseruse] Places API error:', e)
    return { checklist, reviews: [] }
  }
}

async function getTextChecklistLegacy(
  placeId: string,
  apiKey: string,
  checklist: ChecklistItem[],
): Promise<PlacesApiResult> {
  const fields = 'wheelchair_accessible_entrance,reviews'
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`

  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.status !== 'OK') {
      console.warn('[browseruse] legacy Places API status:', data.status)
      return { checklist, reviews: [] }
    }

    const r = data.result
    if (r.wheelchair_accessible_entrance === true) {
      for (const id of [1, 2, 3, 4]) {
        checklist[id - 1] = { id, status: 'met', sourceUrl: null, sourceLabel: 'Google Maps', sourceQuote: 'Wheelchair accessible entrance confirmed', naReason: null }
      }
      console.log('[browseruse] ✓ text agent (legacy API) — entrance accessible')
    }

    const reviews = (r.reviews ?? []).slice(0, 5).map((rev: { author_name: string; text: string; rating: number }) => ({
      author: rev.author_name,
      text: rev.text,
      rating: rev.rating,
    }))

    await enrichFromReviews(checklist, reviews, '')

    return { checklist, reviews }
  } catch (e) {
    console.error('[browseruse] legacy API error:', e)
    return { checklist, reviews: [] }
  }
}

// ── Use Claude Haiku to extract accessibility clues from reviews ─────────────

async function enrichFromReviews(
  checklist: ChecklistItem[],
  reviews: { author: string; text: string; rating: number }[],
  name: string,
) {
  if (reviews.length === 0) return

  const reviewTexts = reviews.map((r, i) => `Review ${i + 1} (${r.rating}★): ${r.text}`).join('\n')
  const accessKeywords = /wheelchair|accessible|disability|ramp|elevator|lift|restroom|handicap|ada|stairs|step|narrow|wide|parking/i
  const hasRelevantReviews = reviews.some(r => accessKeywords.test(r.text))

  if (!hasRelevantReviews) {
    console.log('[browseruse] no accessibility-related reviews found')
    return
  }

  try {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `From these reviews of "${name}", extract accessibility evidence for these items ONLY if explicitly mentioned. Return JSON array of objects with {id, status, sourceQuote}.
Items: 1=Accessible Route, 2=Accessible Entrance, 3=Door Width, 4=Ramp, 5=Parking, 6=Elevator, 7=Restroom, 8=Interior Width, 9=Counter Height, 10=Signage.
Only include items where reviews provide clear evidence. status: "met" or "not_met". sourceQuote: verbatim excerpt.
Return ONLY JSON array, no other text. If no evidence, return [].

Reviews:
${reviewTexts}`,
      }],
    })

    const text = (msg.content[0] as { type: string; text: string }).text
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return

    const items = JSON.parse(match[0]) as { id: number; status: string; sourceQuote: string }[]
    for (const item of items) {
      if (item.id < 1 || item.id > 10) continue
      // Only override if current status is "unknown" (don't overwrite API ground truth)
      if (checklist[item.id - 1].status === 'unknown' && (item.status === 'met' || item.status === 'not_met')) {
        checklist[item.id - 1] = {
          id: item.id,
          status: item.status as ChecklistItemStatus,
          sourceUrl: null,
          sourceLabel: 'Google Maps Reviews',
          sourceQuote: item.sourceQuote ?? null,
          naReason: null,
        }
      }
    }
    console.log(`[browseruse] ✓ enriched from reviews — now ${checklist.filter(i => i.status === 'met').length} met`)
  } catch (e) {
    console.warn('[browseruse] review enrichment failed:', e)
  }
}

// ── Merge two checklists: met > not_met > unknown > na ──────────────────────

function mergeChecklists(a: ChecklistItem[], b: ChecklistItem[]): ChecklistItem[] {
  return Array.from({ length: 10 }, (_, i) => {
    const id = i + 1
    const ca = a.find(x => x.id === id)
    const cb = b.find(x => x.id === id)
    const candidates = [ca, cb].filter((x): x is ChecklistItem => x !== undefined)

    return (
      candidates.find(c => c.status === 'met') ??
      candidates.find(c => c.status === 'not_met') ??
      candidates.find(c => c.status === 'unknown') ??
      candidates[0] ?? { id, status: 'unknown' as const, sourceUrl: null, sourceLabel: null, sourceQuote: null, naReason: null }
    )
  })
}

// ── Parse BrowserUse output into a checklist ─────────────────────────────────

async function parseOutput(output: unknown): Promise<ChecklistItem[] | null> {
  if (typeof output === 'object' && output !== null && 'checklist' in output) {
    const obj = output as { checklist: unknown }
    if (Array.isArray(obj.checklist) && obj.checklist.length === 10) {
      return obj.checklist as ChecklistItem[]
    }
  }

  const raw = (typeof output === 'string' ? output : JSON.stringify(output))
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim()

  const directMatch = raw.match(/\{[\s\S]*\}/)
  if (directMatch) {
    try {
      const parsed = JSON.parse(directMatch[0])
      if (Array.isArray(parsed.checklist) && parsed.checklist.length === 10) {
        return parsed.checklist as ChecklistItem[]
      }
    } catch { /* fall through */ }
  }

  try {
    const msg = await claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Extract ADA accessibility checklist from this text. Return ONLY valid JSON with exactly 10 items (id 1–10).
{"checklist":[{"id":1,"status":"met|not_met|unknown|na","sourceUrl":null,"sourceLabel":null,"sourceQuote":null,"naReason":null}]}
Text: ${raw.slice(0, 3000)}`,
      }],
    })
    const text = (msg.content[0] as { type: string; text: string }).text
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed.checklist) || parsed.checklist.length !== 10) return null
    return parsed.checklist as ChecklistItem[]
  } catch {
    return null
  }
}

// ── POST /api/places/browseruse ─────────────────────────────────────────────
// Launches 2 agents in parallel:
//   1. Text agent (instant) — Google Places API for attributes + reviews
//   2. Visual agent (BrowserUse) — Google Maps photos
// Text agent result is stored and merged when visual completes.

export async function POST(request: NextRequest) {
  const { name, address, placeId } = await request.json()

  if (!process.env.BROWSER_USE_KEY) {
    return Response.json({ error: 'BROWSER_USE_KEY not set' }, { status: 500 })
  }

  // ── Cache check ───────────────────────────────────────────────────────────
  try {
    const { data: loc } = await supabase
      .from('locations')
      .select('id, browser_use')
      .eq('name', name)
      .maybeSingle()

    if (loc?.browser_use) {
      console.log('[browseruse] cache hit:', name)
      return Response.json({ taskId: `cached:${loc.id}` })
    }
  } catch (e) {
    console.warn('[browseruse] cache check failed:', e)
  }

  // ── Launch both agents in parallel ────────────────────────────────────────
  console.log(`[browseruse] launching text (API) + visual (BrowserUse) for: ${name}`)

  const [textResult, visualResult] = await Promise.allSettled([
    // Text agent: instant API call
    getTextChecklist(placeId, name),
    // Visual agent: BrowserUse session
    fetch(`${BROWSER_USE_BASE}/sessions`, {
      method: 'POST',
      headers: buHeaders(),
      body: JSON.stringify({
        task: makeVisualTask(name, address),
        model: 'gemini-3-flash',
        maxCostUsd: 0.05,
        outputSchema: OUTPUT_SCHEMA,
      }),
    }).then(async res => {
      if (res.status === 429) throw new Error('rate_limited')
      if (!res.ok) throw new Error(`BrowserUse ${res.status}: ${await res.text()}`)
      return res.json()
    }),
  ])

  // Store text checklist for later merge
  let textChecklist: ChecklistItem[] | null = null
  if (textResult.status === 'fulfilled') {
    textChecklist = textResult.value.checklist
    const metCount = textChecklist.filter(i => i.status === 'met').length
    console.log(`[browseruse] ✓ text agent done instantly — ${metCount} met`)
  } else {
    console.warn('[browseruse] text agent failed:', textResult.reason)
  }

  // Check visual agent
  if (visualResult.status === 'rejected') {
    console.warn('[browseruse] visual agent failed to start:', visualResult.reason)
    // If text agent succeeded, return its results immediately (no visual)
    if (textChecklist) {
      const metCount = textChecklist.filter(i => i.status === 'met').length
      const insights = { checklist: textChecklist, metCount }
      void saveToSupabase(name, insights)
      return Response.json({ taskId: 'text-only', textChecklist: JSON.stringify(textChecklist) })
    }
    return Response.json({ error: 'Both agents failed' }, { status: 502 })
  }

  const sessionData = visualResult.value
  const liveUrl = sessionData.live_url ?? sessionData.liveUrl
  console.log(`[browseruse] ✓ visual agent started — session: ${sessionData.id}`)

  const liveUrls = liveUrl ? [{ type: 'visual', url: liveUrl }] : []

  // Encode text checklist in the taskId so GET can merge without re-fetching
  const textPayload = textChecklist ? encodeURIComponent(JSON.stringify(textChecklist)) : ''

  return Response.json({
    taskId: `${sessionData.id}`,
    textChecklist: textPayload,
    liveUrls,
  })
}

// ── DELETE /api/places/browseruse?taskId=xxx ─────────────────────────────────
export async function DELETE(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId')
  if (!taskId) return Response.json({ error: 'taskId required' }, { status: 400 })
  if (taskId.startsWith('cached:') || taskId === 'text-only') return Response.json({ ok: true })
  if (!process.env.BROWSER_USE_KEY) return Response.json({ ok: false }, { status: 500 })

  fetch(`${BROWSER_USE_BASE}/sessions/${taskId}/stop`, {
    method: 'PUT',
    headers: buHeaders(),
  }).catch(() => {})

  return Response.json({ ok: true })
}

// ── GET /api/places/browseruse?taskId=xxx&name=xxx&textChecklist=xxx ────────
// Polls the visual agent, then merges with pre-computed text checklist.
export async function GET(request: NextRequest) {
  const taskId        = request.nextUrl.searchParams.get('taskId')
  const name          = request.nextUrl.searchParams.get('name') ?? ''
  const textRaw       = request.nextUrl.searchParams.get('textChecklist')
  if (!taskId) return Response.json({ error: 'taskId required' }, { status: 400 })

  // ── Cached result ─────────────────────────────────────────────────────────
  if (taskId.startsWith('cached:')) {
    const locationId = taskId.slice('cached:'.length)
    const { data: loc } = await supabase
      .from('locations')
      .select('browser_use')
      .eq('id', locationId)
      .maybeSingle()
    if (loc?.browser_use) return Response.json({ status: 'done', insights: loc.browser_use })
    return Response.json({ status: 'error' })
  }

  // ── Text-only result (visual agent failed at POST time) ───────────────────
  if (taskId === 'text-only') {
    if (!textRaw) return Response.json({ status: 'error' })
    try {
      const cl = JSON.parse(decodeURIComponent(textRaw)) as ChecklistItem[]
      const metCount = cl.filter(i => i.status === 'met').length
      const insights = { checklist: cl, metCount }
      void saveToSupabase(name, insights)
      return Response.json({ status: 'done', insights })
    } catch {
      return Response.json({ status: 'error' })
    }
  }

  if (!process.env.BROWSER_USE_KEY) {
    return Response.json({ error: 'BROWSER_USE_KEY not set' }, { status: 500 })
  }

  // Parse pre-computed text checklist
  let textChecklist: ChecklistItem[] | null = null
  if (textRaw) {
    try { textChecklist = JSON.parse(decodeURIComponent(textRaw)) as ChecklistItem[] } catch {}
  }

  // ── Poll visual agent ─────────────────────────────────────────────────────
  let res: Response
  try {
    res = await fetch(`${BROWSER_USE_BASE}/sessions/${taskId}`, { headers: buHeaders() })
  } catch (e) {
    console.error('[browseruse] poll fetch error:', e)
    // If text agent worked, return that alone
    if (textChecklist) {
      const metCount = textChecklist.filter(i => i.status === 'met').length
      return Response.json({ status: 'done', insights: { checklist: textChecklist, metCount } })
    }
    return Response.json({ status: 'error' })
  }
  if (!res.ok) {
    if (textChecklist) {
      const metCount = textChecklist.filter(i => i.status === 'met').length
      return Response.json({ status: 'done', insights: { checklist: textChecklist, metCount } })
    }
    return Response.json({ status: 'error' })
  }

  const data = await res.json()
  console.log(`[browseruse] poll visual — status: ${data.status} | has output: ${!!data.output}`)

  // Try parsing output early
  if (data.output) {
    const visualCl = await parseOutput(data.output)
    if (visualCl) {
      const merged = textChecklist ? mergeChecklists(textChecklist, visualCl) : visualCl
      const metCount = merged.filter(i => i.status === 'met').length
      const insights = { checklist: merged, metCount }
      console.log(`[browseruse] ✓ merged text+visual → ${metCount}/10 met`)
      void saveToSupabase(name, insights)
      if (data.status === 'running' || data.status === 'created') {
        fetch(`${BROWSER_USE_BASE}/sessions/${taskId}/stop`, { method: 'PUT', headers: buHeaders() }).catch(() => {})
      }
      return Response.json({ status: 'done', insights })
    }
  }

  if (data.status === 'created' || data.status === 'running') {
    return Response.json({ status: 'loading' })
  }

  // Terminal — visual failed, fall back to text-only
  if (!data.output || data.status === 'timed_out' || data.status === 'error') {
    console.warn('[browseruse] visual agent failed — status:', data.status)
    if (textChecklist) {
      const metCount = textChecklist.filter(i => i.status === 'met').length
      const insights = { checklist: textChecklist, metCount }
      void saveToSupabase(name, insights)
      return Response.json({ status: 'done', insights })
    }
    return Response.json({ status: 'error' })
  }

  // Final parse attempt
  const visualCl = await parseOutput(data.output)
  const merged = textChecklist && visualCl
    ? mergeChecklists(textChecklist, visualCl)
    : (visualCl ?? textChecklist)
  if (!merged) return Response.json({ status: 'error' })

  const metCount = merged.filter(i => i.status === 'met').length
  const insights = { checklist: merged, metCount }
  void saveToSupabase(name, insights)
  return Response.json({ status: 'done', insights })
}

// ── Persist to Supabase ─────────────────────────────────────────────────────

async function saveToSupabase(name: string, insights: object) {
  if (!name) return
  try {
    const { data: existing, error: findErr } = await supabase
      .from('locations')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    if (findErr) { console.error('[browseruse] find failed:', findErr.message); return }

    if (existing?.id) {
      const { error } = await supabase.from('locations').update({ browser_use: insights }).eq('id', existing.id)
      if (error) console.error('[browseruse] update failed:', error.message)
      else console.log('[browseruse] cached (update):', name)
    } else {
      const { error } = await supabase.from('locations').insert({ name, browser_use: insights })
      if (error) console.error('[browseruse] insert failed:', error.message)
      else console.log('[browseruse] cached (insert):', name)
    }
  } catch (e) {
    console.error('[browseruse] save error:', e)
  }
}
