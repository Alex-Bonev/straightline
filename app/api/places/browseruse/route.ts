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

// ── POST /api/places/browseruse ───────────────────────────────────────────────
// Body: { name: string, address: string }
// 1. Checks locations table — if checklist data exists, returns sentinel taskId.
// 2. Otherwise starts a live BrowserUse scan and returns the real taskId.
export async function POST(request: NextRequest) {
  const { name, address } = await request.json()

  if (!process.env.BROWSER_USE_KEY) {
    return Response.json({ error: 'BROWSER_USE_KEY not set' }, { status: 500 })
  }

  // ── Check locations table for cached checklist data ───────────────────────
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

  // ── Start live scan ───────────────────────────────────────────────────────
  const task = `
You are an ADA accessibility researcher. Search exhaustively for physical accessibility information about "${name}" located at "${address}".

Search ALL of the following — do not stop after the first source:
- Google Maps listing and reviews (search "site:google.com/maps ${name} ${address}" and browse the listing)
- Yelp reviews (search "site:yelp.com ${name} ${address}")
- The official website for this location (look for an "Accessibility" or "Visitor Information" page)
- TripAdvisor, Foursquare, or any venue review site
- Local news articles or blog posts mentioning accessibility at this location
- ADA.gov or any government inspection / compliance database
- The building's Wikipedia page if one exists
- Any disability advocacy or accessibility review site (e.g. WheelMate, AccessNow, AXSMap)

For each of the 10 items below, determine whether it is met, not_met, unknown, or na.

Strictness rules — read carefully:
- "met" requires a SPECIFIC, DIRECT statement from a source. Generic phrases like "accessible", "ADA compliant", or "wheelchair friendly" alone are NOT sufficient to mark individual items as met.
- "not_met" requires a specific statement or photo evidence that the feature is absent or non-compliant.
- "unknown" is the correct answer for any item where you cannot find a specific statement about that exact feature. Default to "unknown" — do not infer or guess.
- "na" is only for items that structurally cannot apply (e.g. elevator for a confirmed single-story building).
- Do NOT mark an item "met" just because a building is modern, large, or a chain — ADA compliance varies widely and must be verified per item.
- Do NOT mark an item "met" based on a general "wheelchair accessible" tag. That tag on Google Maps only confirms a wheelchair-accessible entrance, not the other 9 items.

Items:
1. Accessible Route — continuous, obstacle-free path from public street or parking to the entrance (curb cuts, no stairs, no gaps)
2. Accessible Entrance — step-free entry usable independently, not via a side or service door
3. Door Width & Type — entry doors provide ≥32" clear width AND have automatic or push-button opener
4. Ramp Availability — ramp with slope ≤1:12 present wherever level changes exist between street and entrance
5. Accessible Parking — designated accessible spaces with access aisle, located close to the entrance
6. Elevator / Lift — elevator or platform lift serves all publicly accessible floors (na if confirmed single-story)
7. Accessible Restroom — at least one restroom has grab bars, ≥60" turning radius, and accessible fixtures
8. Interior Pathway Width — interior corridors and aisles are ≥36" wide and free of obstacles
9. Service Counter Height — at least one counter section is ≤36" high for wheelchair reach
10. Accessible Signage — ISA symbols posted at accessible entrances, restrooms, parking, and routes

Return ONLY this JSON (no explanation, no markdown):
{
  "checklist": [
    {
      "id": 1,
      "status": "unknown",
      "sourceUrl": null,
      "sourceLabel": null,
      "sourceQuote": null,
      "naReason": null
    }
  ]
}

Rules:
- status must be exactly one of: "met", "not_met", "unknown", "na"
- sourceUrl, sourceLabel, and sourceQuote must be present (non-null) when status is "met" or "not_met"
- sourceUrl, sourceLabel, and sourceQuote must be null when status is "unknown" or "na"
- naReason must be a short explanation when status is "na"; null otherwise
- sourceQuote must be a verbatim excerpt from the actual source page — never paraphrase or invent text
- sourceLabel is a short human-readable name for the source (e.g. "Google Reviews", "Yelp", "Official Website", "TripAdvisor", "ADA.gov", "Local News")
- Return exactly 10 items in order (id 1 through 10)
- When in doubt, use "unknown" — accuracy matters more than completeness
`

  try {
    const res = await fetch(`${BROWSER_USE_BASE}/sessions`, {
      method: 'POST',
      headers: buHeaders(),
      body: JSON.stringify({ task }),
    })

    if (res.status === 429) {
      console.warn('[browseruse] rate limited (429)')
      return Response.json({ error: 'rate_limited' }, { status: 429 })
    }

    if (!res.ok) {
      const text = await res.text()
      console.error('[browseruse] start failed:', res.status, text)
      return Response.json({ error: 'BrowserUse API error', details: text }, { status: 502 })
    }

    const data = await res.json()
    console.log('[browseruse] session started:', data.id, 'for:', name)
    return Response.json({ taskId: data.id })
  } catch (e) {
    console.error('[browseruse] POST fetch error:', e)
    return Response.json({ error: 'Network error reaching BrowserUse', details: String(e) }, { status: 502 })
  }
}

