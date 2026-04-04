import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const radius = searchParams.get('radius') ?? '1500'

  if (!lat || !lng) {
    return Response.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const apiKey = process.env.MAPS_KEY
  if (!apiKey) {
    return Response.json({ error: 'Server misconfiguration: MAPS_KEY not set' }, { status: 500 })
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
  url.searchParams.set('location', `${lat},${lng}`)
  url.searchParams.set('radius', radius)
  url.searchParams.set('type', 'establishment')
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())
  const data = await res.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return Response.json({ error: data.status }, { status: 502 })
  }

  const places = (data.results ?? []).slice(0, 20).map((p: any) => ({
    placeId: p.place_id,
    name: p.name,
    address: p.vicinity,
    location: p.geometry?.location ?? null,
    rating: p.rating ?? null,
    userRatingsTotal: p.user_ratings_total ?? 0,
    types: p.types ?? [],
    openNow: p.opening_hours?.open_now ?? null,
    photoRef: p.photos?.[0]?.photo_reference ?? null,
  })).filter((p: any) => p.location !== null)

  return Response.json({ places })
}
