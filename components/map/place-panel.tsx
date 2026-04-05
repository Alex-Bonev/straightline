'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { animate, stagger } from 'animejs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { EtheralShadow } from '@/components/ui/etheral-shadow'
import { TextScramble } from '@/components/ui/text-scramble'
import {
  ChevronLeft, ChevronRight, MapPin,
  Globe, X,
} from 'lucide-react'

interface Place {
  placeId: string
  name: string
  address: string
  types: string[]
}

type ChecklistItemStatus = 'met' | 'not_met' | 'unknown' | 'na'

interface ChecklistItem {
  id: number
  status: ChecklistItemStatus
  sourceUrl: string | null
  sourceLabel: string | null
  sourceQuote: string | null
  naReason: string | null
}

interface BrowserUseInsights {
  checklist: ChecklistItem[]
  metCount: number
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

const CHECKLIST_INFO: Record<number, { label: string; explanation: string; adaRef: string }> = {
  1:  { label: 'Accessible Route',       explanation: 'A continuous, obstacle-free path from public street or parking to the entrance — including curb cuts and no stairs.', adaRef: 'Priority 1 · Section 1A' },
  2:  { label: 'Accessible Entrance',    explanation: 'Step-free entry usable without assistance. Includes automatic doors or push-button openers. Must not require using a separate side entrance.', adaRef: 'Priority 1 · Section 1B' },
  3:  { label: 'Door Width & Type',      explanation: 'Entry doors must provide at least 32" of clear width. Automatic openers or push-button assistors count toward compliance.', adaRef: 'Priority 1 · Section 1C' },
  4:  { label: 'Ramp Availability',      explanation: 'Where level changes exist, a ramp must be present with a slope no steeper than 1:12 (one inch of rise per 12 inches of run).', adaRef: 'Priority 1 · Section 1D' },
  5:  { label: 'Accessible Parking',     explanation: 'Designated accessible parking spaces with a proper access aisle, located as close as possible to the accessible entrance.', adaRef: 'Priority 1 · Section 1A' },
  6:  { label: 'Elevator / Lift',        explanation: 'If the building has more than one story, an elevator or platform lift must serve all publicly accessible floors.', adaRef: 'Priority 2 · Section 2B' },
  7:  { label: 'Accessible Restroom',    explanation: 'At least one restroom must have grab bars, sufficient turning radius (60"), and fixtures reachable from a wheelchair.', adaRef: 'Priority 3 · Section 3A' },
  8:  { label: 'Interior Pathway Width', explanation: 'Interior corridors and aisles must be at least 36" wide and kept free of obstructions to allow wheelchair navigation.', adaRef: 'Priority 2 · Section 2A' },
  9:  { label: 'Service Counter Height', explanation: 'At least one section of any service or reception counter must be no higher than 36" to be reachable from a seated wheelchair position.', adaRef: 'Priority 2 · Section 2F' },
  10: { label: 'Accessible Signage',     explanation: 'The International Symbol of Accessibility (ISA) must mark accessible entrances, restrooms, parking, and routes throughout the facility.', adaRef: 'Priority 2 · Section 2G' },
}

function statusStyle(status: ChecklistItemStatus) {
  switch (status) {
    case 'met':     return { icon: '✓', itemBg: '#f0f9f0', itemBorder: '#1e8e3e', iconColor: '#1e8e3e', slideColor: '#1e8e3e' }
    case 'not_met': return { icon: '✗', itemBg: '#fff8f0', itemBorder: '#fa7b17', iconColor: '#fa7b17', slideColor: '#fa7b17' }
    case 'na':      return { icon: '—', itemBg: '#f5f5f8', itemBorder: '#ccc',    iconColor: '#9aa0b8', slideColor: '#ccc'    }
    default:        return { icon: '?', itemBg: '#f5f5f8', itemBorder: '#ccc',    iconColor: '#9aa0b8', slideColor: '#ccc'    }
  }
}

function ChecklistRow({
  item,
  isOpen,
  onToggle,
}: {
  item: ChecklistItem
  isOpen: boolean
  onToggle: () => void
}) {
  const info = CHECKLIST_INFO[item.id]
  if (!info) return null
  const { icon, itemBg, itemBorder, iconColor, slideColor } = statusStyle(item.status)

  return (
    <div>
      {/* Row */}
      <div style={{
        background: itemBg,
        border: `1.5px solid ${itemBorder}`,
        borderRadius: 8,
        padding: '7px 9px',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        position: 'relative',
        zIndex: 2,
      }}>
        <span style={{ color: iconColor, fontSize: 13, flexShrink: 0, width: 14, textAlign: 'center', fontWeight: 700 }}>
          {icon}
        </span>
        <span style={{ fontWeight: 700, fontSize: 10.5, color: '#1a2035', flex: 1, minWidth: 0, lineHeight: 1.3 }}>
          {info.label}
        </span>
        <button
          onClick={onToggle}
          style={{
            fontSize: 8,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '3px 6px',
            borderRadius: 4,
            background: isOpen ? '#1a52b4' : '#e8f0fe',
            color: isOpen ? 'white' : '#1a52b4',
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          aria-label={`${isOpen ? 'Hide' : 'Show'} info for ${info.label}`}
        >
          INFO
        </button>
      </div>

      {/* Slide-out card */}
      <div style={{
        background: 'white',
        borderTop: '1.5px solid transparent',
        borderRight: `1.5px solid ${isOpen ? slideColor : 'transparent'}`,
        borderBottom: `1.5px solid ${isOpen ? slideColor : 'transparent'}`,
        borderLeft: `1.5px solid ${isOpen ? slideColor : 'transparent'}`,
        borderRadius: '0 0 8px 8px',
        maxHeight: isOpen ? 600 : 0,
        overflow: isOpen ? 'auto' : 'hidden',
        transition: 'max-height 0.5s cubic-bezier(0.16, 1, 0.3, 1), padding 0.5s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s ease',
        padding: isOpen ? '11px 9px 10px' : '0 9px',
        marginTop: -4,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Explanation */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9aa0b8', marginBottom: 3 }}>
            Explanation
          </div>
          <div style={{ fontSize: 11, color: '#2d3a50', lineHeight: 1.55 }}>{info.explanation}</div>
          <div style={{ fontSize: 9, color: '#b0b8d0', marginTop: 3, fontStyle: 'italic' }}>{info.adaRef}</div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#eef0f4', margin: '8px 0' }} />

        {/* Referenced source */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9aa0b8', marginBottom: 4 }}>
            Referenced Source
          </div>
          {item.status === 'na' ? (
            <div style={{ fontSize: 11, color: '#9aa0b8', fontStyle: 'italic' }}>
              {item.naReason ?? 'Not applicable for this location.'}
            </div>
          ) : item.sourceQuote ? (
            <>
              <div style={{
                fontSize: 11, color: '#2d3a50', fontStyle: 'italic', lineHeight: 1.5,
                background: '#f5f8ff', borderLeft: '3px solid #1a73e8',
                padding: '6px 8px', borderRadius: '0 4px 4px 0', marginBottom: 6,
              }}>
                &ldquo;{item.sourceQuote}&rdquo;
              </div>
              <div style={{ fontSize: 10, color: '#6b7a99', textAlign: 'right' }}>
                —{' '}
                {item.sourceUrl ? (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#1a73e8', textDecoration: 'underline', fontWeight: 600 }}
                  >
                    {item.sourceLabel ?? 'Source'}
                  </a>
                ) : (
                  <span style={{ fontWeight: 600 }}>{item.sourceLabel ?? 'Source'}</span>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: '#9aa0b8', fontStyle: 'italic' }}>
              No source found. Insufficient information available from web sources for this location.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChecklistSkeleton() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px',
      borderRadius: 8, background: '#f5f5f8', border: '1.5px solid #e8eaed',
    }}>
      <Skeleton className="h-3.5 w-3.5 rounded-full flex-shrink-0" />
      <Skeleton className="h-3 flex-1 rounded" />
      <Skeleton className="h-4 w-8 rounded" />
    </div>
  )
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
  // Tracks the active BrowserUse taskId across effect boundaries so we can
  // cancel a running session even if the place changes before POST resolves.
  const buActiveTaskIdRef               = useRef<string | null>(null)

  const [openInfoId, setOpenInfoId]               = useState<number | null>(null)
  const [adaTooltipVisible, setAdaTooltipVisible] = useState(false)

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
    setOpenInfoId(null)
    setAdaTooltipVisible(false)

    // Cancel any previously running session immediately, even if the last
    // effect's POST hadn't resolved yet (taskId would have been null in the
    // closure but the ref always holds the latest known taskId).
    if (buActiveTaskIdRef.current) {
      fetch(`/api/places/browseruse?taskId=${buActiveTaskIdRef.current}`, { method: 'DELETE' })
      buActiveTaskIdRef.current = null
    }

    let taskId: string | null = null
    let cancelled = false

    // Delay start so React StrictMode cleanup fires before fetch begins,
    // preventing double-invocation from hitting BrowserUse's concurrent limit.
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
        .then(data => {
          if (cancelled) {
            if (data.taskId) fetch(`/api/places/browseruse?taskId=${data.taskId}`, { method: 'DELETE' })
            return
          }
          if (!data.taskId) { setBuStatus('error'); return }
          taskId = data.taskId
          buActiveTaskIdRef.current = data.taskId

          buPollRef.current = setInterval(async () => {
            buPollCountRef.current += 1
            if (buPollCountRef.current > 60) {
              setBuStatus('error')
              clearInterval(buPollRef.current!)
              return
            }
            try {
              const r    = await fetch(`/api/places/browseruse?taskId=${taskId}&name=${encodeURIComponent(place.name)}`)
              const poll = await r.json()
              if (poll.status === 'done') {
                setBuInsights(poll.insights)
                setBuStatus('done')
                buActiveTaskIdRef.current = null
                clearInterval(buPollRef.current!)
              } else if (poll.status === 'error') {
                setBuStatus('error')
                buActiveTaskIdRef.current = null
                clearInterval(buPollRef.current!)
              }
            } catch {
              // network hiccup — keep polling
            }
          }, 6000)
        })
        .catch(() => { if (!cancelled) setBuStatus('error') })
    }, 50)

    return () => {
      cancelled = true
      clearTimeout(startTimer)
      if (buPollRef.current) clearInterval(buPollRef.current)
      // taskId covers the case where the POST resolved before cleanup ran.
      // buActiveTaskIdRef is updated by the next effect mount for place changes.
      if (taskId) {
        fetch(`/api/places/browseruse?taskId=${taskId}`, { method: 'DELETE' })
        buActiveTaskIdRef.current = null
      }
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
      className="place-panel-wrapper absolute bottom-4 right-4 z-30 opacity-0"
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

            {/* Type · address */}
            <div className="flex items-center gap-2 overflow-hidden mt-2" style={{ whiteSpace: 'nowrap' }}>
              <span className="flex-shrink-0 text-[11px] font-semibold" style={{ color: '#9aa0b8' }}>
                {typeLabel(place.types)}
              </span>
              <span style={{ color: '#d0d5e0' }}>·</span>
              <span className="flex shrink items-center gap-1 text-[11px] font-medium overflow-hidden" style={{ color: '#6b7a99' }}>
                <MapPin size={10} className="flex-shrink-0" />
                <span className="truncate">{shortAddress(place.address)}</span>
              </span>
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
          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-0">
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
                <div className="flex items-center gap-1 mt-1">
                  <p className="text-[11px] font-semibold" style={{ color: '#6b7a99' }}>
                    ADA Accessibility Checklist
                  </p>
                  {/* ADA info tooltip */}
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                    <span
                      tabIndex={0}
                      role="button"
                      aria-label="What is the ADA?"
                      onMouseEnter={() => setAdaTooltipVisible(true)}
                      onMouseLeave={() => setAdaTooltipVisible(false)}
                      onFocus={() => setAdaTooltipVisible(true)}
                      onBlur={() => setAdaTooltipVisible(false)}
                      style={{ width: 14, height: 14, borderRadius: '50%', background: '#e8f0fe', color: '#1a52b4', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', flexShrink: 0 }}
                    >
                      i
                    </span>
                    {adaTooltipVisible && (
                      <div style={{ position: 'absolute', left: 18, top: -4, width: 210, background: '#1a2035', color: 'white', fontSize: 10, padding: '8px 10px', borderRadius: 7, lineHeight: 1.5, zIndex: 50, pointerEvents: 'none' }}>
                        The Americans with Disabilities Act (ADA) is a federal civil rights law requiring physical accessibility for people with disabilities in public places.
                        <div style={{ position: 'absolute', left: -4, top: 8, width: 8, height: 8, background: '#1a2035', transform: 'rotate(45deg)' }} />
                      </div>
                    )}
                  </div>
                </div>
                {buStatus === 'loading' && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#1a73e8' }} />
                    <span className="text-[11px] font-semibold" style={{ color: '#1a73e8' }}>
                      Scanning accessibility data…
                    </span>
                  </div>
                )}
                {buStatus === 'error' && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-semibold" style={{ color: '#d93025' }}>
                      Scan unavailable
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* X / 10 count */}
            <div className="flex-shrink-0 text-right">
              {buStatus === 'loading' ? (
                <Skeleton className="h-7 w-16 rounded-lg" />
              ) : buStatus === 'error' ? (
                <span className="text-[11px] font-semibold" style={{ color: '#d93025' }}>Scan failed</span>
              ) : (
                <div>
                  <span className="text-[28px] font-black leading-none tracking-tight" style={{ color: '#1a2035' }}>
                    {buInsights?.metCount ?? 0}
                  </span>
                  <span className="text-[16px] font-bold" style={{ color: '#9aa0b8' }}>
                    {' '}/ 10
                  </span>
                  <p className="text-[8px] font-bold uppercase tracking-widest mt-0.5" style={{ color: '#9aa0b8' }}>
                    items confirmed
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Checklist grid — 2 columns of 5 */}
          {buStatus === 'error' ? (
            <div style={{ padding: '12px 20px 16px' }}>
              <p className="text-[12px] font-medium" style={{ color: '#d93025' }}>
                Could not retrieve accessibility data for this location. This may be because BrowserUse timed out or could not find sufficient information. Try selecting the location again.
              </p>
            </div>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px', padding: '14px 20px 16px' }}>
            {/* Column 1: items 1–5 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {buStatus === 'loading'
                ? Array.from({ length: 5 }).map((_, i) => <ChecklistSkeleton key={i} />)
                : (buInsights?.checklist ?? []).slice(0, 5).map(item => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      isOpen={openInfoId === item.id}
                      onToggle={() => setOpenInfoId(openInfoId === item.id ? null : item.id)}
                    />
                  ))
              }
            </div>
            {/* Column 2: items 6–10 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {buStatus === 'loading'
                ? Array.from({ length: 5 }).map((_, i) => <ChecklistSkeleton key={i} />)
                : (buInsights?.checklist ?? []).slice(5, 10).map(item => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      isOpen={openInfoId === item.id}
                      onToggle={() => setOpenInfoId(openInfoId === item.id ? null : item.id)}
                    />
                  ))
              }
            </div>
          </div>
          )}
        </div>

        {/* ── 3 · Projective View ───────────────────────────── */}
        <div className="pp-s px-5 py-4 opacity-0">
          <div
            className="relative overflow-hidden rounded-2xl cursor-pointer transition-transform duration-200 hover:scale-[1.015] active:scale-[0.99]"
            style={{ height: 80, backgroundColor: '#050820' }}
            role="button"
            tabIndex={0}
            aria-label="Enter Projective View"
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click() }}
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