// ── DELETE /api/places/browseruse?taskId=xxx ─────────────────────────────────
// Stops a running session to free up the concurrent slot.
export async function DELETE(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId')
  if (!taskId) return Response.json({ error: 'taskId required' }, { status: 400 })
  if (taskId.startsWith('cached:')) return Response.json({ ok: true })
  if (!process.env.BROWSER_USE_KEY) return Response.json({ ok: false }, { status: 500 })

  try {
    await fetch(`${BROWSER_USE_BASE}/sessions/${taskId}/stop`, {
      method: 'PUT',
      headers: buHeaders(),
    })
  } catch {
    // best-effort — ignore errors
  }
  return Response.json({ ok: true })
}

// ── GET /api/places/browseruse?taskId=xxx&name=xxx ───────────────────────────
// Terminal statuses: idle | stopped | timed_out | error
// Returns:
//   { status: 'loading' }
//   { status: 'done', insights: BrowserUseInsights }
//   { status: 'error' }
// When status is 'done' and name is provided, writes checklist to locations table.
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId')
  const name   = request.nextUrl.searchParams.get('name') ?? ''
  if (!taskId) return Response.json({ error: 'taskId required' }, { status: 400 })

  // ── Serve from locations table cache ─────────────────────────────────────
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

  if (!process.env.BROWSER_USE_KEY) {
    return Response.json({ error: 'BROWSER_USE_KEY not set' }, { status: 500 })
  }

  // ── Poll BrowserUse ───────────────────────────────────────────────────────
  let res: Response
  try {
    res = await fetch(`${BROWSER_USE_BASE}/sessions/${taskId}`, {
      headers: buHeaders(),
    })
  } catch (e) {
    console.error('[browseruse] GET fetch error:', e)
    return Response.json({ status: 'error' })
  }

  if (!res.ok) {
    console.error('[browseruse] poll failed:', res.status, await res.text())
    return Response.json({ status: 'error' })
  }

  const data = await res.json()
  console.log('[browseruse] poll status:', data.status, '| name:', name)

  const running = data.status === 'created' || data.status === 'running'
  if (running) return Response.json({ status: 'loading' })

  const terminal = ['idle', 'stopped', 'timed_out', 'error']
  if (!terminal.includes(data.status)) return Response.json({ status: 'loading' })

  if (data.status === 'timed_out' || data.status === 'error' || !data.output) {
    console.error('[browseruse] terminal failure:', JSON.stringify(data, null, 2))
    return Response.json({ status: 'error' })
  }

  // Strip markdown code fences if present (BrowserUse often wraps output in ```json ... ```)
  const stripped = (typeof data.output === 'string' ? data.output : JSON.stringify(data.output))
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim()
  const rawOutput = stripped

  // Try to parse JSON directly from the output first
  const directMatch = rawOutput.match(/\{[\s\S]*\}/)
  if (directMatch) {
    try {
      const parsed = JSON.parse(directMatch[0])
      if (Array.isArray(parsed.checklist) && parsed.checklist.length === 10) {
        const metCount = parsed.checklist.filter((i: { status: string }) => i.status === 'met').length
        const insights = { checklist: parsed.checklist, metCount }
        void saveToSupabase(name, insights)
        return Response.json({ status: 'done', insights })
      }
    } catch {
      // fall through to Claude parsing
    }
  }

  // BrowserUse returned prose — use Claude to extract structured data
  try {
    const msg = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
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
      "sourceUrl": null,
      "sourceLabel": null,
      "sourceQuote": null,
      "naReason": null
    }
  ]
}

Rules:
- Include exactly 10 items (id 1–10) in order
- status: "met", "not_met", "unknown", or "na"
- sourceUrl/sourceLabel/sourceQuote: non-null only when status is "met" or "not_met"
- naReason: non-null only when status is "na"
- Never invent sourceUrl or sourceQuote — use null if not found in the text
- sourceLabel is a short human-readable name for the source (e.g. "Google Reviews", "Yelp", "Official Website")

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
      ],
    })

    const text = (msg.content[0] as { type: string; text: string }).text
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ status: 'error' })

    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed.checklist) || parsed.checklist.length !== 10) return Response.json({ status: 'error' })
    const metCount = parsed.checklist.filter((i: { status: string }) => i.status === 'met').length
    const insights = { checklist: parsed.checklist, metCount }
    void saveToSupabase(name, insights)
    return Response.json({ status: 'done', insights })
  } catch (e) {
    console.error('[browseruse] Claude parse failed:', e)
    return Response.json({ status: 'error' })
  }
}

// ── Persist checklist to locations table ─────────────────────────────────────
// Fire-and-forget; called after a scan completes successfully.
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
      const { error: updateErr } = await supabase
        .from('locations')
        .update({ browser_use: insights })
        .eq('id', existing.id)
      if (updateErr) console.error('[browseruse] update failed:', updateErr.message)
      else console.log('[browseruse] cached (update):', name)
    } else {
      const { error: insertErr } = await supabase
        .from('locations')
        .insert({ name, browser_use: insights })
      if (insertErr) console.error('[browseruse] insert failed:', insertErr.message)
      else console.log('[browseruse] cached (insert):', name)
    }
  } catch (e) {
    console.error('[browseruse] save error:', e)
  }
}
