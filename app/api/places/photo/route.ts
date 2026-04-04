import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const ref    = request.nextUrl.searchParams.get('ref')
  const width  = request.nextUrl.searchParams.get('w') ?? '600'

  if (!ref) {
    return new Response('ref required', { status: 400 })
  }

  const apiKey = process.env.MAPS_KEY
  if (!apiKey) {
    return new Response('MAPS_KEY not set', { status: 500 })
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/photo')
  url.searchParams.set('photoreference', ref)
  url.searchParams.set('maxwidth', width)
  url.searchParams.set('key', apiKey)

  // Google redirects to the actual image — follow the redirect
  const res = await fetch(url.toString(), { redirect: 'follow' })

  if (!res.ok) {
    return new Response('Photo fetch failed', { status: 502 })
  }

  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const buffer      = await res.arrayBuffer()

  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
