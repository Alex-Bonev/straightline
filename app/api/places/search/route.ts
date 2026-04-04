import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('query')
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const radius = searchParams.get('radius') ?? '10000'

  if (!query) {
    return Response.json({ places: [] })
  }

  const apiKey = process.env.MAPS_KEY
  if (!apiKey) {
    return Response.json({ error: 'MAPS_KEY not set' }, { status: 500 })
  }

  // Use nearbysearch + keyword — same API as /places/nearby, already known to work.
  // Falls back to a San Diego center if no location provided.
  const centerLat = lat ?? '32.8801'
  const centerLng = lng ?? '-117.2340'

  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
  url.searchParams.set('location', `${centerLat},${centerLng}`)
  url.searchParams.set('radius', radius)
  url.searchParams.set('keyword', query)
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())
  const data = await res.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return Response.json({ error: data.status, details: data.error_message ?? null }, { status: 502 })
  }

  const places = (data.results ?? []).slice(0, 20).map((p: {
    place_id: string
    name: string
    vicinity: string
    geometry?: { location: { lat: number; lng: number } }
    rating?: number
    user_ratings_total?: number
    types?: string[]
    opening_hours?: { open_now?: boolean }
    photos?: Array<{ photo_reference: string }>
  }) => ({
    placeId: p.place_id,
    name: p.name,
    address: p.vicinity,
    location: p.geometry?.location ?? null,
    rating: p.rating ?? null,
    userRatingsTotal: p.user_ratings_total ?? 0,
    types: p.types ?? [],
    openNow: p.opening_hours?.open_now ?? null,
    photoRef: p.photos?.[0]?.photo_reference ?? null,
  })).filter((p: { location: unknown }) => p.location !== null)

  return Response.json({ places })
}
