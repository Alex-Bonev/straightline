'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import {
  ArrowLeft,
  PenTool,
  MessageSquare,
  Tag,
  Trash2,
  TrendingUp,
  ArrowUpDown,
  Accessibility,
  ParkingSquare,
  AlertTriangle,
  MapPin,
  Wand2,
} from 'lucide-react'
import { Nunito } from 'next/font/google'
import {
  APIProvider,
  Map3D,
  MapMode,
  GestureHandling,
  Marker3D,
  AltitudeMode,
  Pin,
  type Map3DRef,
  type Map3DClickEvent,
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

const LABEL_STYLES: Record<string, { bg: string; border: string; glyph: string }> = {
  accessible_entrance: { bg: '#009E85', border: '#007a67', glyph: '#fff' },
  accessible_parking:  { bg: '#3b82f6', border: '#2563eb', glyph: '#fff' },
  ramp:                { bg: '#f59e0b', border: '#d97706', glyph: '#fff' },
  hazard:              { bg: '#ef4444', border: '#dc2626', glyph: '#fff' },
  other:               { bg: '#6b7280', border: '#4b5563', glyph: '#fff' },
}

function LabelIcon({ label, size, className }: { label: string; size?: number; className?: string }) {
  switch (label) {
    case 'accessible_entrance': return <Accessibility size={size} className={className} />
    case 'accessible_parking':  return <ParkingSquare size={size} className={className} />
    case 'ramp':                return <TrendingUp size={size} className={className} />
    case 'hazard':              return <AlertTriangle size={size} className={className} />
    default:                    return <MapPin size={size} className={className} />
  }
}

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

  const map3dRef = useRef<Map3DRef>(null)

  const [annotateMode,       setAnnotateMode]       = useState(false)
  const [annotations,        setAnnotations]        = useState<ExteriorAnnotation[]>([])
  const [pendingPosition,    setPendingPosition]    = useState<ExteriorPosition | null>(null)
  const [noteText,           setNoteText]           = useState('')
  const [selectedLabel,      setSelectedLabel]      = useState<typeof LABEL_OPTIONS[number]>('accessible_entrance')
  const [selectedAnnotation, setSelectedAnnotation] = useState<ExteriorAnnotation | null>(null)
  const [editingAnnotation,  setEditingAnnotation]  = useState(false)
  const [editNote,           setEditNote]           = useState('')
  const [editLabel,          setEditLabel]          = useState<typeof LABEL_OPTIONS[number]>('accessible_entrance')
  const [showAnnotationList, setShowAnnotationList] = useState(false)
  const [hoveredAnnotation,  setHoveredAnnotation]  = useState<string | null>(null)
  const [autoStatus, setAutoStatus] = useState<'idle' | 'street_view' | 'analyzing' | 'done' | 'error'>('idle')
  const [autoTaskId, setAutoTaskId] = useState<string | null>(null)
  const [autoError,  setAutoError]  = useState<string | null>(null)
  const [autoSummary, setAutoSummary] = useState<string | null>(null)
  const [autoLog,    setAutoLog]    = useState<string[]>([])
  const [autoScreenshot, setAutoScreenshot] = useState<string | null>(null)

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
    const res = await fetch(`/api/annotations?id=${id}`, { method: 'DELETE' })
    if (!res.ok) return
    setAnnotations(prev => prev.filter(a => a.id !== id))
    setSelectedAnnotation(null)
    setEditingAnnotation(false)
  }, [])

  const saveAnnotationEdit = useCallback(async () => {
    if (!selectedAnnotation || !editNote.trim()) return
    // TODO: The PATCH endpoint requires `position` and ignores note/label — this call always returns 400.
    // note/label edits are client-only until the API is extended to accept them.
    // Matches the interior splat viewer behavior (same limitation).
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

  // Close annotation list when clicking outside
  useEffect(() => {
    if (!showAnnotationList) return
    const close = () => setShowAnnotationList(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [showAnnotationList])

  // Poll auto-annotate status
  useEffect(() => {
    if (!autoTaskId) return

    let cancelled = false
    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams({
          taskId: autoTaskId,
          placeId: scopedId,
          lat: String(lat),
          lng: String(lng),
          name,
        })
        const res = await fetch(`/api/annotations/auto?${params}`)
        if (cancelled) return
        const data = await res.json()
        if (cancelled) return

        if (!res.ok) {
          clearInterval(interval)
          setAutoError(data.error ?? 'Polling error')
          setAutoStatus('error')
          setAutoTaskId(null)
          setTimeout(() => { setAutoError(null); setAutoStatus('idle') }, 8000)
          return
        }

        if (data.status === 'loading') {
          setAutoStatus(data.step === 'street_view' ? 'street_view' : 'analyzing')
          if (data.visitedUrls?.length) setAutoLog(data.visitedUrls)
          if (data.latestScreenshot) setAutoScreenshot(data.latestScreenshot)
          return
        }

        if (data.status === 'done') {
          clearInterval(interval)
          const newAnns = data.annotations ?? []
          console.log('[auto-annotate] Pipeline complete. Annotations:', newAnns)
          setAutoLog([])
          setAutoScreenshot(null)
          if (newAnns.length > 0) {
            setAnnotations(prev => {
              const existingIds = new Set(prev.map(a => a.id))
              return [...prev, ...newAnns.filter((a: ExteriorAnnotation) => !existingIds.has(a.id))]
            })
            const counts: Record<string, number> = {}
            for (const a of newAnns) {
              const readable = a.label.replace(/_/g, ' ')
              counts[readable] = (counts[readable] ?? 0) + 1
            }
            const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}${v > 1 ? 's' : ''}`)
            setAutoSummary(`Added ${newAnns.length} annotation${newAnns.length > 1 ? 's' : ''} (${parts.join(', ')})`)
          } else {
            setAutoSummary('No features detected — try annotating manually')
          }
          setAutoStatus('done')
          setAutoTaskId(null)
          setTimeout(() => setAutoSummary(null), 8000)
          return
        }

        if (data.status === 'error') {
          clearInterval(interval)
          console.error('[auto-annotate] Pipeline error:', data.message)
          setAutoLog([])
          setAutoScreenshot(null)
          setAutoError(data.message ?? 'Auto-annotation failed')
          setAutoStatus('error')
          setAutoTaskId(null)
          setTimeout(() => { setAutoError(null); setAutoStatus('idle') }, 8000)
          return
        }
      } catch {
        if (cancelled) return
        clearInterval(interval)
        setAutoError('Network error')
        setAutoStatus('error')
        setAutoTaskId(null)
        setTimeout(() => { setAutoError(null); setAutoStatus('idle') }, 8000)
      }
    }, 6000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [autoTaskId, scopedId, lat, lng, name])

  const startAutoAnnotate = useCallback(async () => {
    setAutoStatus('street_view')
    setAutoError(null)
    setAutoSummary(null)
    setAutoLog([])
    setAutoScreenshot(null)

    try {
      const res = await fetch('/api/annotations/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeId: scopedId, lat, lng, name, address }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.error === 'no_checklist') {
          setAutoError('Run an ADA scan from the map panel first')
        } else {
          setAutoError(data.error ?? 'Failed to start auto-annotation')
        }
        setAutoStatus('error')
        setTimeout(() => { setAutoError(null); setAutoStatus('idle') }, 8000)
        return
      }

      setAutoTaskId(data.taskId)
    } catch {
      setAutoError('Network error')
      setAutoStatus('error')
      setTimeout(() => { setAutoError(null); setAutoStatus('idle') }, 8000)
    }
  }, [scopedId, lat, lng, name, address])

  // Fly camera to an annotation
  const focusAnnotation = useCallback((ann: ExteriorAnnotation) => {
    const map = map3dRef.current
    if (map) {
      map.flyCameraTo({
        endCamera: {
          center: { lat: ann.position.lat, lng: ann.position.lng, altitude: ann.position.altitude },
          tilt: 60,
          range: 50,
        },
        durationMillis: 1000,
      })
    }
    setShowAnnotationList(false)
    setSelectedAnnotation(ann)
    setEditingAnnotation(false)
  }, [])

  return (
    <div className={`${nunito.className} flex h-screen items-stretch p-3`} style={{ backgroundColor: '#e0f5f1' }}>
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white" style={{ boxShadow: '0 4px 24px rgba(0,158,133,0.12)' }}>
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

        <span className="text-[10px] font-medium" style={{ color: '#9aa0b8' }}>
          Shift+Drag to orbit · Drag to pan · Scroll to zoom
        </span>

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

        <button
          onClick={startAutoAnnotate}
          disabled={autoStatus !== 'idle' && autoStatus !== 'done' && autoStatus !== 'error'}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black transition-colors disabled:opacity-60"
          style={{ backgroundColor: '#e0f5f1', color: '#007a67' }}
          title="Automatically detect and annotate entrances, ramps, and stairs using AI"
        >
          <Wand2 size={11} className={autoStatus === 'street_view' || autoStatus === 'analyzing' ? 'animate-pulse' : ''} />
          {autoStatus === 'street_view' && 'Scanning Street View…'}
          {autoStatus === 'analyzing' && 'Analyzing images…'}
          {autoStatus !== 'street_view' && autoStatus !== 'analyzing' && 'Auto-Annotate'}
        </button>

        {annotations.length > 0 && (
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setShowAnnotationList(v => !v) }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black transition-colors hover:bg-[#c8f0e8]"
              style={{ backgroundColor: '#e0f5f1', color: '#007a67', border: '1px solid #009E85' }}
            >
              <MessageSquare size={11} />
              Visit Annotations
            </button>

            {showAnnotationList && (
              <div
                className="absolute left-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-xl bg-white/95 backdrop-blur-md"
                style={{ border: '1px solid rgba(0,158,133,0.18)', boxShadow: '0 8px 28px rgba(0,0,0,0.12)' }}
                onClick={e => e.stopPropagation()}
              >
                <p className="px-3 pt-3 pb-1.5 text-[9px] font-black uppercase tracking-[0.12em]" style={{ color: '#9aa0b8' }}>
                  Annotations
                </p>
                <div className="max-h-56 overflow-y-auto pb-2">
                  {annotations.map(ann => {
                    const style = LABEL_STYLES[ann.label] ?? LABEL_STYLES.other
                    return (
                      <button
                        key={ann.id}
                        onClick={() => focusAnnotation(ann)}
                        className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[#edfaf7]"
                      >
                        <span
                          className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: style.bg }}
                        >
                          <LabelIcon label={ann.label} size={10} className="text-white" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-bold capitalize" style={{ color: '#1a2035' }}>
                            {ann.label.replace(/_/g, ' ')}
                          </p>
                          <p className="truncate text-[10px]" style={{ color: '#6b7a99' }}>
                            {ann.note.length > 38 ? ann.note.slice(0, 38) + '…' : ann.note}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

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
            defaultCenter={{ lat, lng, altitude: 100 }}
            defaultTilt={45}
            defaultRange={100}
            defaultHeading={0}
            onClick={handleMapClick}
            style={{ width: '100%', height: '100%' }}
          >
            {annotations.map(ann => {
              const style = LABEL_STYLES[ann.label] ?? LABEL_STYLES.other
              return (
                <Marker3D
                  key={ann.id}
                  position={{ lat: ann.position.lat, lng: ann.position.lng, altitude: ann.position.altitude }}
                  altitudeMode={AltitudeMode.CLAMP_TO_GROUND}
                  drawsWhenOccluded
                  sizePreserved
                  title={`[${ann.label.replace(/_/g, ' ')}] ${ann.note}`}
                  onClick={() => {
                    setSelectedAnnotation(ann)
                    setEditingAnnotation(false)
                  }}
                >
                  <Pin
                    background={style.bg}
                    borderColor={style.border}
                    glyphColor={style.glyph}
                    scale={1.1}
                  />
                </Marker3D>
              )
            })}
          </Map3D>
        </APIProvider>

        {/* Annotate mode hint */}
        {annotateMode && (
          <div
            className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-[10px] font-semibold"
            style={{ background: 'rgba(0,158,133,0.85)', color: 'white', backdropFilter: 'blur(8px)' }}
          >
            Click on the map to place an annotation · Esc to exit
          </div>
        )}

        {/* Auto-annotate status toast */}
        {(autoError || autoSummary) && (
          <div
            className="pointer-events-none absolute top-4 left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-[10px] font-semibold"
            style={{
              background: autoError ? 'rgba(239,68,68,0.9)' : 'rgba(0,158,133,0.9)',
              color: 'white',
              backdropFilter: 'blur(8px)',
            }}
          >
            {autoError ?? autoSummary}
          </div>
        )}

        {/* BrowserUse agent activity panel */}
        {(autoStatus === 'street_view' || autoStatus === 'analyzing') && (
          <div
            className="absolute right-4 top-4 z-30 w-80 overflow-hidden rounded-2xl"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="text-[11px] font-bold text-white/90">
                {autoStatus === 'street_view' ? 'Agent: Navigating Street View' : 'Agent: Analyzing Images'}
              </span>
            </div>

            {/* Screenshot preview */}
            {autoScreenshot && (
              <div className="px-3 pt-3">
                <img
                  src={`data:image/png;base64,${autoScreenshot}`}
                  alt="Agent view"
                  className="w-full rounded-lg"
                  style={{ border: '1px solid rgba(255,255,255,0.1)', maxHeight: 160, objectFit: 'cover' }}
                />
              </div>
            )}

            {/* Visited URLs log */}
            <div className="px-3 py-3">
              <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-white/40">
                Pages visited
              </p>
              <div className="max-h-28 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                {autoLog.length === 0 ? (
                  <p className="text-[10px] text-white/30 italic">Waiting for agent to start browsing...</p>
                ) : (
                  autoLog.map((url, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-0.5">
                      <span className="mt-[3px] h-1 w-1 flex-shrink-0 rounded-full bg-white/30" />
                      <p className="break-all text-[10px] leading-tight text-white/60">
                        {url.length > 80 ? url.slice(0, 80) + '…' : url}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
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
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider"
                    style={{
                      backgroundColor: (LABEL_STYLES[selectedAnnotation.label] ?? LABEL_STYLES.other).bg + '18',
                      color: (LABEL_STYLES[selectedAnnotation.label] ?? LABEL_STYLES.other).bg,
                    }}
                  >
                    <LabelIcon label={selectedAnnotation.label} size={10} />
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
