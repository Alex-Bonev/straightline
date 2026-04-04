import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const query = searchParams.get('query')
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!query) {
    return Response.json({ suggestions: [] })
  }

  const apiKey = process.env.MAPS_KEY
  if (!apiKey) {
    return Response.json({ error: 'Server misconfiguration: MAPS_KEY not set' }, { status: 500 })
  }

  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
  url.searchParams.set('input', query)
  url.searchParams.set('key', apiKey)
  if (lat && lng) {
    url.searchParams.set('location', `${lat},${lng}`)
    url.searchParams.set('radius', '10000')
  }

  const res = await fetch(url.toString())
  const data = await res.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return Response.json({ suggestions: [] })
  }

  const suggestions = (data.predictions ?? []).slice(0, 6).map((p: any) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting?.main_text ?? p.description,
    secondaryText: p.structured_formatting?.secondary_text ?? '',
  }))

  return Response.json({ suggestions })
}
