'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { ArrowLeft, PenTool, MessageSquare, Tag, Trash2 } from 'lucide-react'
import { Nunito } from 'next/font/google'
import {
  APIProvider,
  Map3D,
  MapMode,
  GestureHandling,
  type Map3DRef,
  type Map3DClickEvent,
  type Map3DSteadyChangeEvent,
} from '@vis.gl/react-google-maps'

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
})

const MAPS_KEY = process.env.NEXT_PUBLIC_MAPS_KEY ?? ''

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExteriorPosition {
  lat: number
  lng: number
  altitude: number
}

interface ExteriorAnnotation {
  id: string
  placeId: string
  position: ExteriorPosition
  note: string
  label: string
  createdAt: string
}

const LABEL_OPTIONS = [
  'accessible_entrance',
  'accessible_parking',
  'ramp',
  'hazard',
  'other',
] as const

// ── Inner component (uses useSearchParams — must be inside Suspense) ──────────

function ExteriorView() {
  const params       = useSearchParams()
  const router       = useRouter()

  const lat     = parseFloat(params.get('lat')     ?? '0')
  const lng     = parseFloat(params.get('lng')     ?? '0')
  const name    = params.get('name')    ?? 'Location'
  const address = params.get('address') ?? ''
  const placeId = params.get('placeId') ?? ''
  const scopedId = `ext_${placeId}`

  const map3dRef     = useRef<Map3DRef>(null)
  const flyInDoneRef = useRef(false)

  const handleSteadyChange = useCallback((e: Map3DSteadyChangeEvent) => {
    if (!e.detail.isSteady || flyInDoneRef.current) return
    flyInDoneRef.current = true
    map3dRef.current?.flyCameraTo({
      endCamera: {
        center: { lat, lng, altitude: 300 },
        tilt: 65,
        range: 500,
        heading: 0,
      },
      durationMilliseconds: 2500,
    })
  }, [lat, lng])

  const [annotateMode,       setAnnotateMode]       = useState(false)
  const [annotations,        setAnnotations]        = useState<ExteriorAnnotation[]>([])
  const [pendingPosition,    setPendingPosition]    = useState<ExteriorPosition | null>(null)
  const [noteText,           setNoteText]           = useState('')
  const [selectedLabel,      setSelectedLabel]      = useState<typeof LABEL_OPTIONS[number]>('accessible_entrance')
  const [selectedAnnotation, setSelectedAnnotation] = useState<ExteriorAnnotation | null>(null)
  const [editingAnnotation,  setEditingAnnotation]  = useState(false)
  const [editNote,           setEditNote]           = useState('')
  const [editLabel,          setEditLabel]          = useState<typeof LABEL_OPTIONS[number]>('accessible_entrance')

  // ── Load annotations on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!scopedId || scopedId === 'ext_') return
    fetch(`/api/annotations?placeId=${encodeURIComponent(scopedId)}`)
      .then(r => r.json())
      .then(d => setAnnotations(d.annotations ?? []))
      .catch(() => {})
  }, [scopedId])

  // ── Annotation callbacks ─────────────────────────────────────────────────────
  const saveAnnotation = useCallback(async () => {
    if (!pendingPosition || !noteText.trim()) return
    const res = await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeId: scopedId,
        position: pendingPosition,
        note: noteText.trim(),
        label: selectedLabel,
      }),
    })
    const data = await res.json()
    if (data.annotation) setAnnotations(prev => [...prev, data.annotation])
    setPendingPosition(null)
    setNoteText('')
  }, [pendingPosition, noteText, selectedLabel, scopedId])

  const deleteAnnotation = useCallback(async (id: string) => {
    await fetch(`/api/annotations?id=${id}`, { method: 'DELETE' })
    setAnnotations(prev => prev.filter(a => a.id !== id))
    setSelectedAnnotation(null)
    setEditingAnnotation(false)
  }, [])

  const saveAnnotationEdit = useCallback(async () => {
    if (!selectedAnnotation || !editNote.trim()) return
    // PATCH only persists position; note/label are updated client-side only (matches interior viewer)
    await fetch('/api/annotations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedAnnotation.id, note: editNote.trim(), label: editLabel }),
    }).catch(() => {})
    const updated = { ...selectedAnnotation, note: editNote.trim(), label: editLabel }
    setAnnotations(prev => prev.map(a => a.id === selectedAnnotation.id ? updated : a))
    setSelectedAnnotation(updated)
    setEditingAnnotation(false)
  }, [selectedAnnotation, editNote, editLabel])

  return (
    <div className={`${nunito.className} flex h-screen flex-col overflow-hidden bg-white`}>
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header
        className="flex flex-shrink-0 items-center gap-3 px-5 py-3"
        style={{ borderBottom: '1.5px solid #eef0f4', boxShadow: '0 2px 8px rgba(0,158,133,0.07)' }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] transition-colors hover:bg-[#d4f0ea]"
          style={{ backgroundColor: '#e0f5f1', color: '#007a67', fontWeight: 800 }}
          aria-label="Back to map"
        >
          <ArrowLeft size={12} />
          Map
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-black leading-tight" style={{ color: '#1a2035' }}>
            {name}
          </p>
          <p className="truncate text-[10px] font-medium" style={{ color: '#9aa0b8' }}>
            {address}
          </p>
        </div>

        <button
          onClick={() => {
            setAnnotateMode(m => !m)
            setPendingPosition(null)
            setSelectedAnnotation(null)
          }}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black transition-colors"
          style={
            annotateMode
              ? { backgroundColor: '#009E85', color: 'white' }
              : { backgroundColor: '#e0f5f1', color: '#007a67' }
          }
          aria-pressed={annotateMode}
        >
          <PenTool size={11} />
          {annotateMode ? 'Annotating…' : 'Annotate'}
        </button>

        <span
          className="flex-shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white"
          style={{ backgroundColor: '#009E85', letterSpacing: '0.06em' }}
        >
          Photorealistic 3D
        </span>
      </header>

      {/* ── Map ───────────────────────────────────────────────────────── */}
      <main
        className="relative flex-1"
        style={{ cursor: annotateMode ? 'crosshair' : 'default' }}
      >
        <APIProvider apiKey={MAPS_KEY}>
          <Map3D
            ref={map3dRef}
            mode={MapMode.SATELLITE}
            gestureHandling={GestureHandling.GREEDY}
            defaultCenter={{ lat, lng, altitude: 1500 }}
            defaultTilt={0}
            defaultRange={2000}
            defaultHeading={0}
            onSteadyChange={handleSteadyChange}
            style={{ width: '100%', height: '100%' }}
          />
        </APIProvider>

        {/* Controls hint */}
        {!annotateMode && (
          <div
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-[10px] font-semibold"
            style={{ background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(8px)' }}
          >
            Drag to orbit · Scroll to zoom · Alt+Drag to tilt
          </div>
        )}
        {annotateMode && (
          <div
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-[10px] font-semibold"
            style={{ background: 'rgba(0,158,133,0.85)', color: 'white', backdropFilter: 'blur(8px)' }}
          >
            Click on the map to place an annotation · Esc to exit
          </div>
        )}
      </main>
    </div>
  )
}

// ── Page export (Suspense boundary for useSearchParams) ───────────────────────

export default function ExteriorPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-white">
        <p className="text-sm font-semibold" style={{ color: '#9aa0b8' }}>Loading…</p>
      </div>
    }>
      <ExteriorView />
    </Suspense>
  )
}
