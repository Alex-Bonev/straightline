import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { zipSync, strToU8 } from 'fflate'

export const maxDuration = 60

// GET /api/export/dataset?placeId=xxx&placeName=xxx&modelUrl=xxx
export async function GET(request: NextRequest) {
  const placeId   = request.nextUrl.searchParams.get('placeId') ?? ''
  const placeName = request.nextUrl.searchParams.get('placeName') ?? 'location'
  const modelUrl  = request.nextUrl.searchParams.get('modelUrl') ?? ''

  if (!placeId) return Response.json({ error: 'placeId required' }, { status: 400 })

  // ── Fetch annotations ──────────────────────────────────────────────────────
  const { data: annotations, error } = await supabase
    .from('annotations')
    .select('id, position, note, label, created_at')
    .eq('place_id', placeId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[export] annotations fetch failed:', error.message)
    return Response.json({ error: 'Failed to fetch annotations' }, { status: 500 })
  }

  // ── Build dataset files ────────────────────────────────────────────────────
  const exportedAt = new Date().toISOString()
  const slug = placeName.replace(/\s+/g, '_').toLowerCase()

  const metadata = {
    schema_version: '1.0',
    place: { id: placeId, name: placeName },
    exported_at: exportedAt,
    model: {
      file: `${slug}.spz`,
      format: 'gaussian_splat_spz',
      source: 'World Labs Marble API',
    },
    annotation_count: annotations?.length ?? 0,
    license: 'CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/',
    citation: `Straightline Accessibility Dataset — ${placeName} (${exportedAt.slice(0, 10)}). https://github.com/straightline-app`,
  }

  const annotationsJson = {
    schema_version: '1.0',
    place: { id: placeId, name: placeName },
    exported_at: exportedAt,
    label_taxonomy: {
      ramp: 'An accessible ramp allowing wheeled access between floor levels.',
      elevator: 'An elevator providing vertical access between floors.',
      door: 'A doorway, including accessible (automatic/wide) doors.',
    },
    annotations: (annotations ?? []).map(a => ({
      id: a.id,
      label: a.label,
      note: a.note,
      position_3d: a.position,
      created_at: a.created_at,
    })),
  }

  const readme = `# Straightline Accessibility Dataset — ${placeName}

Exported: ${exportedAt}
License: CC BY 4.0

## Contents

- \`metadata.json\`    — Export metadata, model info, citation
- \`annotations.json\` — 3D accessibility feature annotations
- \`${slug}.spz\`      — Gaussian Splat model (SPZ format, World Labs)

## Annotation Labels

| Label    | Description |
|----------|-------------|
| ramp     | Accessible ramp between floor levels |
| elevator | Elevator providing vertical floor access |
| door     | Doorway (accessible/automatic/wide) |

## Position Format

\`position_3d\` values are in the model's local coordinate space (metres).

## Citation

${metadata.citation}

## Model Viewer

Open .spz files with the @mkkellogg/gaussian-splats-3d library or any
Gaussian Splat viewer that supports the SPZ container format.
`

  // ── Optionally download model bytes ───────────────────────────────────────
  const zipEntries: Record<string, Uint8Array> = {
    'README.md':         strToU8(readme),
    'metadata.json':     strToU8(JSON.stringify(metadata, null, 2)),
    'annotations.json':  strToU8(JSON.stringify(annotationsJson, null, 2)),
  }

  if (modelUrl) {
    try {
      const modelRes = await fetch(modelUrl)
      if (modelRes.ok) {
        const buf = await modelRes.arrayBuffer()
        zipEntries[`${slug}.spz`] = new Uint8Array(buf)
        console.log(`[export] bundled model: ${buf.byteLength} bytes`)
      }
    } catch (e) {
      console.warn('[export] could not fetch model, skipping:', e)
    }
  }

  // ── Create ZIP ─────────────────────────────────────────────────────────────
  const zipped = zipSync(zipEntries, { level: 1 })

  const zipName = `${slug}_accessibility_dataset_${exportedAt.slice(0, 10)}.zip`

  return new Response(zipped as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Content-Length': String(zipped.byteLength),
    },
  })
}
