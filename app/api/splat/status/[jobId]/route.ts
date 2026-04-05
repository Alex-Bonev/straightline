import { NextRequest } from 'next/server'

const RUNPOD_URL = process.env.RUNPOD_URL ?? 'http://localhost:8000'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  const res = await fetch(`${RUNPOD_URL}/api/jobs/${jobId}/status`)

  if (!res.ok) {
    return Response.json({ error: 'Job not found' }, { status: res.status })
  }

  const data = await res.json()
  return Response.json(data)
}
