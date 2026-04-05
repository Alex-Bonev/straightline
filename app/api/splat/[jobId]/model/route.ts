import { NextRequest } from 'next/server'

const RUNPOD_URL = process.env.RUNPOD_URL ?? 'http://localhost:8000'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  const res = await fetch(`${RUNPOD_URL}/api/jobs/${jobId}/result`)

  if (!res.ok) {
    return new Response('Result not ready', { status: res.status })
  }

  const blob = await res.blob()
  return new Response(blob, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="point_cloud.ply"',
    },
  })
}
