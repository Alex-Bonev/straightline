import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const placeId = searchParams.get('placeId')

  if (!placeId) {
    return Response.json({ error: 'placeId required' }, { status: 400 })
  }

  const apiKey = process.env.MAPS_KEY
  if (!apiKey) {
    return Response.json({ error: 'Server misconfiguration: MAPS_KEY not set' }, { status: 500 })
  }

  const fields = [
    'place_id',
    'name',
    'formatted_address',
    'geometry',
    'rating',
    'user_ratings_total',
    'reviews',
    'wheelchair_accessible_entrance',
    'types',
    'photos',
    'opening_hours',
    'website',
    'formatted_phone_number',
  ].join(',')

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', fields)
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString())
  const data = await res.json()

  if (data.status !== 'OK') {
    return Response.json({ error: data.status }, { status: 502 })
  }

  const r = data.result
  const detail = {
    placeId: r.place_id,
    name: r.name,
    address: r.formatted_address,
    location: r.geometry?.location,
    rating: r.rating ?? null,
    userRatingsTotal: r.user_ratings_total ?? 0,
    wheelchairAccessibleEntrance: r.wheelchair_accessible_entrance ?? null,
    types: r.types ?? [],
    openNow: r.opening_hours?.open_now ?? null,
    website: r.website ?? null,
    phone: r.formatted_phone_number ?? null,
    reviews: (r.reviews ?? []).slice(0, 5).map((rev: any) => ({
      author: rev.author_name,
      rating: rev.rating,
      text: rev.text,
      relativeTime: rev.relative_time_description,
    })),
    photoRef: r.photos?.[0]?.photo_reference ?? null,
  }

  return Response.json({ detail })
}
