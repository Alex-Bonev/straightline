'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface SplatJobPanelProps {
  jobId: string
  onComplete: (modelUrl: string) => void
  onCancel: () => void
}

interface JobStatus {
  status: string
  stage: string
  progress: number
  message: string
}

const STAGE_LABELS: Record<string, string> = {
  crawling_panos: 'Finding panoramas',
  extracting_perspectives: 'Processing images',
  running_mast3r: 'Estimating 3D structure',
  converting: 'Preparing for training',
  training: 'Training 3D model',
  complete: 'Complete',
}

export function SplatJobPanel({ jobId, onComplete, onCancel }: SplatJobPanelProps) {
  const [status, setStatus] = useState<JobStatus>({
    status: 'queued',
    stage: '',
    progress: 0,
    message: 'Starting...',
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let active = true

    async function poll() {
      try {
        const res = await fetch(`/api/splat/status/${jobId}`)
        if (!res.ok) return
        const data: JobStatus = await res.json()
        if (!active) return

        setStatus(data)

        if (data.status === 'done') {
          if (intervalRef.current) clearInterval(intervalRef.current)
          onComplete(`/api/splat/${jobId}/model`)
        } else if (data.status === 'error') {
          if (intervalRef.current) clearInterval(intervalRef.current)
        }
      } catch {
        // Silently retry on next interval
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 5000)

    return () => {
      active = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [jobId, onComplete])

  const progressPct = Math.round(status.progress * 100)
  const stageLabel = STAGE_LABELS[status.stage] ?? status.stage ?? 'Initializing'
  const isError = status.status === 'error'
  const isDone = status.status === 'done'

  return (
    <Card className="relative overflow-hidden rounded-2xl border-[#eaecf0] p-0">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #eef0f4' }}>
        <div className="flex items-center gap-2">
          {isError ? (
            <AlertCircle size={14} className="text-red-500" />
          ) : isDone ? (
            <CheckCircle2 size={14} className="text-green-500" />
          ) : (
            <Loader2 size={14} className="animate-spin" style={{ color: '#1a73e8' }} />
          )}
          <span className="text-[13px] font-bold" style={{ color: '#1a2035' }}>
            3D Scene Generation
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          className="h-6 w-6 rounded-full"
          aria-label="Cancel"
        >
          <X size={12} />
        </Button>
      </div>

      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <Badge
            className="h-auto rounded-full border-none px-2 py-[3px] text-[10px] font-semibold"
            style={{
              backgroundColor: isError ? '#fef2f2' : isDone ? '#f0fdf4' : '#e8f0fe',
              color: isError ? '#dc2626' : isDone ? '#16a34a' : '#1a52b4',
            }}
          >
            {stageLabel}
          </Badge>
          <span className="text-[11px] font-semibold" style={{ color: '#9aa0b8' }}>
            {progressPct}%
          </span>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: '#eef0f4' }}>
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPct}%`,
              backgroundColor: isError ? '#dc2626' : isDone ? '#16a34a' : '#1a73e8',
            }}
          />
        </div>

        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: '#6b7a99' }}>
          {status.message}
        </p>

        {isError && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="mt-3 h-7 rounded-full text-[11px] font-semibold"
          >
            Dismiss
          </Button>
        )}
      </div>
    </Card>
  )
}
