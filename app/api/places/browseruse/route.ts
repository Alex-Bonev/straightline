import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

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
// Starts a BrowserUse cloud session. Returns { taskId }.
export async function POST(request: NextRequest) {
  const { name, address } = await request.json()

  if (!process.env.BROWSER_USE_KEY) {
    return Response.json({ error: 'BROWSER_USE_KEY not set' }, { status: 500 })
  }

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
    console.log('[browseruse] session started:', data.id)
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

// ── GET /api/places/browseruse?taskId=xxx ────────────────────────────────────
// Terminal statuses: idle | stopped | timed_out | error
// Returns:
//   { status: 'loading' }
//   { status: 'done', insights: BrowserUseInsights }
//   { status: 'error' }
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get('taskId')
  if (!taskId) return Response.json({ error: 'taskId required' }, { status: 400 })

  if (!process.env.BROWSER_USE_KEY) {
    return Response.json({ error: 'BROWSER_USE_KEY not set' }, { status: 500 })
  }

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
  console.log('[browseruse] poll status:', data.status)

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
        return Response.json({ status: 'done', insights: { checklist: parsed.checklist, metCount } })
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
      "sourceQuote": null,
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
      ],
    })

    const text = (msg.content[0] as { type: string; text: string }).text
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ status: 'error' })

    const insights = JSON.parse(match[0])
    if (!Array.isArray(insights.checklist) || insights.checklist.length !== 10) return Response.json({ status: 'error' })
    const metCount = insights.checklist.filter((i: { status: string }) => i.status === 'met').length
    return Response.json({ status: 'done', insights: { checklist: insights.checklist, metCount } })
  } catch (e) {
    console.error('[browseruse] Claude parse failed:', e)
    return Response.json({ status: 'error' })
  }
}
