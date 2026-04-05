import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/locations?name=xxx
// Returns the location row if it exists (including browser_use data).
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name')
  if (!name) return Response.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('locations')
    .select('id, name, browser_use, map_3d')
    .eq('name', name)
    .maybeSingle()

  if (error) {
    console.error('[locations] GET error:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ location: data ?? null })
}

// POST /api/locations
// Upserts a location by name. Used to write browser_use or map_3d data.
// Body: { name, browser_use?, map_3d? }
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, browser_use, map_3d } = body

  if (!name) return Response.json({ error: 'name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('locations')
    .upsert(
      {
        name,
        ...(browser_use !== undefined && { browser_use }),
        ...(map_3d      !== undefined && { map_3d }),
      },
      { onConflict: 'name' }
    )
    .select('id, name, browser_use, map_3d')
    .single()

  if (error) {
    console.error('[locations] POST error:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ location: data })
}
