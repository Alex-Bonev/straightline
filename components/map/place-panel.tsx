'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { animate, stagger } from 'animejs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { EtheralShadow } from '@/components/ui/etheral-shadow'
import { TextScramble } from '@/components/ui/text-scramble'
import {
  ChevronLeft, ChevronRight, MapPin,
  Accessibility, ShieldCheck, ArrowUpDown, Car,
  Globe, X, CheckCircle2, AlertTriangle,
} from 'lucide-react'

interface Place {
  placeId: string
  name: string
  address: string
  types: string[]
  score?: { grade: string; tags: string[]; summary: string }
}

interface BrowserUseInsights {
  adaPercent: number
  grade: string
  compliance: string[]
  limitations: string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function typeLabel(types: string[]): string {
  const map: Record<string, string> = {
    restaurant: 'Restaurant', cafe: 'Café', library: 'Library',
    museum: 'Museum', hospital: 'Hospital', pharmacy: 'Pharmacy',
    school: 'School', university: 'University', gym: 'Fitness Centre',
    park: 'Park', shopping_mall: 'Shopping Mall',
    grocery_or_supermarket: 'Grocery Store', bank: 'Bank', hotel: 'Hotel',
    transit_station: 'Transit Station', subway_station: 'Subway Station',
    bus_station: 'Bus Station', movie_theater: 'Cinema', bar: 'Bar',
    bakery: 'Bakery', art_gallery: 'Art Gallery', stadium: 'Stadium',
    airport: 'Airport', amusement_park: 'Amusement Park',
  }
  for (const t of types) if (map[t]) return map[t]
  const first = types.find(t => !['point_of_interest', 'establishment'].includes(t))
  return (first ?? types[0] ?? 'Place').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function shortAddress(address: string): string {
  return address.split(',')[0].trim()
}

function gradeStyle(grade: string) {
  const l = grade[0].toUpperCase()
  if (l === 'A') return { bg: '#1e8e3e', label: 'Excellent' }
  if (l === 'B') return { bg: '#1a73e8', label: 'Good' }
  if (l === 'C') return { bg: '#f9ab00', label: 'Fair' }
  if (l === 'D') return { bg: '#fa7b17', label: 'Poor' }
  return             { bg: '#d93025', label: 'Critical' }
}

function TagIcon({ tag }: { tag: string }) {
  const t = tag.toLowerCase()
  if (t.includes('wheelchair'))  return <Accessibility size={10} />
  if (t.includes('elevator'))    return <ArrowUpDown   size={10} />
  if (t.includes('ada'))         return <ShieldCheck   size={10} />
  if (t.includes('parking'))     return <Car           size={10} />
  return <MapPin size={10} />
}

// ── PlaceTitle: wrapping animated title ──────────────────────────────────────
function PlaceTitle({ text }: { text: string }) {
  return (
    <div className="relative pb-4 w-fit max-w-full">
      <motion.h1
        className="font-black leading-snug text-left"
        style={{ color: '#1a2035', fontSize: '36px', wordBreak: 'break-word' }}
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55 }}
      >
        {text}
      </motion.h1>
      <motion.svg
        width="100%" height="14" viewBox="0 0 300 14"
        className="absolute bottom-0 left-0"
        style={{ color: '#1a73e8' }}
      >
        <motion.path
          d="M 0,6 Q 75,0 150,6 Q 225,12 300,6"
          stroke="currentColor" strokeWidth="1.6" fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
        />
      </motion.svg>
    </div>
  )
}

