'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Loader2, PenTool, MessageSquare, Trash2, Tag, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
  onClose: () => void
}

const LABEL_OPTIONS = ['ramp', 'elevator', 'accessible_entrance', 'restroom', 'door', 'stairs', 'parking', 'other']

export function SplatViewer({ modelUrl, placeId, onClose }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const threeRef = useRef<{
    scene: any
    camera: any
    renderer: any
    controls: any
    pointCloud: any
    animId: number
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [annotateMode, setAnnotateMode] = useState(false)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number; z: number } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [selectedLabel, setSelectedLabel] = useState('other')
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null)
  const [screenPositions, setScreenPositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)

  // Load existing annotations
  useEffect(() => {
    fetch(`/api/annotations?placeId=${encodeURIComponent(placeId)}`)
      .then((res) => res.json())
      .then((data) => setAnnotations(data.annotations ?? []))
      .catch(() => {})
  }, [placeId])

  // Initialize Three.js with PLYLoader
  useEffect(() => {
    if (!containerRef.current) return

    let disposed = false

    async function init() {
      try {
        const THREE = await import('three')
        const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js')
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')

        if (disposed) return

        const container = containerRef.current!
        const width = container.clientWidth
        const height = container.clientHeight

        // Scene
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x111111)

        // Camera
        const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000)
        camera.position.set(0, 0, 3)

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(width, height)
        renderer.setPixelRatio(window.devicePixelRatio)
        container.appendChild(renderer.domElement)

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.1

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.8)
        scene.add(ambient)
        const directional = new THREE.DirectionalLight(0xffffff, 0.6)
        directional.position.set(5, 10, 7)
        scene.add(directional)

        // Load PLY
        const loader = new PLYLoader()
        loader.load(
          modelUrl,
          (geometry) => {
            if (disposed) return

            geometry.computeVertexNormals()

            // Center the geometry
            geometry.computeBoundingBox()
            const box = geometry.boundingBox!
            const center = new THREE.Vector3()
            box.getCenter(center)
            geometry.translate(-center.x, -center.y, -center.z)

            // Determine size for camera positioning
            const size = new THREE.Vector3()
            box.getSize(size)
            const maxDim = Math.max(size.x, size.y, size.z)

            let mesh: import('three').Object3D
            if (geometry.hasAttribute('color')) {
              // Point cloud with vertex colors
              const material = new THREE.PointsMaterial({
                size: 0.005 * maxDim,
                vertexColors: true,
                sizeAttenuation: true,
              })
              mesh = new THREE.Points(geometry, material)
            } else {
              // Solid mesh fallback
              const material = new THREE.MeshStandardMaterial({
                color: 0x8899bb,
                flatShading: true,
                side: THREE.DoubleSide,
              })
              mesh = new THREE.Mesh(geometry, material)
            }

            scene.add(mesh)

            // Position camera to frame the model
            camera.position.set(0, maxDim * 0.3, maxDim * 1.5)
            controls.target.set(0, 0, 0)
            controls.update()

            threeRef.current = { scene, camera, renderer, controls, pointCloud: mesh, animId: 0 }
            setLoading(false)
          },
          (event) => {
            if (event.lengthComputable) {
              setProgress(Math.round((event.loaded / event.total) * 100))
            }
          },
          (err) => {
            if (!disposed) {
              setError('Failed to load 3D model')
              setLoading(false)
            }
          }
        )

        // Animation loop
        function animate() {
          if (disposed) return
          const id = requestAnimationFrame(animate)
          if (threeRef.current) threeRef.current.animId = id
          controls.update()
          renderer.render(scene, camera)
        }
        animate()

        // Store refs even before model loads (for cleanup)
        threeRef.current = { scene, camera, renderer, controls, pointCloud: null, animId: 0 }

        // Handle resize
        const handleResize = () => {
          const w = container.clientWidth
          const h = container.clientHeight
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          renderer.setSize(w, h)
        }
        window.addEventListener('resize', handleResize)

        // Store cleanup handler
        ;(container as any).__cleanup = () => {
          window.removeEventListener('resize', handleResize)
        }
      } catch (err: any) {
        if (!disposed) {
          setError(err.message ?? 'Failed to initialize 3D viewer')
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      disposed = true
      const t = threeRef.current
      if (t) {
        cancelAnimationFrame(t.animId)
        t.renderer.dispose()
        t.renderer.domElement.remove()
        threeRef.current = null
      }
      const container = containerRef.current
      if (container && (container as any).__cleanup) {
        ;(container as any).__cleanup()
      }
    }
  }, [modelUrl])

  // Update screen positions of annotation markers each frame
  useEffect(() => {
    if (loading || !threeRef.current) return

    let animId: number
    const THREE_MOD = require('three') as typeof import('three')

    function updatePositions() {
      const t = threeRef.current
      if (!t) return

      const camera = t.camera
      const canvas = t.renderer.domElement as HTMLCanvasElement
      const newPositions = new Map<string, { x: number; y: number }>()

      for (const ann of annotations) {
        const pos = new THREE_MOD.Vector3(ann.position.x, ann.position.y, ann.position.z)
        pos.project(camera)

        if (pos.z > 1) continue

        const x = (pos.x * 0.5 + 0.5) * canvas.clientWidth
        const y = (-pos.y * 0.5 + 0.5) * canvas.clientHeight
        newPositions.set(ann.id, { x, y })
      }

      setScreenPositions(newPositions)
      animId = requestAnimationFrame(updatePositions)
    }

    animId = requestAnimationFrame(updatePositions)
    return () => cancelAnimationFrame(animId)
  }, [loading, annotations])

  // Raycast to find 3D position from screen coords
  const raycastPosition = useCallback((clientX: number, clientY: number): { x: number; y: number; z: number } | null => {
    const t = threeRef.current
    if (!t?.pointCloud || !containerRef.current) return null

    const THREE_MOD = require('three') as typeof import('three')
    const rect = containerRef.current.getBoundingClientRect()
    const mouse = new THREE_MOD.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )

    const raycaster = new THREE_MOD.Raycaster()
    raycaster.setFromCamera(mouse, t.camera)

    if (t.pointCloud instanceof THREE_MOD.Points) {
      raycaster.params.Points = { threshold: 0.05 }
      const intersects = raycaster.intersectObject(t.pointCloud)
      if (intersects.length > 0) {
        const p = intersects[0].point
        return { x: p.x, y: p.y, z: p.z }
      }
    }

    // Fallback: place along ray
    const distToOrigin = t.camera.position.length()
    const depth = Math.max(distToOrigin * 0.6, 0.5)
    const point = raycaster.ray.at(depth, new THREE_MOD.Vector3())
    return { x: point.x, y: point.y, z: point.z }
  }, [])

  // Handle click to place annotation
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingId) return // don't place while finishing a drag
      if (!annotateMode || !threeRef.current) return

      const pos = raycastPosition(e.clientX, e.clientY)
      if (pos) {
        setPendingPosition(pos)
        setNoteText('')
        setSelectedLabel('other')
      }
    },
    [annotateMode, draggingId, raycastPosition]
  )

  // Drag start — mousedown on a marker's drag handle
  const handleDragStart = useCallback((e: React.MouseEvent, annId: string) => {
    e.stopPropagation()
    e.preventDefault()
    setDraggingId(annId)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    // Disable orbit controls during drag
    if (threeRef.current?.controls) {
      threeRef.current.controls.enabled = false
    }
  }, [])

  // Drag move + drag end via window listeners
  useEffect(() => {
    if (!draggingId) return

    const handleMouseMove = (e: MouseEvent) => {
      const pos = raycastPosition(e.clientX, e.clientY)
      if (pos) {
        // Update annotation position locally for live preview
        setAnnotations((prev) =>
          prev.map((a) => (a.id === draggingId ? { ...a, position: pos } : a))
        )
      }
    }

    const handleMouseUp = async () => {
      // Re-enable orbit controls
      if (threeRef.current?.controls) {
        threeRef.current.controls.enabled = true
      }

      // Persist the final position
      const ann = annotations.find((a) => a.id === draggingId)
      if (ann) {
        await fetch('/api/annotations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: ann.id, position: ann.position }),
        })
      }

      setDraggingId(null)
      dragStartRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingId, annotations, raycastPosition])

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
  }, [])

  // Escape key handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingPosition) {
          setPendingPosition(null)
        } else if (selectedAnnotation) {
          setSelectedAnnotation(null)
        } else if (annotateMode) {
          setAnnotateMode(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, pendingPosition, selectedAnnotation, annotateMode])

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* 3D Canvas */}
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={handleCanvasClick}
        style={{ cursor: annotateMode ? 'crosshair' : 'default' }}
      />

      {/* Loading overlay */}
      {loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <Loader2 size={40} className="animate-spin text-white/70" />
          <p className="mt-4 text-sm font-medium text-white/70">
            Loading 3D scene... {progress > 0 ? `${progress}%` : ''}
          </p>
        </div>
      )}

      {/* Error overlay */}
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

      {/* Close button */}
      <Button
        variant="outline"
        size="icon"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full border-white/20 bg-black/40 text-white backdrop-blur-sm hover:bg-white/10"
        aria-label="Close 3D viewer"
      >
        <X size={18} />
      </Button>

      {/* Annotate mode toggle */}
      {!loading && !error && (
        <Button
          variant="outline"
          onClick={() => {
            setAnnotateMode(!annotateMode)
            setPendingPosition(null)
            setSelectedAnnotation(null)
          }}
          className={`absolute left-4 top-4 z-10 rounded-full border-white/20 backdrop-blur-sm ${
            annotateMode
              ? 'bg-[#1a73e8] text-white hover:bg-[#1557b0]'
              : 'bg-black/40 text-white hover:bg-white/10'
          }`}
        >
          <PenTool size={14} className="mr-2" />
          {annotateMode ? 'Annotating...' : 'Annotate'}
        </Button>
      )}

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
              <div className="flex items-center gap-0.5">
                {/* Drag handle — visible in annotate mode */}
                {annotateMode && (
                  <div
                    onMouseDown={(e) => handleDragStart(e, ann.id)}
                    className={`flex h-7 w-5 cursor-grab items-center justify-center rounded-l-full border-2 border-r-0 transition-all active:cursor-grabbing ${
                      draggingId === ann.id
                        ? 'border-yellow-400 bg-yellow-500'
                        : 'border-white/70 bg-[#1a73e8]/80 hover:bg-[#1a73e8]'
                    }`}
                    aria-label="Drag to reposition"
                  >
                    <GripVertical size={10} className="text-white" />
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!draggingId) setSelectedAnnotation(ann)
                  }}
                  onMouseEnter={() => setHoveredAnnotation(ann.id)}
                  onMouseLeave={() => setHoveredAnnotation(null)}
                  className={`flex h-7 items-center justify-center border-2 transition-all ${
                    annotateMode ? 'w-6 rounded-r-full' : 'w-7 rounded-full'
                  } ${
                    draggingId === ann.id
                      ? 'border-yellow-400 bg-yellow-500'
                      : selectedAnnotation?.id === ann.id
                        ? 'scale-125 border-white bg-[#1a73e8]'
                        : 'border-white/70 bg-[#1a73e8]/80 hover:scale-110'
                  }`}
                  aria-label={`Annotation: ${ann.note}`}
                >
                  <MessageSquare size={12} className="text-white" />
                </button>
              </div>
              {/* Hover tooltip */}
              {hoveredAnnotation === ann.id && !draggingId && selectedAnnotation?.id !== ann.id && (
                <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                  {ann.note.length > 40 ? ann.note.slice(0, 40) + '...' : ann.note}
                </div>
              )}
              {/* Dragging indicator */}
              {draggingId === ann.id && (
                <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-yellow-500/90 px-3 py-1.5 text-xs font-bold text-black backdrop-blur-sm">
                  Dragging — release to place
                </div>
              )}
            </div>
          )
        })}

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
              10
            ),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-start justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1a73e8]/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#7ab4ff]">
              <Tag size={10} />
              {selectedAnnotation.label || 'annotation'}
            </span>
            <button
              onClick={() => deleteAnnotation(selectedAnnotation.id)}
              className="rounded-full p-1 text-red-400/70 transition-colors hover:bg-red-400/20 hover:text-red-400"
              aria-label="Delete annotation"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <p className="text-sm leading-relaxed text-white/90">{selectedAnnotation.note}</p>
          <p className="mt-2 text-[10px] text-white/30">
            {new Date(selectedAnnotation.createdAt).toLocaleDateString()}
          </p>
          <button
            onClick={() => setSelectedAnnotation(null)}
            className="mt-2 text-[11px] font-medium text-white/40 transition-colors hover:text-white/70"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* New annotation form */}
      {pendingPosition && (
        <div
          className="absolute bottom-8 left-1/2 z-30 w-96 -translate-x-1/2 rounded-2xl border border-white/10 bg-black/70 p-5 backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="mb-3 text-sm font-bold text-white">Add Annotation</h3>

          {/* Label selector */}
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

          {/* Note input */}
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
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

      {/* Controls hint */}
      {!loading && !error && !pendingPosition && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-4 py-2 text-xs font-medium text-white/50 backdrop-blur-sm">
          {annotateMode
            ? 'Click to place \u00b7 Drag markers to reposition \u00b7 Esc to exit'
            : 'Drag to orbit \u00b7 Scroll to zoom \u00b7 Esc to close'}
        </div>
      )}

      {/* Annotation count badge */}
      {!loading && annotations.length > 0 && (
        <div className="absolute left-4 bottom-4 z-10 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white/60 backdrop-blur-sm">
          <MessageSquare size={12} className="mr-1.5 inline" />
          {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
