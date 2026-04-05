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
// Body: { name, address }
// 1. Checks locations table — if browser_use data exists, returns sentinel taskId.
// 2. Otherwise starts a live BrowserUse scan and returns the real taskId.
export async function POST(request: NextRequest) {
  const { name, address } = await request.json()

  if (!process.env.BROWSER_USE_KEY) {
    return Response.json({ error: 'BROWSER_USE_KEY not set' }, { status: 500 })
  }

  // ── Check locations table for cached browser_use data ────────────────────
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
  const task = `Go to Google and search for: "${name} ${address} wheelchair accessibility ADA"

Click the most relevant result (Google Maps listing, official site, or review site).

Find any mentions of: wheelchair access, ramps, elevators, ADA compliance, accessible parking, accessible restrooms, automatic doors.

Return ONLY this JSON — no markdown, no explanation:
{
  "adaPercent": 78,
  "grade": "B+",
  "compliance": ["Wheelchair accessible entrance", "Elevator on site"],
  "limitations": ["No accessible parking nearby"]
}

Rules:
- adaPercent: integer 0–100
- grade: one of A+, A, A-, B+, B, B-, C+, C, C-, D, F
- compliance: 2–4 confirmed accessible features (short strings)
- limitations: 1–3 accessibility gaps (short strings)
- If little info found, estimate based on venue type and location`

  try {
    const res = await fetch(`${BROWSER_USE_BASE}/sessions`, {
      method: 'POST',
      headers: buHeaders(),
      body: JSON.stringify({ task }),
    })

    if (res.status === 429) {
      console.warn('[browseruse] rate limited')
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
    console.error('[browseruse] POST error:', e)
    return Response.json({ error: 'Network error', details: String(e) }, { status: 502 })
  }
}

// ── DELETE /api/places/browseruse?taskId=xxx ─────────────────────────────────
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
  } catch { /* best-effort */ }

  return Response.json({ ok: true })
}

// ── GET /api/places/browseruse?taskId=xxx&name=xxx ───────────────────────────
// Returns { status: 'loading' | 'done' | 'error', insights? }
// When status is 'done' and name is provided, writes insights to locations table.
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
    res = await fetch(`${BROWSER_USE_BASE}/sessions/${taskId}`, { headers: buHeaders() })
  } catch (e) {
    console.error('[browseruse] GET fetch error:', e)
    return Response.json({ status: 'error' })
  }

  if (!res.ok) {
    console.error('[browseruse] poll failed:', res.status)
    return Response.json({ status: 'error' })
  }

  const data = await res.json()
  console.log('[browseruse] poll status:', data.status, '| name:', name)

  if (data.status === 'created' || data.status === 'running') {
    return Response.json({ status: 'loading' })
  }

  const terminal = ['idle', 'stopped', 'timed_out', 'error']
  if (!terminal.includes(data.status)) return Response.json({ status: 'loading' })

  if (data.status === 'timed_out' || data.status === 'error' || !data.output) {
    console.error('[browseruse] terminal failure:', data.status)
    return Response.json({ status: 'error' })
  }

  // ── Parse output ──────────────────────────────────────────────────────────
  const stripped = (typeof data.output === 'string' ? data.output : JSON.stringify(data.output))
    .replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()

  let insights: Record<string, unknown> | null = null

  const directMatch = stripped.match(/\{[\s\S]*\}/)
  if (directMatch) {
    try {
      const parsed = JSON.parse(directMatch[0])
      if (
        typeof parsed.adaPercent === 'number' &&
        Array.isArray(parsed.compliance) &&
        Array.isArray(parsed.limitations) &&
        typeof parsed.grade === 'string'
      ) {
        insights = parsed
      }
    } catch { /* fall through to Claude */ }
  }

  if (!insights) {
    try {
      const msg = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `Extract ADA accessibility insights from the text below and return ONLY valid JSON.\n\nText:\n${stripped}\n\nReturn this exact JSON:\n{"adaPercent":78,"grade":"B+","compliance":["Feature 1"],"limitations":["Issue 1"]}\n\nRules: adaPercent 0-100, grade A+/A/A-/B+/B/B-/C+/C/C-/D/F, compliance 2-5 strings, limitations 1-4 strings.`,
        }],
      })
      const text  = (msg.content[0] as { type: string; text: string }).text
      const match = text.match(/\{[\s\S]*\}/)
      if (match) insights = JSON.parse(match[0])
    } catch (e) {
      console.error('[browseruse] Claude parse failed:', e)
    }
  }

  if (!insights) return Response.json({ status: 'error' })

  // ── Write fully-loaded insights to locations table ────────────────────────
  // Only fires once the scan is 100% complete.
  // Uses find-then-update-or-insert to avoid relying on UNIQUE constraint.
  if (name) {
    void (async () => {
      try {
        const { data: existing, error: findErr } = await supabase
          .from('locations')
          .select('id')
          .eq('name', name)
          .maybeSingle()

        if (findErr) {
          console.error('[browseruse] find failed:', findErr.message)
          return
        }

        if (existing?.id) {
          const { error: updateErr } = await supabase
            .from('locations')
            .update({ browser_use: insights })
            .eq('id', existing.id)
          if (updateErr) console.error('[browseruse] update failed:', updateErr.message)
          else console.log('[browseruse] updated:', name)
        } else {
          const { error: insertErr } = await supabase
            .from('locations')
            .insert({ name, browser_use: insights })
          if (insertErr) console.error('[browseruse] insert failed:', insertErr.message)
          else console.log('[browseruse] inserted:', name)
        }
      } catch (e) {
        console.error('[browseruse] save error:', e)
      }
    })()
  }

  return Response.json({ status: 'done', insights })
}
