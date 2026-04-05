import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const placeId = searchParams.get('placeId')

  let query = supabase
    .from('annotations')
    .select('id, place_id, position, note, label, created_at')
    .order('created_at', { ascending: true })

  if (placeId) {
    query = query.eq('place_id', placeId)
  }

  const { data, error } = await query

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const annotations = (data ?? []).map((row) => ({
    id: row.id,
    placeId: row.place_id,
    position: row.position,
    note: row.note,
    label: row.label,
    createdAt: row.created_at,
  }))

  return Response.json({ annotations })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { placeId, position, note, label } = body

  if (!placeId || !position || !note) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('annotations')
    .insert({
      place_id: placeId,
      position,
      note,
      label: label || 'other',
    })
    .select('id, place_id, position, note, label, created_at')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    annotation: {
      id: data.id,
      placeId: data.place_id,
      position: data.position,
      note: data.note,
      label: data.label,
      createdAt: data.created_at,
    },
  })
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const { id, position } = body

  if (!id || !position) {
    return Response.json({ error: 'Missing id or position' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('annotations')
    .update({ position })
    .eq('id', id)
    .select('id, place_id, position, note, label, created_at')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({
    annotation: {
      id: data.id,
      placeId: data.place_id,
      position: data.position,
      note: data.note,
      label: data.label,
      createdAt: data.created_at,
    },
  })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return Response.json({ error: 'Missing id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('annotations')
    .delete()
    .eq('id', id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
