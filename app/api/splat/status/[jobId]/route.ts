import { NextRequest } from 'next/server'

const RUNPOD_URL = process.env.RUNPOD_URL ?? 'http://localhost:8000'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  try {
    const res = await fetch(`${RUNPOD_URL}/api/jobs/${jobId}/status`, {
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      return Response.json({ error: 'Job not found' }, { status: res.status })
    }

    const data = await res.json()
    return Response.json(data)
  } catch {
    return Response.json({ status: 'running', stage: '', progress: 0, message: 'Waiting for server...' })
  }
}
