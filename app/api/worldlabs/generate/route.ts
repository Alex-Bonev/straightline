import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

// Allow large request bodies (up to 50MB for 8 images as base64)
export const maxDuration = 300 // 5 min timeout for generation polling

const WL_BASE = 'https://api.worldlabs.ai/marble/v1'

function wlHeaders() {
  return {
    'WLT-Api-Key': process.env.WORLD_LABS_KEY ?? '',
    'Content-Type': 'application/json',
  }
}

// ── POST /api/worldlabs/generate ────────────────────────────────────────────
// Body: { placeName, placeId, images: [{ azimuth: number, dataUrl: string }] }
// 1. Uploads each image to World Labs via prepare_upload + PUT
// 2. Starts generation with multi-image prompt
// 3. Returns { operationId }
export async function POST(request: NextRequest) {
  if (!process.env.WORLD_LABS_KEY) {
    return Response.json({ error: 'WORLD_LABS_KEY not set' }, { status: 500 })
  }

  let placeName: string, placeId: string, images: { azimuth: number; dataUrl: string }[]
  try {
    const body = await request.json()
    placeName = body.placeName
    placeId = body.placeId
    images = body.images
  } catch (e) {
    console.error('[worldlabs] failed to parse request body:', e)
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!images || images.length === 0 || images.length > 8) {
    return Response.json({ error: 'Provide 1-8 images' }, { status: 400 })
  }

  console.log(`[worldlabs] uploading ${images.length} images for: ${placeName}`)

  // ── Upload each image to World Labs ─────────────────────────────────────
  const mediaAssetIds: { azimuth: number; mediaAssetId: string }[] = []

  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const ext = img.dataUrl.startsWith('data:image/png') ? 'png' : 'jpg'

    // Step 1: Prepare upload
    const prepRes = await fetch(`${WL_BASE}/media-assets:prepare_upload`, {
      method: 'POST',
      headers: wlHeaders(),
      body: JSON.stringify({
        file_name: `${placeName.replace(/\s+/g, '_')}_${i}.${ext}`,
        kind: 'image',
        extension: ext,
      }),
    })

    if (!prepRes.ok) {
      const text = await prepRes.text()
      console.error(`[worldlabs] prepare_upload failed for image ${i}:`, text)
      return Response.json({ error: `Failed to prepare upload for image ${i + 1}` }, { status: 502 })
    }

    const prepData = await prepRes.json()
    const uploadUrl = prepData.upload_info?.upload_url ?? prepData.upload_url
    const mediaAssetId = prepData.media_asset?.media_asset_id ?? prepData.media_asset?.id

    if (!uploadUrl || !mediaAssetId) {
      console.error(`[worldlabs] missing upload_url or media_asset_id for image ${i}:`, JSON.stringify(prepData).slice(0, 500))
      return Response.json({ error: 'World Labs API returned invalid upload data' }, { status: 502 })
    }

    // Step 2: Convert data URL to binary and upload
    const base64Data = img.dataUrl.split(',')[1]
    const binaryData = Buffer.from(base64Data, 'base64')

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': ext === 'png' ? 'image/png' : 'image/jpeg',
        'x-goog-content-length-range': '0,104857600',
      },
      body: binaryData,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => '')
      console.error(`[worldlabs] upload failed for image ${i}:`, uploadRes.status, errText.slice(0, 300))
      return Response.json({ error: `Failed to upload image ${i + 1}` }, { status: 502 })
    }

    console.log(`[worldlabs] ✓ uploaded image ${i + 1}/${images.length} (${ext}, ${binaryData.length} bytes)`)
    mediaAssetIds.push({ azimuth: img.azimuth, mediaAssetId })
  }

  // ── Start generation ──────────────────────────────────────────────────────
  const genRes = await fetch(`${WL_BASE}/worlds:generate`, {
    method: 'POST',
    headers: wlHeaders(),
    body: JSON.stringify({
      display_name: `${placeName} — Straightline 3D`,
      world_prompt: {
        type: 'multi-image',
        reconstruct_images: true,
        multi_image_prompt: mediaAssetIds.map(({ azimuth, mediaAssetId }) => ({
          azimuth,
          content: {
            source: 'media_asset',
            media_asset_id: mediaAssetId,
          },
        })),
        text_prompt: `Interior of ${placeName}, showing accessibility features like ramps, elevators, doorways, and corridors`,
      },
    }),
  })

  if (!genRes.ok) {
    const text = await genRes.text()
    console.error('[worldlabs] generation failed:', genRes.status, text.slice(0, 500))
    return Response.json({ error: `World Labs generation failed: ${genRes.status}`, details: text.slice(0, 300) }, { status: 502 })
  }

  const genData = await genRes.json()
  console.log('[worldlabs] generation response keys:', Object.keys(genData).join(','), JSON.stringify(genData).slice(0, 300))
  const operationId = genData.name ?? genData.operation_id ?? genData.id
  console.log(`[worldlabs] ✓ generation started — operation: ${operationId}`)

  return Response.json({ operationId, placeId, placeName })
}

