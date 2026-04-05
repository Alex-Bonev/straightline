'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, PenTool, MessageSquare, Trash2, Tag, ArrowUpDown, TrendingUp, DoorOpen, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Waves } from '@/components/ui/wave-background'

interface Annotation {
  id: string
  placeId: string
  position: { x: number; y: number; z: number }
  note: string
  label: string
  createdAt: string
}

interface SplatViewerProps {
  modelUrl: string
  placeId: string
  placeName?: string
  flipped?: boolean
  onClose: () => void
}

const LABEL_OPTIONS = ['ramp', 'elevator', 'door']
const GIZMO_SCALE = 0.5 // world units for axis handle length
const AXIS_COLORS = { x: '#ef4444', y: '#22c55e', z: '#3b82f6' } as const
type Axis = 'x' | 'y' | 'z'

interface ScreenPos {
  x: number
  y: number
  axisEnds: Record<Axis, { x: number; y: number }>
}

function LabelIcon({ label, size, className }: { label: string; size?: number; className?: string }) {
  if (label === 'elevator') return <ArrowUpDown size={size} className={className} />
  if (label === 'door') return <DoorOpen size={size} className={className} />
  return <TrendingUp size={size} className={className} />
}

export function SplatViewer({ modelUrl, placeId, placeName, flipped, onClose }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<any>(null)
  const threeRef = useRef<{ camera: any; renderer: any } | null>(null)

  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const [annotateMode, setAnnotateMode] = useState(false)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number; z: number } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [selectedLabel, setSelectedLabel] = useState('ramp')
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [editingAnnotation, setEditingAnnotation] = useState(false)
  const [editNote, setEditNote] = useState('')
  const [editLabel, setEditLabel] = useState('ramp')
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null)
  const [showAnnotationList, setShowAnnotationList] = useState(false)
  const [screenPositions, setScreenPositions] = useState<Map<string, ScreenPos>>(new Map())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingAxis, setDraggingAxis] = useState<Axis | null>(null)
  const dragStartRef = useRef<{
    mouseX: number; mouseY: number
    pos: { x: number; y: number; z: number }
    screenDir: { x: number; y: number }
    screenLen: number
  } | null>(null)
  const justDraggedRef = useRef(false)
  const annotationClickedRef = useRef(false)

  // Load existing annotations
  useEffect(() => {
    fetch(`/api/annotations?placeId=${encodeURIComponent(placeId)}`)
      .then((res) => res.json())
      .then((data) => setAnnotations(data.annotations ?? []))
      .catch(() => {})
  }, [placeId])

  // Initialize Gaussian Splat viewer
  useEffect(() => {
    if (!containerRef.current) return

    let disposed = false

    async function init() {
      try {
        const GaussianSplats3D = await import('@mkkellogg/gaussian-splats-3d')

        if (disposed) return

        const viewer = new GaussianSplats3D.Viewer({
          cameraUp: flipped ? [0, -1, 0] : [0, 1, 0],
          initialCameraPosition: flipped ? [0, -0.5, 0.5] : [0, 0.5, 0.5],
          initialCameraLookAt: flipped ? [0, -0.5, -1] : [0, 0.5, -1],
          selfDrivenMode: true,
          useBuiltInControls: true,
          rootElement: containerRef.current!,
          sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
        })

        viewerRef.current = viewer

        // Access the Three.js internals for annotation projection
        const camera = (viewer as any).camera ?? (viewer as any).perspectiveCamera
        const renderer = (viewer as any).renderer

        if (camera && renderer) {
          threeRef.current = { camera, renderer }
        }

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

        // Re-grab refs after start in case they weren't available before
        if (!threeRef.current) {
          const cam = (viewer as any).camera ?? (viewer as any).perspectiveCamera
          const ren = (viewer as any).renderer
          if (cam && ren) {
            threeRef.current = { camera: cam, renderer: ren }
          }
        }

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
          // The library's async dispose() calls document.body.removeChild(rootElement),
          // even when rootElement was provided externally and never appended to body.
          // By the time this cleanup runs, React has already detached the component
          // from the document, so we move rootElement to body first — giving dispose()
          // a valid parent to removeChild from without throwing.
          const el = viewerRef.current.rootElement as HTMLElement | null
          if (el && el.parentElement !== document.body) {
            el.style.display = 'none'
            document.body.appendChild(el)
          }
          viewerRef.current.dispose().catch(() => {})
        } catch {}
        viewerRef.current = null
      }
      threeRef.current = null
    }
  }, [modelUrl])

  // Update screen positions of annotation markers each frame
  useEffect(() => {
    if (loading || !threeRef.current) return

    let animId: number

    async function startTracking() {
      const THREE_MOD = await import('three')

      function updatePositions() {
        const t = threeRef.current
        if (!t) return

        const camera = t.camera
        const canvas = t.renderer?.domElement as HTMLCanvasElement | undefined
        if (!canvas) { animId = requestAnimationFrame(updatePositions); return }

        const newPositions = new Map<string, ScreenPos>()
        const axisDirs: [Axis, number[]][] = [['x', [1,0,0]], ['y', [0,1,0]], ['z', [0,0,1]]]

        for (const ann of annotations) {
          const pos = new THREE_MOD.Vector3(ann.position.x, ann.position.y, ann.position.z)
          pos.project(camera)

          if (pos.z > 1) continue

          const sx = (pos.x * 0.5 + 0.5) * canvas.clientWidth
          const sy = (-pos.y * 0.5 + 0.5) * canvas.clientHeight

          const axisEnds = {} as Record<Axis, { x: number; y: number }>
          for (const [axis, dir] of axisDirs) {
            const end = new THREE_MOD.Vector3(
              ann.position.x + dir[0] * GIZMO_SCALE,
              ann.position.y + dir[1] * GIZMO_SCALE,
              ann.position.z + dir[2] * GIZMO_SCALE,
            )
            end.project(camera)
            axisEnds[axis] = {
              x: (end.x * 0.5 + 0.5) * canvas.clientWidth,
              y: (-end.y * 0.5 + 0.5) * canvas.clientHeight,
            }
          }

          newPositions.set(ann.id, { x: sx, y: sy, axisEnds })
        }

        setScreenPositions(newPositions)
        animId = requestAnimationFrame(updatePositions)
      }

      animId = requestAnimationFrame(updatePositions)
    }

    startTracking()
    return () => cancelAnimationFrame(animId)
  }, [loading, annotations])

  // Place annotation by clicking — use camera ray to find a position in 3D space
  const getPositionFromClick = useCallback(async (clientX: number, clientY: number): Promise<{ x: number; y: number; z: number } | null> => {
    const t = threeRef.current
    if (!t || !containerRef.current) return null

    const THREE_MOD = await import('three')
    const rect = containerRef.current.getBoundingClientRect()
    const mouse = new THREE_MOD.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )

    const raycaster = new THREE_MOD.Raycaster()
    raycaster.setFromCamera(mouse, t.camera)

    // Place along the ray at a reasonable depth
    const distToOrigin = t.camera.position.length()
    const depth = Math.max(distToOrigin * 0.6, 0.5)
    const point = raycaster.ray.at(depth, new THREE_MOD.Vector3())
    return { x: point.x, y: point.y, z: point.z }
  }, [])

  // Handle click to place annotation
  const handleCanvasClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingId || justDraggedRef.current || annotationClickedRef.current) return
      if (!annotateMode || !threeRef.current) return

      const pos = await getPositionFromClick(e.clientX, e.clientY)
      if (pos) {
        setPendingPosition(pos)
        setNoteText('')
        setSelectedLabel('ramp')
      }
    },
    [annotateMode, draggingId, getPositionFromClick]
  )

  // Axis gizmo drag start
  const handleAxisDragStart = useCallback((e: React.MouseEvent<SVGCircleElement>, annId: string, axis: Axis) => {
    e.stopPropagation()
    e.preventDefault()
    const info = screenPositions.get(annId)
    const ann = annotations.find(a => a.id === annId)
    if (!info || !ann) return

    const dx = info.axisEnds[axis].x - info.x
    const dy = info.axisEnds[axis].y - info.y
    const len = Math.sqrt(dx * dx + dy * dy)

    setDraggingId(annId)
    setDraggingAxis(axis)
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      pos: { ...ann.position },
      screenDir: len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 },
      screenLen: len,
    }
  }, [screenPositions, annotations])

  // Axis-constrained drag move + drag end
  useEffect(() => {
    if (!draggingId || !draggingAxis) return

    const handleMouseMove = (e: MouseEvent) => {
      const start = dragStartRef.current
      if (!start) return

      const mouseDx = e.clientX - start.mouseX
      const mouseDy = e.clientY - start.mouseY
      const t = mouseDx * start.screenDir.x + mouseDy * start.screenDir.y
      const worldDelta = start.screenLen > 0 ? (t * GIZMO_SCALE) / start.screenLen : 0

      const newPos = { ...start.pos }
      newPos[draggingAxis] += worldDelta

      setAnnotations(prev =>
        prev.map(a => a.id === draggingId ? { ...a, position: newPos } : a)
      )
    }

    const handleMouseUp = async () => {
      const ann = annotations.find(a => a.id === draggingId)
      if (ann) {
        await fetch('/api/annotations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ann.id, position: ann.position }),
        })
      }
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 50)
      setDraggingId(null)
      setDraggingAxis(null)
      dragStartRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingId, draggingAxis, annotations])

  const saveAnnotation = useCallback(async () => {
    if (!pendingPosition || !noteText.trim()) return

    const res = await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeId,
        position: pendingPosition,
        note: noteText.trim(),
        label: selectedLabel,
      }),
    })
    const data = await res.json()
    if (data.annotation) {
      setAnnotations((prev) => [...prev, data.annotation])
    }
    setPendingPosition(null)
    setNoteText('')
  }, [pendingPosition, noteText, selectedLabel, placeId])

  const deleteAnnotation = useCallback(async (id: string) => {
    await fetch(`/api/annotations?id=${id}`, { method: 'DELETE' })
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
    setSelectedAnnotation(null)
    setEditingAnnotation(false)
  }, [])

  const saveAnnotationEdit = useCallback(async () => {
    if (!selectedAnnotation || !editNote.trim()) return
    await fetch('/api/annotations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedAnnotation.id, note: editNote.trim(), label: editLabel }),
    })
    const updated = { ...selectedAnnotation, note: editNote.trim(), label: editLabel }
    setAnnotations((prev) => prev.map((a) => (a.id === selectedAnnotation.id ? updated : a)))
    setSelectedAnnotation(updated)
    setEditingAnnotation(false)
  }, [selectedAnnotation, editNote, editLabel])

  const downloadDataset = useCallback(async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const params = new URLSearchParams({
        placeId,
        placeName: placeName ?? '',
        modelUrl,
      })
      const res = await fetch(`/api/export/dataset?${params}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'dataset.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[export]', e)
    } finally {
      setDownloading(false)
    }
  }, [downloading, placeId, placeName, modelUrl])

  // Close annotation list when clicking outside — use 'click' not 'pointerdown'
  // so the dropdown item's own click handler fires first
  useEffect(() => {
    if (!showAnnotationList) return
    const close = () => setShowAnnotationList(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [showAnnotationList])

  // Move camera to look at an annotation from a comfortable distance
  const focusAnnotation = useCallback(async (ann: Annotation) => {
    const t = threeRef.current
    if (!t) return
    const THREE_MOD = await import('three')
    const { camera } = t
    const viewer = viewerRef.current
    const controls = viewer?.controls ?? viewer?.orbitControls ?? viewer?.perspectiveControls

    const target = new THREE_MOD.Vector3(ann.position.x, ann.position.y, ann.position.z)
    const dir = camera.position.clone().sub(target)
    const dist = dir.length()

    // Avoid normalizing a zero vector if camera is exactly at the annotation
    if (dist > 0.001) dir.normalize()
    else dir.set(0, 0, 1)

    const newDist = Math.min(Math.max(dist, 0.5), 2.0)
    camera.position.copy(target.clone().add(dir.multiplyScalar(newDist)))

    if (controls) {
      if (controls.target) controls.target.copy(target)
      controls.update?.()
    }

    setShowAnnotationList(false)
    setSelectedAnnotation(ann)
  }, [])

  // Arrow key pan + Escape — captured before OrbitControls sees them
  useEffect(() => {
    const MOVE_SPEED = 0.15

    const handleKey = async (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingPosition) {
          setPendingPosition(null)
        } else if (editingAnnotation) {
          setEditingAnnotation(false)
        } else if (selectedAnnotation) {
          setSelectedAnnotation(null)
        } else if (annotateMode) {
          setAnnotateMode(false)
        } else {
          onClose()
        }
        return
      }

      const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      if (!isArrow) return

      e.preventDefault()
      e.stopPropagation()

      const t = threeRef.current
      if (!t) return
      const THREE_MOD = await import('three')
      const { camera } = t
      const viewer = viewerRef.current
      const controls = viewer?.controls ?? viewer?.perspectiveControls

      // Forward direction flattened to XZ plane so movement stays horizontal
      const forward = new THREE_MOD.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()

      const right = new THREE_MOD.Vector3()
      right.crossVectors(forward, new THREE_MOD.Vector3(0, 1, 0)).normalize()

      const delta = new THREE_MOD.Vector3()
      if (e.key === 'ArrowUp')    delta.addScaledVector(forward, MOVE_SPEED)
      if (e.key === 'ArrowDown')  delta.addScaledVector(forward, -MOVE_SPEED)
      if (e.key === 'ArrowLeft')  delta.addScaledVector(right, -MOVE_SPEED)
      if (e.key === 'ArrowRight') delta.addScaledVector(right, MOVE_SPEED)

      camera.position.add(delta)
      if (controls?.target) controls.target.add(delta)
    }

    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true } as any)
  }, [onClose, pendingPosition, selectedAnnotation, annotateMode, editingAnnotation])

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* 3D Canvas — the Gaussian Splat viewer renders into this */}
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={handleCanvasClick}
        style={{ cursor: annotateMode ? 'crosshair' : 'default' }}
      />

      {/* Wave loading overlay — replaces both previous loading screens */}
      <AnimatePresence>
        {loading && !error && (
          <motion.div
            className="absolute inset-0 z-10"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeInOut' }}
          >
            <Waves backgroundColor="#f0faf8" strokeColor="rgba(0,158,133,0.18)" pointerSize={0.5} />
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="select-none text-[28px] font-extrabold tracking-tight"
                style={{ color: '#006b58', letterSpacing: '-0.02em' }}
              >
                {progress > 0 ? `loading scene · ${progress}%` : 'loading 3D scene'}
              </span>
              <p
                className="mt-2.5 select-none text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'rgba(26,58,107,0.4)' }}
              >
                please wait
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white">
          <p className="text-sm font-medium" style={{ color: '#d93025' }}>{error}</p>
          <Button
            onClick={onClose}
            className="mt-4 rounded-full text-white"
            style={{ backgroundColor: '#009E85' }}
          >
            Close
          </Button>
        </div>
      )}

      {/* Consolidated top bar */}
      <div
        className="absolute top-3 left-3 right-3 z-10 flex items-center gap-2 px-3 h-12 rounded-2xl bg-white"
        style={{ border: '1px solid #eef0f4', boxShadow: '0 4px 24px rgba(0,158,133,0.10), 0 1px 6px rgba(0,0,0,0.06)' }}
      >
        {/* Close */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 flex-shrink-0 rounded-full hover:bg-[#edfaf7]"
          style={{ color: '#6b7a99' }}
          aria-label="Close 3D viewer"
        >
          <X size={16} />
        </Button>

        <div className="h-5 w-px flex-shrink-0" style={{ backgroundColor: '#e0ece9' }} />

        {/* Annotate toggle — only after load */}
        {!loading && !error && (
          <Button
            variant="ghost"
            onClick={() => {
              setAnnotateMode(!annotateMode)
              setPendingPosition(null)
              setSelectedAnnotation(null)
            }}
            className="h-9 rounded-full px-4 text-[12px] font-bold flex-shrink-0"
            style={
              annotateMode
                ? { backgroundColor: '#009E85', color: '#fff', border: '1.5px solid #007a67', boxShadow: '0 2px 8px rgba(0,158,133,0.35)' }
                : { color: '#007a67', backgroundColor: '#e0f5f1', border: '1.5px solid #009E85' }
            }
          >
            <PenTool size={14} className="mr-1.5" />
            {annotateMode ? 'Annotating…' : 'Annotate'}
          </Button>
        )}

        {/* Annotation count — button that opens dropdown */}
        {!loading && !error && annotations.length > 0 && (
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setShowAnnotationList(v => !v) }}
              className="flex h-9 items-center gap-1.5 rounded-full px-4 text-[12px] font-bold transition-all hover:bg-[#c8f0e8]"
              style={{ backgroundColor: '#e0f5f1', color: '#007a67', border: '1.5px solid #009E85' }}
            >
              <MessageSquare size={13} />
              Visit Annotations
            </button>

            {showAnnotationList && (
              <div
                className="absolute left-0 top-[calc(100%+8px)] w-64 overflow-hidden rounded-xl bg-white/80 backdrop-blur-md"
                style={{ border: '1px solid rgba(0,158,133,0.18)', boxShadow: '0 8px 28px rgba(0,0,0,0.12)' }}
                onClick={e => e.stopPropagation()}
              >
                <p className="px-3 pt-3 pb-1.5 text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: '#9aa0b8' }}>
                  Annotations
                </p>
                <div className="max-h-56 overflow-y-auto pb-2">
                  {annotations.map(ann => (
                    <button
                      key={ann.id}
                      onClick={() => focusAnnotation(ann)}
                      className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#edfaf7]"
                    >
                      <span
                        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: '#009E85' }}
                      >
                        <LabelIcon label={ann.label} size={10} className="text-white" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold capitalize" style={{ color: '#1a2035' }}>
                          {ann.label}
                        </p>
                        <p className="truncate text-[10px]" style={{ color: '#6b7a99' }}>
                          {ann.note.length > 38 ? ann.note.slice(0, 38) + '…' : ann.note}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Download dataset */}
        {!loading && !error && (
          <Button
            variant="ghost"
            onClick={downloadDataset}
            disabled={downloading}
            className="h-9 rounded-full px-4 text-[12px] font-bold flex-shrink-0"
            style={{ color: '#007a67', backgroundColor: '#e0f5f1', border: '1.5px solid #009E85', opacity: downloading ? 0.6 : 1 }}
            title="Download model + annotations as a research dataset"
          >
            <Download size={14} className="mr-1.5" />
            {downloading ? 'Exporting…' : 'Export Dataset'}
          </Button>
        )}

        {/* Spacer + place name */}
        <div className="flex flex-1 items-center justify-center overflow-hidden px-2">
          {!loading && !error && placeName && (
            <span
              className="truncate text-[13px] font-bold"
              style={{ color: '#1a2035' }}
            >
              {placeName}
            </span>
          )}
        </div>

        {/* Controls hint — right side */}
        {!loading && !error && !pendingPosition && (
          <span
            className="hidden select-none text-[11px] font-medium md:block"
            style={{ color: '#9aa0b8' }}
          >
            {annotateMode
              ? 'Click to place · Drag axis handles to reposition · Esc to exit'
              : 'Drag to orbit · Scroll to zoom · Esc to close'}
          </span>
        )}
      </div>

      {/* Annotation markers as HTML overlays */}
      {!loading &&
        annotations.map((ann) => {
          const pos = screenPositions.get(ann.id)
          if (!pos) return null
          return (
            <div
              key={ann.id}
              className="pointer-events-auto absolute z-20"
              style={{
                left: pos.x,
                top: pos.y,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  annotationClickedRef.current = true
                  setTimeout(() => { annotationClickedRef.current = false }, 50)
                  if (!draggingId) setSelectedAnnotation(ann)
                }}
                onMouseEnter={() => setHoveredAnnotation(ann.id)}
                onMouseLeave={() => setHoveredAnnotation(null)}
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all ${
                  selectedAnnotation?.id === ann.id
                    ? 'scale-125 border-white bg-[#1a73e8]'
                    : 'border-white/70 bg-[#1a73e8]/80 hover:scale-110'
                }`}
                aria-label={`Annotation: ${ann.note}`}
              >
                <LabelIcon label={ann.label} size={12} className="text-white" />
              </button>
              {hoveredAnnotation === ann.id && !draggingId && selectedAnnotation?.id !== ann.id && (
                <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                  {ann.note.length > 40 ? ann.note.slice(0, 40) + '...' : ann.note}
                </div>
              )}
            </div>
          )
        })}

      {/* Axis gizmo handles */}
      {!loading && annotateMode && (
        <svg className="pointer-events-none absolute inset-0 z-[21]" style={{ width: '100%', height: '100%' }}>
          {annotations.map((ann) => {
            const info = screenPositions.get(ann.id)
            if (!info) return null
            return (
              <g key={ann.id}>
                {(['x', 'y', 'z'] as const).map((axis) => {
                  const end = info.axisEnds[axis]
                  const color = AXIS_COLORS[axis]
                  const active = draggingId === ann.id && draggingAxis === axis
                  return (
                    <g key={axis}>
                      <line
                        x1={info.x} y1={info.y} x2={end.x} y2={end.y}
                        stroke={color} strokeWidth={active ? 3 : 2} strokeOpacity={active ? 1 : 0.7}
                      />
                      <circle
                        cx={end.x} cy={end.y} r={active ? 8 : 6}
                        fill={color} stroke="white" strokeWidth={1.5}
                        className="pointer-events-auto cursor-grab active:cursor-grabbing"
                        onMouseDown={(e) => handleAxisDragStart(e, ann.id, axis)}
                      />
                      <text
                        x={end.x} y={end.y - 10}
                        textAnchor="middle" fill={color}
                        fontSize={10} fontWeight="bold"
                        className="pointer-events-none select-none"
                      >
                        {axis.toUpperCase()}
                      </text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      )}

      {/* Selected annotation detail panel */}
      {selectedAnnotation && (
        <div
          className="absolute z-30 w-72 rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-md"
          style={{
            left: Math.min(
              (screenPositions.get(selectedAnnotation.id)?.x ?? 200) + 20,
              typeof window !== 'undefined' ? window.innerWidth - 310 : 500
            ),
            top: Math.max(
              (screenPositions.get(selectedAnnotation.id)?.y ?? 200) - 40,
              56
            ),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {editingAnnotation ? (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {LABEL_OPTIONS.map((label) => (
                  <button
                    key={label}
                    onClick={() => setEditLabel(label)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                      editLabel === label ? 'bg-[#1a73e8] text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="mb-3 h-20 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#1a73e8] focus:outline-none"
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  onClick={saveAnnotationEdit}
                  disabled={!editNote.trim()}
                  className="flex-1 rounded-full bg-[#1a73e8] text-xs font-semibold text-white hover:bg-[#1557b0] disabled:opacity-40"
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditingAnnotation(false)}
                  className="rounded-full border-white/20 text-xs text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 flex items-start justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1a73e8]/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#7ab4ff]">
                  <Tag size={10} />
                  {selectedAnnotation.label || 'annotation'}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditNote(selectedAnnotation.note); setEditLabel(selectedAnnotation.label); setEditingAnnotation(true) }}
                    className="rounded-full p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
                    aria-label="Edit annotation"
                  >
                    <PenTool size={13} />
                  </button>
                  <button
                    onClick={() => deleteAnnotation(selectedAnnotation.id)}
                    className="rounded-full p-1 text-red-400/70 transition-colors hover:bg-red-400/20 hover:text-red-400"
                    aria-label="Delete annotation"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-white/90">{selectedAnnotation.note}</p>
              <p className="mt-2 text-[10px] text-white/30">
                {new Date(selectedAnnotation.createdAt).toLocaleDateString()}
              </p>
              <button
                onClick={() => { setSelectedAnnotation(null); setEditingAnnotation(false) }}
                className="mt-3 w-full rounded-full border border-white/30 py-1.5 text-[11px] font-bold text-white/70 transition-all hover:border-white/50 hover:bg-white/10 hover:text-white"
              >
                Dismiss
              </button>
            </>
          )}
        </div>
      )}

      {/* New annotation form */}
      {pendingPosition && (
        <div
          className="absolute bottom-8 left-1/2 z-30 w-96 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/70 p-5 backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="mb-3 text-sm font-bold text-white">Add Annotation</h3>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {LABEL_OPTIONS.map((label) => (
              <button
                key={label}
                onClick={() => setSelectedLabel(label)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                  selectedLabel === label
                    ? 'bg-[#1a73e8] text-white'
                    : 'bg-white/10 text-white/60 hover:bg-white/20'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Describe this feature..."
            className="mb-3 h-20 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#1a73e8] focus:outline-none"
            autoFocus
          />

          <div className="flex gap-2">
            <Button
              onClick={saveAnnotation}
              disabled={!noteText.trim()}
              className="flex-1 rounded-full bg-[#1a73e8] text-xs font-semibold text-white hover:bg-[#1557b0] disabled:opacity-40"
            >
              Save
            </Button>
            <Button
              variant="outline"
              onClick={() => setPendingPosition(null)}
              className="rounded-full border-white/20 text-xs text-white hover:bg-white/10"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