// ── ComplianceSkeletons ───────────────────────────────────────────────────────
function ComplianceSkeletons({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-2.5 w-2.5 rounded-full flex-shrink-0" />
          <Skeleton className="h-3" style={{ width: `${65 + (i % 3) * 15}%` }} />
        </div>
      ))}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export function PlacePanel({
  place,
  onClose,
  onView3D,
}: {
  place: Place
  onClose: () => void
  onView3D?: () => void
}) {
  const wrapperRef                = useRef<HTMLDivElement>(null)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [imgIdx, setImgIdx]       = useState(0)
  const [scramble, setScramble]   = useState(false)

  // BrowserUse state
  const [buInsights, setBuInsights]     = useState<BrowserUseInsights | null>(null)
  const [buStatus, setBuStatus]         = useState<'loading' | 'done' | 'error'>('loading')
  const buPollRef                       = useRef<ReturnType<typeof setInterval> | null>(null)
  const buPollCountRef                  = useRef(0)

  // Derived insights: BrowserUse data when ready, fall back to score/defaults
  const scoreGrade = place.score?.grade ?? 'B'
  const insights = {
    grade:       buInsights?.grade      ?? scoreGrade,
    adaPercent:  buInsights?.adaPercent ?? null,
    compliance:  buInsights?.compliance ?? null,
    limitations: buInsights?.limitations ?? null,
    tags:        place.score?.tags ?? [],
  }
  const g   = gradeStyle(insights.grade)

  // ── Fetch photos ──────────────────────────────────────────────────────────
  useEffect(() => {
    setImgIdx(0)
    setPhotoUrls([])
    fetch(`/api/places/details?placeId=${place.placeId}`)
      .then(r => r.json())
      .then(d => {
        const refs: string[] = d.detail?.photoRefs ?? []
        if (refs.length > 0)
          setPhotoUrls(refs.map(r => `/api/places/photo?ref=${encodeURIComponent(r)}&w=560`))
      })
      .catch(() => {})
  }, [place.placeId])

  // ── BrowserUse polling ────────────────────────────────────────────────────
  useEffect(() => {
    setBuInsights(null)
    setBuStatus('loading')
    buPollCountRef.current = 0
    if (buPollRef.current) clearInterval(buPollRef.current)

    let taskId: string | null = null
    let cancelled = false

    // Delay start so React StrictMode cleanup fires before fetch begins,
    // preventing double-invocation from hitting the 3-session concurrent limit.
    const startTimer = setTimeout(() => {
      if (cancelled) return

      fetch('/api/places/browseruse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: place.name, address: place.address }),
      })
        .then(r => {
          if (r.status === 429) throw new Error('rate_limited')
          return r.json()
        })
        .then(async data => {
          if (cancelled) {
            if (data.taskId) fetch(`/api/places/browseruse?taskId=${data.taskId}`, { method: 'DELETE' })
            return
          }
          if (!data.taskId) { setBuStatus('error'); return }
          taskId = data.taskId

          // Immediate first check — resolves cached results in one round trip
          // instead of waiting for the first interval tick (was 6s).
          const pollUrl = () => `/api/places/browseruse?taskId=${taskId}&name=${encodeURIComponent(place.name)}`
          try {
            const firstR    = await fetch(pollUrl())
            const firstPoll = await firstR.json()
            if (firstPoll.status === 'done') {
              if (!cancelled) { setBuInsights(firstPoll.insights); setBuStatus('done') }
              return
            } else if (firstPoll.status === 'error') {
              if (!cancelled) setBuStatus('error')
              return
            }
          } catch { /* network hiccup — fall through to interval */ }

          buPollRef.current = setInterval(async () => {
            buPollCountRef.current += 1
            if (buPollCountRef.current > 30) {
              setBuStatus('error')
              clearInterval(buPollRef.current!)
              return
            }
            try {
              const r    = await fetch(pollUrl())
              const poll = await r.json()
              if (poll.status === 'done') {
                setBuInsights(poll.insights)
                setBuStatus('done')
                clearInterval(buPollRef.current!)
              } else if (poll.status === 'error') {
                setBuStatus('error')
                clearInterval(buPollRef.current!)
              }
            } catch {
              // network hiccup — keep polling
            }
          }, 3000)
        })
        .catch(() => { if (!cancelled) setBuStatus('error') })
    }, 50)

    return () => {
      cancelled = true
      clearTimeout(startTimer)
      if (buPollRef.current) clearInterval(buPollRef.current)
      if (taskId) fetch(`/api/places/browseruse?taskId=${taskId}`, { method: 'DELETE' })
    }
  }, [place.placeId, place.name, place.address])

  // ── Entrance animation ────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    el.style.opacity   = '0'
    el.style.transform = 'translateY(22px)'
    animate(el, { opacity: [0, 1], translateY: [22, 0], duration: 440, ease: 'outExpo' })
    animate('.pp-s', { opacity: [0, 1], translateY: [10, 0], delay: stagger(65, { start: 100 }), duration: 330, ease: 'outExpo' })
    const t = setTimeout(() => setScramble(true), 380)
    return () => clearTimeout(t)
  }, [place.placeId])

  const fallback = 'https://images.unsplash.com/photo-1555636222-cae831e670b3?w=560&h=340&fit=crop'
  const imgs     = photoUrls.length > 0 ? photoUrls : [fallback]

  return (
    <div
      ref={wrapperRef}
      className="absolute bottom-4 right-4 z-20 opacity-0"
      style={{ left: 'calc(480px + 2rem)' }}
    >
      {/* Floating close button */}
      <button
        onClick={onClose}
        className="absolute -top-9 right-0 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-white transition-colors hover:bg-[#f0f3fa]"
        style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}
        aria-label="Close panel"
      >
        <X size={14} style={{ color: '#6b7a99' }} />
      </button>

      {/* Inner panel */}
      <div
        className="flex flex-col overflow-hidden rounded-2xl bg-white"
        style={{ boxShadow: '0 12px 48px rgba(26,58,180,0.15), 0 2px 14px rgba(0,0,0,0.09)' }}
      >

        {/* ── 1 · Name + Image ─────────────────────────────── */}
        <div className="pp-s flex items-start gap-4 px-6 pt-6 pb-5 opacity-0">
          {/* Left column */}
          <div className="min-w-0 flex-1 flex flex-col justify-between">
            <div className="flex flex-1 flex-col justify-center">
              <PlaceTitle text={place.name} />
            </div>

            {/* Type · address · tags */}
            <div className="flex items-center gap-2 overflow-hidden mt-2" style={{ whiteSpace: 'nowrap' }}>
              <span className="flex-shrink-0 text-[11px] font-semibold" style={{ color: '#9aa0b8' }}>
                {typeLabel(place.types)}
              </span>
              <span style={{ color: '#d0d5e0' }}>·</span>
              <span className="flex shrink items-center gap-1 text-[11px] font-medium overflow-hidden" style={{ color: '#6b7a99' }}>
                <MapPin size={10} className="flex-shrink-0" />
                <span className="truncate">{shortAddress(place.address)}</span>
              </span>
              {insights.tags.length > 0 && (
                <>
                  <span style={{ color: '#d0d5e0' }} className="flex-shrink-0">·</span>
                  <div className="flex items-center gap-1 overflow-hidden flex-shrink-0">
                    {insights.tags.map(tag => (
                      <Badge key={tag}
                        className="inline-flex h-auto items-center gap-0.5 rounded-full border-none px-1.5 py-[2px] text-[9px] font-semibold leading-none flex-shrink-0"
                        style={{ backgroundColor: '#e8f0fe', color: '#1a52b4' }}>
                        <TagIcon tag={tag} />{tag}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Image gallery */}
          <div className="relative w-[188px] flex-shrink-0 overflow-hidden rounded-xl bg-[#f0f3fa]" style={{ height: 130 }}>
            <img
              key={`${place.placeId}-${imgIdx}`}
              src={imgs[imgIdx]}
              alt={`${place.name} photo ${imgIdx + 1}`}
              className="h-full w-full object-cover"
              onError={e => { (e.target as HTMLImageElement).src = fallback }}
            />
            {imgs.length > 1 && (
              <>
                <button onClick={() => setImgIdx(i => (i - 1 + imgs.length) % imgs.length)}
                  className="absolute left-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/65 transition-colors"
                  aria-label="Previous photo">
                  <ChevronLeft size={13} />
                </button>
                <button onClick={() => setImgIdx(i => (i + 1) % imgs.length)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/65 transition-colors"
                  aria-label="Next photo">
                  <ChevronRight size={13} />
                </button>
                <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1">
                  {imgs.map((_, i) => (
                    <button key={i} onClick={() => setImgIdx(i)}
                      className="h-1.5 w-1.5 rounded-full transition-colors"
                      style={{ backgroundColor: i === imgIdx ? '#fff' : 'rgba(255,255,255,0.45)' }}
                      aria-label={`Photo ${i + 1}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <Separator style={{ backgroundColor: '#eef0f4' }} />

        {/* ── 2 · BrowserUse Insights ───────────────────────── */}
        <div
          className="pp-s opacity-0"
          style={{ background: 'linear-gradient(160deg, #eef3ff 0%, #f5f8ff 100%)', borderBottom: '1px solid #dce6fc' }}
        >
          {/* Header: title (left) ↔ large pct + grade (right) */}
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-0">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: '#1a73e8' }}>
                <Globe size={17} className="text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[19px] font-black leading-none tracking-tight" style={{ color: '#1a2035' }}>
                    BrowserUse Insights
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest"
                    style={{ backgroundColor: '#fff3e0', color: '#bf5000' }}>
                    BETA
                  </span>
                </div>
                {buStatus === 'loading' ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#1a73e8' }} />
                    <span className="text-[11px] font-semibold" style={{ color: '#1a73e8' }}>
                      Scanning accessibility data…
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] font-semibold" style={{ color: '#6b7a99' }}>
                    ADA Compliance Analysis
                  </p>
                )}
              </div>
            </div>

            {/* Percentage + grade — same font size */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {buStatus === 'loading' ? (
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <Skeleton className="h-11 w-16 rounded-lg" />
                    <Skeleton className="h-2.5 w-12 rounded" />
                  </div>
                  <Skeleton className="h-[2px] w-4" />
                  <Skeleton className="h-16 w-14 rounded-xl" />
                </div>
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-[46px] font-black leading-none tracking-tight" style={{ color: '#1a2035' }}>
                      {insights.adaPercent ?? '--'}%
                    </p>
                    <p className="text-[8px] font-bold uppercase tracking-widest mt-1" style={{ color: '#9aa0b8' }}>ADA met</p>
                  </div>
                  <span className="text-[28px] font-thin" style={{ color: '#d0d5e0' }}>/</span>
                  <div className="flex flex-col items-center rounded-xl px-3.5 py-2" style={{ backgroundColor: g.bg }}>
                    <span className="text-[46px] font-black leading-none tracking-tight text-white">{insights.grade}</span>
                    <span className="text-[8px] font-bold uppercase tracking-widest text-white/60 mt-1">{g.label}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="mx-6 mt-3 mb-4 h-[5px] overflow-hidden rounded-full" style={{ backgroundColor: '#d4defa' }}>
            {buStatus === 'loading' ? (
              <Skeleton className="h-full w-full rounded-full" />
            ) : (
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${insights.adaPercent ?? 0}%`, background: 'linear-gradient(90deg, #1a73e8, #34a853)' }}
              />
            )}
          </div>

          {/* Compliance + Limitations */}
          <div className="grid grid-cols-2 gap-0 px-6 pb-5">
            <div className="pr-5" style={{ borderRight: '1px solid #dce6fc' }}>
              <p className="mb-2.5 text-[12px] font-black uppercase tracking-wide" style={{ color: '#1e8e3e' }}>
                Areas of Compliance
              </p>
              {buStatus === 'loading' ? (
                <ComplianceSkeletons count={4} />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {(insights.compliance ?? []).map(item => (
                    <div key={item} className="flex items-start gap-2">
                      <CheckCircle2 size={11} className="mt-0.5 flex-shrink-0" style={{ color: '#1e8e3e' }} />
                      <span className="text-[11px] font-medium leading-snug" style={{ color: '#2d3a50' }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pl-5">
              <p className="mb-2.5 text-[12px] font-black uppercase tracking-wide" style={{ color: '#fa7b17' }}>
                Limitations
              </p>
              {buStatus === 'loading' ? (
                <ComplianceSkeletons count={2} />
              ) : (
                <div className="flex flex-col gap-1.5">
                  {(insights.limitations ?? []).map(item => (
                    <div key={item} className="flex items-start gap-2">
                      <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" style={{ color: '#fa7b17' }} />
                      <span className="text-[11px] font-medium leading-snug" style={{ color: '#2d3a50' }}>{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── 3 · Projective View ───────────────────────────── */}
        <div className="pp-s px-5 py-4 opacity-0">
          <div
            className="relative overflow-hidden rounded-2xl cursor-pointer transition-transform duration-200 hover:scale-[1.015] active:scale-[0.99]"
            style={{ height: 80, backgroundColor: '#050820' }}
            role="button"
            tabIndex={0}
            aria-label="Enter Projective View"
            onClick={onView3D}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onView3D?.() }}
          >
            <EtheralShadow
              className="absolute inset-0"
              color="rgba(26, 55, 210, 1)"
              animation={{ scale: 88, speed: 75 }}
              noise={{ opacity: 0.5, scale: 1.1 }}
              sizing="fill"
            />
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1">
              <TextScramble
                as="span"
                trigger={scramble}
                duration={0.9}
                speed={0.033}
                className="text-[15px] font-black tracking-tight text-white"
              >
                Enter Projective View
              </TextScramble>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
