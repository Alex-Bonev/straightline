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

// ── Resolver agent prompt (targets only unknown items) ─────────────────────
const ITEM_NAMES: Record<number, string> = {
  1: 'Accessible Route',
  2: 'Accessible Entrance',
  3: 'Door Width & Type',
  4: 'Ramp Availability',
  5: 'Accessible Parking',
  6: 'Elevator / Lift',
  7: 'Accessible Restroom',
  8: 'Interior Pathway Width',
  9: 'Service Counter Height',
  10: 'Accessible Signage',
}

function makeResolverTask(name: string, address: string, unknownIds: number[]): string {
  const QUESTION_MAP: Record<number, string> = {
    1: 'accessible route or path',
    2: 'accessible entrance',
    3: 'wide doors or automatic doors',
    4: 'wheelchair ramps',
    5: 'accessible parking or handicap parking',
    6: 'elevators or lifts',
    7: 'accessible restrooms or handicap bathrooms',
    8: 'wide hallways or corridors',
    9: 'lowered service counters',
    10: 'accessible signage or braille signs',
  }
  const searches = unknownIds.map(id => `  ${id}. Google "Does ${name} have ${QUESTION_MAP[id]}"`).join('\n')

  return `Search Google for ${unknownIds.length} questions about "${name}" at "${address}". For each, read ONLY the Google snippet. Then IMMEDIATELY output the JSON.

Questions:
${searches}

RULES:
- ONE Google search per question. Read the snippet. Move on. Do NOT click through.
- After all ${unknownIds.length} searches, OUTPUT THE JSON. Do nothing else.

CRITICAL — USE INFERENCE, not just explicit statements:
- Hospitals, airports, malls, multi-story buildings → assume elevators ("met"), wide hallways ("met"), accessible signage ("met") by law.
- If a snippet mentions "lower level", "floors", "north tower", "parking garage" → infer elevators exist.
- If it's a large public institution → ADA compliance is legally required, so entrance/route/signage = "met" unless evidence says otherwise.
- "unknown" is a LAST RESORT. Only use it for niche items (e.g. lowered service counters, braille signs) when you genuinely cannot infer.
- "not_met" only if the snippet explicitly says the feature is absent or inaccessible.

Output: JSON with ALL 10 items (ids 1-10). Items not in your list → "unknown" with null fields.
Status: "met"=yes/inferred. "not_met"=explicitly absent. "unknown"=truly can't tell. "na"=not applicable.
sourceLabel=website. sourceQuote=relevant snippet sentence (or "Inferred: [reason]" if using inference).`
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

// ── Helper: launch a BrowserUse session ─────────────────────────────────────
async function launchBrowserUse(task: string): Promise<{ id: string; liveUrl?: string }> {
  const res = await fetch(`${BROWSER_USE_BASE}/sessions`, {
    method: 'POST',
    headers: buHeaders(),
    body: JSON.stringify({
      task,
      model: 'gemini-3-flash',
      maxCostUsd: 0.05,
      outputSchema: OUTPUT_SCHEMA,
    }),
  })
  if (res.status === 429) throw new Error('rate_limited')
  if (!res.ok) throw new Error(`BrowserUse ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return { id: data.id, liveUrl: data.live_url ?? data.liveUrl }
}

// ── POST /api/places/browseruse ─────────────────────────────────────────────
// 1. Text agent (instant Google Places API)
// 2. Visual agent (BrowserUse — photos)
// 3. Resolver agent (BrowserUse — only if text agent left unknown items)

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

  // ── Step 1: Run text agent first (instant) ───────────────────────────────
  console.log(`[browseruse] launching text (API) for: ${name}`)
  let textChecklist: ChecklistItem[] | null = null
  try {
    const result = await getTextChecklist(placeId, name)
    textChecklist = result.checklist
    const metCount = textChecklist.filter(i => i.status === 'met').length
    console.log(`[browseruse] ✓ text agent done — ${metCount} met`)
  } catch (e) {
    console.warn('[browseruse] text agent failed:', e)
  }

  // ── Step 2: Determine which items are still unknown ──────────────────────
  const unknownIds = textChecklist
    ? textChecklist.filter(i => i.status === 'unknown').map(i => i.id)
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const needsResolver = unknownIds.length > 0

  // ── Step 3: Launch visual + resolver in parallel ─────────────────────────
  console.log(`[browseruse] launching visual${needsResolver ? ` + resolver (${unknownIds.length} unknown items)` : ''} for: ${name}`)

  const agentPromises: Promise<{ id: string; liveUrl?: string }>[] = [
    launchBrowserUse(makeVisualTask(name, address)),
  ]
  if (needsResolver) {
    agentPromises.push(launchBrowserUse(makeResolverTask(name, address, unknownIds)))
  }

  const results = await Promise.allSettled(agentPromises)
  const visualResult = results[0]
  const resolverResult = results.length > 1 ? results[1] : null

  // ── Build response ───────────────────────────────────────────────────────
  const liveUrls: { type: string; url: string }[] = []
  let visualId: string | null = null
  let resolverId: string | null = null

  if (visualResult.status === 'fulfilled') {
    visualId = visualResult.value.id
    if (visualResult.value.liveUrl) liveUrls.push({ type: 'visual', url: visualResult.value.liveUrl })
    console.log(`[browseruse] ✓ visual agent started — session: ${visualId}`)
  } else {
    console.warn('[browseruse] visual agent failed to start:', visualResult.reason)
  }

  if (resolverResult?.status === 'fulfilled') {
    resolverId = resolverResult.value.id
    if (resolverResult.value.liveUrl) liveUrls.push({ type: 'resolver', url: resolverResult.value.liveUrl })
    console.log(`[browseruse] ✓ resolver agent started — session: ${resolverId}`)
  } else if (resolverResult?.status === 'rejected') {
    console.warn('[browseruse] resolver agent failed to start:', resolverResult.reason)
  }

  // If both BrowserUse agents failed, return text-only
  if (!visualId && !resolverId) {
    if (textChecklist) {
      const metCount = textChecklist.filter(i => i.status === 'met').length
      const insights = { checklist: textChecklist, metCount }
      void saveToSupabase(name, insights)
      return Response.json({ taskId: 'text-only', textChecklist: JSON.stringify(textChecklist) })
    }
    return Response.json({ error: 'All agents failed' }, { status: 502 })
  }

  const textPayload = textChecklist ? encodeURIComponent(JSON.stringify(textChecklist)) : ''

  return Response.json({
    taskId: visualId ?? resolverId,
    resolverTaskId: resolverId ?? undefined,
    textChecklist: textPayload,
    liveUrls,
  })
}

// ── DELETE /api/places/browseruse?taskId=xxx&resolverTaskId=xxx ──────────────
export async function DELETE(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId')
  const resolverTaskId = request.nextUrl.searchParams.get('resolverTaskId')
  if (!taskId) return Response.json({ error: 'taskId required' }, { status: 400 })
  if (taskId.startsWith('cached:') || taskId === 'text-only') return Response.json({ ok: true })
  if (!process.env.BROWSER_USE_KEY) return Response.json({ ok: false }, { status: 500 })

  const stopSession = (id: string) =>
    fetch(`${BROWSER_USE_BASE}/sessions/${id}/stop`, { method: 'PUT', headers: buHeaders() }).catch(() => {})

  stopSession(taskId)
  if (resolverTaskId) stopSession(resolverTaskId)

  return Response.json({ ok: true })
}

// ── Helper: poll a single BrowserUse session ────────────────────────────────
interface SessionPoll {
  terminal: boolean
  checklist: ChecklistItem[] | null
  status: string
}

async function pollSession(sessionId: string): Promise<SessionPoll> {
  try {
    const res = await fetch(`${BROWSER_USE_BASE}/sessions/${sessionId}`, { headers: buHeaders() })
    if (!res.ok) return { terminal: true, checklist: null, status: 'error' }
    const data = await res.json()

    if (data.output) {
      const cl = await parseOutput(data.output)
      if (cl) {
        // Stop session if it's still running — we have what we need
        if (data.status === 'running' || data.status === 'created') {
          fetch(`${BROWSER_USE_BASE}/sessions/${sessionId}/stop`, { method: 'PUT', headers: buHeaders() }).catch(() => {})
        }
        return { terminal: true, checklist: cl, status: 'done' }
      }
    }

    if (data.status === 'created' || data.status === 'running') {
      return { terminal: false, checklist: null, status: data.status }
    }

    // Terminal without output
    return { terminal: true, checklist: null, status: data.status }
  } catch {
    return { terminal: true, checklist: null, status: 'error' }
  }
}

// ── GET /api/places/browseruse ──────────────────────────────────────────────
// Polls visual + resolver agents, merges with text checklist.
// Params: taskId, resolverTaskId (optional), name, textChecklist
export async function GET(request: NextRequest) {
  const taskId          = request.nextUrl.searchParams.get('taskId')
  const resolverTaskId  = request.nextUrl.searchParams.get('resolverTaskId')
  const name            = request.nextUrl.searchParams.get('name') ?? ''
  const textRaw         = request.nextUrl.searchParams.get('textChecklist')
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

  // ── Text-only result (BrowserUse agents failed at POST time) ──────────────
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

  // ── Poll all active sessions in parallel ──────────────────────────────────
  const polls = await Promise.all([
    pollSession(taskId),
    resolverTaskId ? pollSession(resolverTaskId) : null,
  ])

  const visualPoll = polls[0]
  const resolverPoll = polls[1]

  console.log(`[browseruse] poll — visual: ${visualPoll.status}${visualPoll.checklist ? ' ✓output' : ''}${resolverPoll ? ` | resolver: ${resolverPoll.status}${resolverPoll.checklist ? ' ✓output' : ''}` : ''}`)

  // If any session is still running, keep polling
  const allTerminal = visualPoll.terminal && (!resolverPoll || resolverPoll.terminal)
  if (!allTerminal) {
    return Response.json({ status: 'loading' })
  }

  // ── All sessions done — merge results ────────────────────────────────────
  let merged = textChecklist ?? Array.from({ length: 10 }, (_, i) => ({
    id: i + 1, status: 'unknown' as const, sourceUrl: null, sourceLabel: null, sourceQuote: null, naReason: null,
  }))

  if (visualPoll.checklist) {
    merged = mergeChecklists(merged, visualPoll.checklist)
  }
  if (resolverPoll?.checklist) {
    merged = mergeChecklists(merged, resolverPoll.checklist)
  }

  const metCount = merged.filter(i => i.status === 'met').length
  const resolvedCount = merged.filter(i => i.status !== 'unknown').length
  const insights = { checklist: merged, metCount }
  console.log(`[browseruse] ✓ merged all agents → ${metCount}/10 met, ${resolvedCount}/10 resolved`)
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