// ── GET /api/worldlabs/generate?operationId=xxx&placeName=xxx&placeId=xxx ───
// Polls generation status. When done, downloads SPZ and uploads to Supabase.
export async function GET(request: NextRequest) {
  const operationId = request.nextUrl.searchParams.get('operationId')
  const placeName   = request.nextUrl.searchParams.get('placeName') ?? ''
  const placeId     = request.nextUrl.searchParams.get('placeId') ?? ''

  if (!operationId) return Response.json({ error: 'operationId required' }, { status: 400 })
  if (!process.env.WORLD_LABS_KEY) return Response.json({ error: 'WORLD_LABS_KEY not set' }, { status: 500 })

  // Poll World Labs
  const res = await fetch(`${WL_BASE}/operations/${operationId}`, {
    headers: { 'WLT-Api-Key': process.env.WORLD_LABS_KEY },
  })

  if (!res.ok) {
    console.error('[worldlabs] poll failed:', res.status)
    return Response.json({ status: 'error' })
  }

  const data = await res.json()

  if (!data.done) {
    return Response.json({ status: 'processing' })
  }

  // Generation complete — extract SPZ URL
  const world = data.response
  const spzUrl = world?.assets?.splats?.spz_urls?.full
    ?? world?.assets?.splats?.spz_urls?.['500k']
    ?? world?.assets?.splats?.spz_urls?.['100k']

  if (!spzUrl) {
    console.error('[worldlabs] no SPZ URL in response:', JSON.stringify(data.response?.assets ?? {}).slice(0, 500))
    return Response.json({ status: 'error', error: 'No model output' })
  }

  console.log(`[worldlabs] ✓ generation complete — SPZ URL: ${spzUrl}`)

  // ── Download SPZ and upload to Supabase storage ──────────────────────────
  try {
    const modelRes = await fetch(spzUrl)
    if (!modelRes.ok) throw new Error(`Failed to download SPZ: ${modelRes.status}`)

    const modelBuffer = Buffer.from(await modelRes.arrayBuffer())
    const fileName = `${placeName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.spz`

    const { error: uploadError } = await supabase.storage
      .from('models')
      .upload(fileName, modelBuffer, {
        contentType: 'application/octet-stream',
        upsert: true,
      })

    if (uploadError) {
      console.error('[worldlabs] storage upload failed:', uploadError.message)
      // Fall back to using the World Labs URL directly
      await updateLocationMap3d(placeName, placeId, spzUrl, 'spz')
      return Response.json({ status: 'done', modelUrl: spzUrl })
    }

    const { data: publicUrlData } = supabase.storage.from('models').getPublicUrl(fileName)
    const publicUrl = publicUrlData.publicUrl

    console.log(`[worldlabs] ✓ uploaded to Supabase storage: ${publicUrl}`)

    // Update location record
    await updateLocationMap3d(placeName, placeId, publicUrl, 'spz')

    return Response.json({ status: 'done', modelUrl: publicUrl })
  } catch (e) {
    console.error('[worldlabs] post-processing error:', e)
    // Fall back to World Labs URL
    await updateLocationMap3d(placeName, placeId, spzUrl, 'spz')
    return Response.json({ status: 'done', modelUrl: spzUrl })
  }
}

async function updateLocationMap3d(name: string, placeId: string, url: string, format: string) {
  const map3d = { url, format }

  const { data: existing } = await supabase
    .from('locations')
    .select('id')
    .eq('name', name)
    .maybeSingle()

  if (existing?.id) {
    await supabase.from('locations').update({ map_3d: map3d }).eq('id', existing.id)
    console.log(`[worldlabs] updated map_3d for: ${name}`)
  } else {
    await supabase.from('locations').insert({ name, map_3d: map3d })
    console.log(`[worldlabs] inserted location with map_3d: ${name}`)
  }
}
