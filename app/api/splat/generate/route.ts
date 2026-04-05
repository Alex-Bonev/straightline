import { NextRequest } from 'next/server'
import { getCachedSplat } from '@/lib/splat-cache'

const RUNPOD_URL = process.env.RUNPOD_URL ?? 'http://localhost:8000'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { lat, lng, max_panos, num_views } = body

  if (lat == null || lng == null) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  // Check cache first
  const cached = getCachedSplat(lat, lng)
  if (cached) {
    return Response.json({
      job_id: cached.jobId,
      status: 'done',
      model_url: cached.modelUrl,
    })
  }

  // Forward to RunPod backend
  const res = await fetch(`${RUNPOD_URL}/api/streetview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat,
      lng,
      max_panos: max_panos ?? 50,
      num_views: num_views ?? 8,
    }),
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Backend error' }))
    return Response.json(error, { status: res.status })
  }

  const data = await res.json()
  return Response.json({ job_id: data.job_id })
}
