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
  Marker3D,
  AltitudeMode,
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

  const [annotateMode,       setAnnotateMode]       = useState(false)
  const [annotations,        setAnnotations]        = useState<ExteriorAnnotation[]>([])
  const [pendingPosition,    setPendingPosition]    = useState<ExteriorPosition | null>(null)
  const [noteText,           setNoteText]           = useState('')
  const [selectedLabel,      setSelectedLabel]      = useState<typeof LABEL_OPTIONS[number]>('accessible_entrance')
  const [selectedAnnotation, setSelectedAnnotation] = useState<ExteriorAnnotation | null>(null)
  const [editingAnnotation,  setEditingAnnotation]  = useState(false)
  const [editNote,           setEditNote]           = useState('')
  const [editLabel,          setEditLabel]          = useState<typeof LABEL_OPTIONS[number]>('accessible_entrance')

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

  const handleMapClick = useCallback((e: Map3DClickEvent) => {
    if (!annotateMode) return
    const raw = e.detail.position
    if (!raw) return
    // LatLngAltitude has a toJSON() method that returns { lat, lng, altitude }
    const posLiteral = ('toJSON' in raw && typeof (raw as google.maps.LatLngAltitude).toJSON === 'function')
      ? (raw as google.maps.LatLngAltitude).toJSON()
      : { lat: raw.lat as number, lng: raw.lng as number, altitude: raw.altitude ?? 0 }
    const { lat: pLat, lng: pLng, altitude } = posLiteral
    setPendingPosition({ lat: pLat, lng: pLng, altitude: altitude ?? 0 })
    setNoteText('')
    setSelectedLabel('accessible_entrance')
  }, [annotateMode])

  // ── Load annotations on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!scopedId || scopedId === 'ext_') return
    fetch(`/api/annotations?placeId=${encodeURIComponent(scopedId)}`)
      .then(r => r.json())
      .then(d => setAnnotations(d.annotations ?? []))
      .catch(() => {})
  }, [scopedId])

  // ── Escape key handler ──────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (pendingPosition) {
        setPendingPosition(null)
      } else if (editingAnnotation) {
        setEditingAnnotation(false)
      } else if (selectedAnnotation) {
        setSelectedAnnotation(null)
      } else if (annotateMode) {
        setAnnotateMode(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [pendingPosition, editingAnnotation, selectedAnnotation, annotateMode])

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
    // Server error — leave form open so user can retry; TODO: surface error state in future
    if (!res.ok) return
    const data = await res.json()
    if (data.annotation) setAnnotations(prev => [...prev, data.annotation])
    setPendingPosition(null)
    setNoteText('')
    setSelectedLabel('accessible_entrance')
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
            onClick={handleMapClick}
            style={{ width: '100%', height: '100%' }}
          >
            {annotations.map(ann => (
              <Marker3D
                key={ann.id}
                position={{ lat: ann.position.lat, lng: ann.position.lng, altitude: ann.position.altitude }}
                altitudeMode={AltitudeMode.CLAMP_TO_GROUND}
                title={ann.note}
                onClick={() => {
                  setSelectedAnnotation(ann)
                  setEditingAnnotation(false)
                }}
              />
            ))}
          </Map3D>
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

        {annotations.length > 0 && (
          <div
            className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold"
            style={{ background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(8px)' }}
          >
            <MessageSquare size={11} />
            {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* New annotation form */}
        {pendingPosition && (
          <div
            className="absolute bottom-16 left-1/2 z-20 w-96 -translate-x-1/2 rounded-2xl p-5"
            style={{ background: 'white', boxShadow: '0 8px 32px rgba(0,158,133,0.18), 0 2px 12px rgba(0,0,0,0.1)', border: '1.5px solid #eef0f4' }}
            onClick={e => e.stopPropagation()}
          >
            <p className="mb-3 text-[13px] font-black" style={{ color: '#1a2035' }}>Add Annotation</p>

            {/* Label picker */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {LABEL_OPTIONS.map(label => (
                <button
                  key={label}
                  onClick={() => setSelectedLabel(label)}
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors"
                  style={
                    selectedLabel === label
                      ? { backgroundColor: '#009E85', color: 'white' }
                      : { backgroundColor: '#e0f5f1', color: '#007a67' }
                  }
                >
                  {label.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              placeholder="Describe this feature…"
              className="mb-3 h-20 w-full resize-none rounded-xl border px-3 py-2 text-[13px] focus:outline-none"
              style={{ borderColor: '#e4e8f0', color: '#1a2035' }}
              autoFocus
            />

            <div className="flex gap-2">
              <button
                onClick={saveAnnotation}
                disabled={!noteText.trim()}
                className="flex-1 rounded-full py-2 text-[11px] font-black text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: '#009E85' }}
              >
                Save
              </button>
              <button
                onClick={() => setPendingPosition(null)}
                className="rounded-full px-4 py-2 text-[11px] font-semibold transition-colors hover:bg-[#f0f3fa]"
                style={{ color: '#6b7a99', border: '1.5px solid #e4e8f0' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Selected annotation detail */}
        {selectedAnnotation && !pendingPosition && (
          <div
            className="absolute right-4 top-4 z-20 w-72 rounded-2xl p-4"
            style={{ background: 'white', boxShadow: '0 8px 32px rgba(0,158,133,0.18), 0 2px 12px rgba(0,0,0,0.1)', border: '1.5px solid #eef0f4' }}
            onClick={e => e.stopPropagation()}
          >
            {editingAnnotation ? (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {LABEL_OPTIONS.map(label => (
                    <button
                      key={label}
                      onClick={() => setEditLabel(label)}
                      className="rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors"
                      style={
                        editLabel === label
                          ? { backgroundColor: '#009E85', color: 'white' }
                          : { backgroundColor: '#e0f5f1', color: '#007a67' }
                      }
                    >
                      {label.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                <textarea
                  value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  onKeyDown={e => e.stopPropagation()}
                  className="mb-3 h-20 w-full resize-none rounded-xl border px-3 py-2 text-[13px] focus:outline-none"
                  style={{ borderColor: '#e4e8f0', color: '#1a2035' }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveAnnotationEdit}
                    disabled={!editNote.trim()}
                    className="flex-1 rounded-full py-2 text-[11px] font-black text-white transition-opacity disabled:opacity-40"
                    style={{ backgroundColor: '#009E85' }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingAnnotation(false)}
                    className="rounded-full px-4 py-2 text-[11px] font-semibold transition-colors hover:bg-[#f0f3fa]"
                    style={{ color: '#6b7a99', border: '1.5px solid #e4e8f0' }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider"
                    style={{ backgroundColor: '#e0f5f1', color: '#007a67' }}
                  >
                    <Tag size={9} />
                    {selectedAnnotation.label.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => {
                        setEditNote(selectedAnnotation.note)
                        setEditLabel(selectedAnnotation.label as typeof LABEL_OPTIONS[number])
                        setEditingAnnotation(true)
                      }}
                      className="rounded-full p-1.5 transition-colors hover:bg-[#f0f3fa]"
                      aria-label="Edit annotation"
                    >
                      <PenTool size={12} style={{ color: '#9aa0b8' }} />
                    </button>
                    <button
                      onClick={() => deleteAnnotation(selectedAnnotation.id)}
                      className="rounded-full p-1.5 transition-colors hover:bg-red-50"
                      aria-label="Delete annotation"
                    >
                      <Trash2 size={13} style={{ color: '#d93025' }} />
                    </button>
                  </div>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: '#2d3a50' }}>
                  {selectedAnnotation.note}
                </p>
                <p className="mt-2 text-[10px]" style={{ color: '#b0b8d0' }}>
                  {new Date(selectedAnnotation.createdAt).toLocaleDateString()}
                </p>
                <button
                  onClick={() => { setSelectedAnnotation(null); setEditingAnnotation(false) }}
                  className="mt-2 text-[10px] font-semibold transition-colors hover:opacity-70"
                  style={{ color: '#9aa0b8' }}
                >
                  Dismiss
                </button>
              </>
            )}
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
