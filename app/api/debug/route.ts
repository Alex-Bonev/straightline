import { supabase } from '@/lib/supabase'

export async function GET() {
  // Check table structure and current rows
  const { data: rows, error } = await supabase
    .from('locations')
    .select('id, name, browser_use, map_3d, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  // Try a test write
  const { data: testWrite, error: writeErr } = await supabase
    .from('locations')
    .upsert({ name: '__test__', browser_use: { test: true } }, { onConflict: 'name' })
    .select('id, name, browser_use')
    .single()

  // Clean up
  await supabase.from('locations').delete().eq('name', '__test__')

  return Response.json({
    read_error:  error?.message   ?? null,
    write_error: writeErr?.message ?? null,
    write_ok:    !writeErr,
    row_count:   rows?.length ?? 0,
    rows: rows?.map(r => ({
      name:         r.name,
      has_bu_data:  !!r.browser_use,
      created_at:   r.created_at,
    })),
  })
}
