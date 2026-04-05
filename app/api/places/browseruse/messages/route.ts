import { NextRequest } from 'next/server'

const BROWSER_USE_BASE = 'https://api.browser-use.com/api/v3'

function buHeaders() {
  return {
    'X-Browser-Use-API-Key': process.env.BROWSER_USE_KEY ?? '',
    'Content-Type': 'application/json',
  }
}

// GET /api/places/browseruse/messages?sessionId=xxx&after=xxx
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId')
  const after = request.nextUrl.searchParams.get('after')

  if (!sessionId) return Response.json({ error: 'sessionId required' }, { status: 400 })
  if (!process.env.BROWSER_USE_KEY) return Response.json({ error: 'BROWSER_USE_KEY not set' }, { status: 500 })

  const params = new URLSearchParams({ limit: '50' })
  if (after) params.set('after', after)

  try {
    const res = await fetch(
      `${BROWSER_USE_BASE}/sessions/${sessionId}/messages?${params}`,
      { headers: buHeaders() }
    )
    if (!res.ok) {
      return Response.json({ messages: [], hasMore: false })
    }
    const data = await res.json()
    return Response.json(data)
  } catch {
    return Response.json({ messages: [], hasMore: false })
  }
}
