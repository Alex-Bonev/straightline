'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { ArrowLeft, PenTool, MessageSquare, Tag, Trash2 } from 'lucide-react'
import { Nunito } from 'next/font/google'

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

  const [annotateMode,       setAnnotateMode]       = useState(false)
  const [annotations,        setAnnotations]        = useState<ExteriorAnnotation[]>([])
  const [pendingPosition,    setPendingPosition]    = useState<ExteriorPosition | null>(null)
  const [noteText,           setNoteText]           = useState('')
  const [selectedLabel,      setSelectedLabel]      = useState<typeof LABEL_OPTIONS[number]>('accessible_entrance')
  const [selectedAnnotation, setSelectedAnnotation] = useState<ExteriorAnnotation | null>(null)
  const [editingAnnotation,  setEditingAnnotation]  = useState(false)
  const [editNote,           setEditNote]           = useState('')
  const [editLabel,          setEditLabel]          = useState<typeof LABEL_OPTIONS[number]>('accessible_entrance')

  return (
    <div className={`${nunito.className} flex h-screen flex-col overflow-hidden bg-white`}>
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header
        className="flex flex-shrink-0 items-center gap-3 px-5 py-3"
        style={{ borderBottom: '1.5px solid #eef0f4', boxShadow: '0 2px 8px rgba(0,158,133,0.07)' }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-800 transition-colors hover:bg-[#d4f0ea]"
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

      {/* ── Map area (placeholder for now) ─────────────────────────────── */}
      <main className="relative flex-1 bg-[#e0f5f1]" />
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
