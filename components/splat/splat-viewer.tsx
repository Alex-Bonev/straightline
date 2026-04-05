'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SplatViewerProps {
  modelUrl: string
  onClose: () => void
}

export function SplatViewer({ modelUrl, onClose }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    let disposed = false

    async function init() {
      try {
        const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d')

        if (disposed) return

        const viewer = new GaussianSplats3D.Viewer({
          cameraUp: [0, -1, 0],
          initialCameraPosition: [0, -2, 6],
          initialCameraLookAt: [0, 0, 0],
          selfDrivenMode: true,
          useBuiltInControls: true,
          rootElement: containerRef.current!,
          sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
        })

        viewerRef.current = viewer

        await viewer.addSplatScene(modelUrl, {
          progressiveLoad: true,
          onProgress: (pct: number) => {
            setProgress(Math.round(pct * 100))
          },
        })

        if (disposed) {
          viewer.dispose()
          return
        }

        viewer.start()
        setLoading(false)
      } catch (err: any) {
        if (!disposed) {
          setError(err.message ?? 'Failed to load 3D scene')
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      disposed = true
      if (viewerRef.current) {
        try {
          viewerRef.current.dispose()
        } catch {}
        viewerRef.current = null
      }
    }
  }, [modelUrl])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div ref={containerRef} className="h-full w-full" />

      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <Loader2 size={40} className="animate-spin text-white/70" />
          <p className="mt-4 text-sm font-medium text-white/70">
            Loading 3D scene... {progress > 0 ? `${progress}%` : ''}
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <p className="text-sm font-medium text-red-400">{error}</p>
          <Button
            variant="outline"
            onClick={onClose}
            className="mt-4 border-white/20 text-white hover:bg-white/10"
          >
            Close
          </Button>
        </div>
      )}

      <Button
        variant="outline"
        size="icon"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full border-white/20 bg-black/40 text-white backdrop-blur-sm hover:bg-white/10"
        aria-label="Close 3D viewer"
      >
        <X size={18} />
      </Button>

      {!loading && !error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-4 py-2 text-xs font-medium text-white/50 backdrop-blur-sm">
          Drag to orbit &middot; Scroll to zoom &middot; Esc to close
        </div>
      )}
    </div>
  )
}
