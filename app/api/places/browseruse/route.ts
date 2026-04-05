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
Search the web for detailed ADA / disability accessibility information about "${name}" located at "${address}".

Check Google Maps reviews, Yelp reviews, and any official website for this specific location.

Look for these accessibility features:
- Wheelchair ramps or accessible entrances
- Elevator or lift availability
- ADA-compliant restrooms
- Accessible / handicap parking spaces
- Step-free pathways
- Automatic doors or push-button entry
- Braille signage
- Hearing loop or audio assistance systems
- Any documented accessibility complaints, lawsuits, or violations

Return ONLY a JSON object in this exact format — no explanation, no markdown, just raw JSON:
{
  "adaPercent": 78,
  "grade": "B+",
  "compliance": [
    "Wheelchair accessible main entrance",
    "Elevator serves all floors"
  ],
  "limitations": [
    "No accessible parking within 100 ft",
    "Some corridor widths below ADA minimum"
  ]
}

Rules:
- adaPercent: integer 0–100 estimating overall ADA compliance
- grade: one of A+, A, A-, B+, B, B-, C+, C, C-, D, F
- compliance: 2–5 short strings of confirmed accessible features
- limitations: 1–4 short strings of specific gaps or issues
- If information is scarce, make a reasonable estimate based on type of venue and neighborhood
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

  // Try to parse JSON directly from the output first (greedy match to handle nested objects)
  const directMatch = rawOutput.match(/\{[\s\S]*\}/)
  if (directMatch) {
    try {
      const parsed = JSON.parse(directMatch[0])
      if (
        typeof parsed.adaPercent === 'number' &&
        Array.isArray(parsed.compliance) &&
        Array.isArray(parsed.limitations) &&
        typeof parsed.grade === 'string'
      ) {
        return Response.json({ status: 'done', insights: parsed })
      }
    } catch {
      // fall through to Claude parsing
    }
  }

  // BrowserUse returned prose — use Claude to extract structured data
  try {
    const msg = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Extract ADA accessibility insights from the text below and return ONLY valid JSON.

Text:
${rawOutput}

Return this exact JSON (no extra text, no markdown):
{
  "adaPercent": 78,
  "grade": "B+",
  "compliance": ["Feature 1", "Feature 2"],
  "limitations": ["Issue 1", "Issue 2"]
}

Rules:
- adaPercent: integer 0–100
- grade: A+, A, A-, B+, B, B-, C+, C, C-, D, or F
- compliance: 2–5 confirmed accessible feature strings
- limitations: 1–4 accessibility gap strings
Return ONLY the JSON.`,
        },
      ],
    })

    const text = (msg.content[0] as { type: string; text: string }).text
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ status: 'error' })

    const insights = JSON.parse(match[0])
    return Response.json({ status: 'done', insights })
  } catch (e) {
    console.error('[browseruse] Claude parse failed:', e)
    return Response.json({ status: 'error' })
  }
}
