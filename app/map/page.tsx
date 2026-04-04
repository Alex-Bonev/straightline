'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { animate, createScope, stagger } from 'animejs'
import { Nunito } from 'next/font/google'
import { Waves } from '@/components/ui/wave-background'
import { TextScramble } from '@/components/ui/text-scramble'
import { Glow } from '@/components/ui/glow'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Search,
  MapPin,
  Navigation,
  Accessibility,
  ArrowUpDown,
  ShieldCheck,
  Car,
  Layers,
  ChevronRight,
  Map,
} from 'lucide-react'

// ── Font ─────────────────────────────────────────────────────────────────────

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface LocationTag {
  label: string
  icon: React.ReactNode
}

interface Location {
  id: number
  name: string
  address: string
  distance: string
  grade: string
  accentColor: string
  tags: LocationTag[]
  hasMapping: boolean
}

// ── Grade helpers ─────────────────────────────────────────────────────────────

function getGradeConfig(grade: string): { bg: string; border: string } {
  const l = grade[0].toUpperCase()
  if (l === 'A') return { bg: '#1e8e3e', border: '#1a7a37' }
  if (l === 'B') return { bg: '#1a73e8', border: '#1557b0' }
  if (l === 'C') return { bg: '#f9ab00', border: '#d6940a' }
  if (l === 'D') return { bg: '#fa7b17', border: '#e06c0e' }
  return { bg: '#d93025', border: '#c5221f' }
}

// Grade-tinted glow — space-separated HSL for the Glow component's CSS vars
function getGlowVars(grade: string): React.CSSProperties {
  const l = grade[0].toUpperCase()
  if (l === 'A') return { '--brand': '142 60% 34%', '--brand-foreground': '142 60% 52%' } as React.CSSProperties
  if (l === 'B') return { '--brand': '211 80% 45%', '--brand-foreground': '211 80% 62%' } as React.CSSProperties
  if (l === 'C') return { '--brand': '43 96% 44%', '--brand-foreground': '43 96% 60%' } as React.CSSProperties
  if (l === 'D') return { '--brand': '27 96% 48%', '--brand-foreground': '27 96% 65%' } as React.CSSProperties
  return { '--brand': '4 78% 42%', '--brand-foreground': '4 78% 60%' } as React.CSSProperties
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_LOCATIONS: Location[] = [
  {
    id: 1,
    name: 'Central Public Library',
    address: '123 Main St',
    distance: '0.3 mi',
    grade: 'A+',
    accentColor: '#1a73e8',
    hasMapping: true,
    tags: [
      { label: 'Wheelchair', icon: <Accessibility size={10} /> },
      { label: 'Elevator', icon: <ArrowUpDown size={10} /> },
      { label: 'ADA', icon: <ShieldCheck size={10} /> },
      { label: 'Parking', icon: <Car size={10} /> },
    ],
  },
  {
    id: 2,
    name: 'Riverside Community Center',
    address: '456 River Ave',
    distance: '0.7 mi',
    grade: 'B+',
    accentColor: '#34a853',
    hasMapping: true,
    tags: [
      { label: 'Wheelchair', icon: <Accessibility size={10} /> },
      { label: 'ADA', icon: <ShieldCheck size={10} /> },
    ],
  },
  {
    id: 3,
    name: 'Westside Shopping Mall',
    address: '789 Commerce Blvd',
    distance: '1.2 mi',
    grade: 'B',
    accentColor: '#fbbc04',
    hasMapping: false,
    tags: [
      { label: 'Elevator', icon: <ArrowUpDown size={10} /> },
      { label: 'Parking', icon: <Car size={10} /> },
    ],
  },
  {
    id: 4,
    name: 'City Hall',
    address: '1 Government Plaza',
    distance: '1.5 mi',
    grade: 'C+',
    accentColor: '#ea4335',
    hasMapping: true,
    tags: [
      { label: 'Wheelchair', icon: <Accessibility size={10} /> },
      { label: 'ADA', icon: <ShieldCheck size={10} /> },
    ],
  },
  {
    id: 5,
    name: 'Oak Street Medical Center',
    address: '321 Oak St',
    distance: '2.1 mi',
    grade: 'A',
    accentColor: '#9334e9',
    hasMapping: false,
    tags: [
      { label: 'Wheelchair', icon: <Accessibility size={10} /> },
      { label: 'Elevator', icon: <ArrowUpDown size={10} /> },
      { label: 'ADA', icon: <ShieldCheck size={10} /> },
      { label: 'Parking', icon: <Car size={10} /> },
    ],
  },
]

const SUGGESTED_PROMPTS = [
  'Accessible malls near me',
  'Ramp-accessible libraries',
  'Wheelchair-friendly restaurants',
  'ADA compliant museums',
  'Accessible transit stations',
]

// ── Location Card ─────────────────────────────────────────────────────────────

function LocationCard({ location }: { location: Location }) {
  const gradeConfig = getGradeConfig(location.grade)
  const glowVars    = getGlowVars(location.grade)

  return (
    <Card
      className="location-card relative flex-row gap-0 overflow-hidden rounded-2xl border-[#eaecf0] p-0 opacity-0 shadow-sm transition-all duration-200 hover:shadow-[0_4px_24px_rgba(0,0,0,0.10)] hover:border-[#c8d0e0] cursor-pointer group"
    >
      {/*
        Grade-tinted glow — contained by the card's overflow-hidden.
        The Glow's radial ellipses are very large but get clipped to the card bounds,
        leaving only a whisper of colour at the top edge. Each card gets its own
        colour derived from the grade so glows never overlap or bleed.
      */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-0"
        style={glowVars}
      >
        <Glow variant="top" className="opacity-[0.13]" />
      </div>

      {/* Image placeholder — swap for <img> when data is available */}
      <div
        className="relative z-10 w-28 flex-shrink-0 overflow-hidden"
        style={{ backgroundColor: location.accentColor + '12' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: location.accentColor + '22' }}
          >
            <MapPin size={20} style={{ color: location.accentColor }} />
          </div>
        </div>
        {/* Future: <img src={location.imageUrl} className="absolute inset-0 h-full w-full object-cover" /> */}
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center px-4 py-4">
        {/* Primary — location name */}
        <h3
          className="truncate text-[15px] font-bold leading-snug transition-colors group-hover:text-[#1a73e8]"
          style={{ color: '#1a2035' }}
        >
          {location.name}
        </h3>

        {/* Secondary — distance + address */}
        <p
          className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium"
          style={{ color: '#6b7a99' }}
        >
          <Navigation size={10} className="flex-shrink-0" />
          <span className="font-semibold" style={{ color: '#3c5080' }}>{location.distance}</span>
          <span className="opacity-35">·</span>
          <span className="truncate">{location.address}</span>
        </p>

        {/* Tertiary — tags */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {location.tags.map((tag, i) => (
            <Badge
              key={i}
              className="inline-flex h-auto items-center gap-1 rounded-full border-none px-2 py-[3px] text-[10px] font-semibold leading-none"
              style={{ backgroundColor: '#e8f0fe', color: '#1a52b4' }}
            >
              {tag.icon}
              {tag.label}
            </Badge>
          ))}
          {!location.hasMapping && (
            <Badge
              className="inline-flex h-auto items-center gap-1 rounded-full border-none px-2 py-[3px] text-[10px] font-semibold leading-none"
              style={{ backgroundColor: '#fef3c7', color: '#92620a' }}
            >
              <Map size={10} />
              Map pending
            </Badge>
          )}
        </div>
      </div>

      {/* Grade badge */}
      <div
        className="relative z-10 flex w-[54px] flex-shrink-0 flex-col items-center justify-center gap-1"
        style={{ backgroundColor: gradeConfig.bg, borderLeft: `1px solid ${gradeConfig.border}` }}
      >
        <span className="text-[18px] font-black leading-none tracking-tight text-white">
          {location.grade}
        </span>
        <span className="text-[7px] font-bold uppercase tracking-widest text-white/65">
          score
        </span>
      </div>
    </Card>
  )
}

// ── Map loading overlay ───────────────────────────────────────────────────────

const LOADING_PHRASES = [
  'map is loading',
  'map is developing',
  'map is being created',
  'map is rendering',
  'map is initializing',
]

function MapLoadingText({ font }: { font: string }) {
  const [index, setIndex] = useState(0)

  const advance = () => {
    setTimeout(() => {
      setIndex((prev) => (prev + 1) % LOADING_PHRASES.length)
    }, 2400)
  }

  return (
    <div className={`${font} pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center`}>
      <AnimatePresence mode="wait">
        <TextScramble
          key={index}
          as="span"
          trigger={true}
          duration={1.1}
          speed={0.04}
          onScrambleComplete={advance}
          className="select-none text-[30px] font-extrabold tracking-tight"
          style={{ color: '#1a3a6b', letterSpacing: '-0.02em' }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        >
          {LOADING_PHRASES[index]}
        </TextScramble>
      </AnimatePresence>
      <p
        className="mt-2.5 select-none text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: 'rgba(26,58,107,0.4)' }}
      >
        please wait
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const sidebarRef = useRef<HTMLDivElement>(null)
  const mapRef     = useRef<HTMLDivElement>(null)
  const scopeRef   = useRef<{ revert: () => void } | null>(null)

  useEffect(() => {
    if (!mapRef.current) return

    animate(mapRef.current, {
      opacity: [0, 1],
      scale: [0.985, 1],
      duration: 900,
      ease: 'outCubic',
    })

    scopeRef.current = createScope({ root: sidebarRef }).add(() => {
      animate('.sidebar-header', {
        translateX: [-28, 0],
        opacity: [0, 1],
        duration: 650,
        ease: 'outExpo',
      })
      animate('.search-section', {
        translateX: [-28, 0],
        opacity: [0, 1],
        duration: 650,
        delay: 80,
        ease: 'outExpo',
      })
      animate('.nearby-header', {
        translateX: [-22, 0],
        opacity: [0, 1],
        duration: 550,
        delay: 180,
        ease: 'outExpo',
      })
      animate('.location-card', {
        translateX: [-30, 0],
        opacity: [0, 1],
        delay: stagger(75, { start: 270 }),
        duration: 500,
        ease: 'outExpo',
      })
    })

    return () => scopeRef.current?.revert()
  }, [])

  return (
    <div className={`${nunito.className} relative h-screen overflow-hidden bg-[#dce8fb]`}>

      {/* ══════════════════════ Map — fills the canvas ══════════════════════ */}
      <main ref={mapRef} className="absolute inset-0 opacity-0">
        <Waves
          backgroundColor="#dce8fb"
          strokeColor="rgba(26,82,180,0.18)"
          pointerSize={0.5}
        />
        <MapLoadingText font={nunito.className} />
      </main>

      {/* ══════════════════════ Floating Sidebar ══════════════════════ */}
      <aside
        ref={sidebarRef}
        className="absolute bottom-4 left-4 top-4 z-10 flex w-[480px] flex-shrink-0 flex-col overflow-hidden rounded-2xl bg-white"
        style={{
          boxShadow: '0 8px 40px rgba(26,58,180,0.13), 0 2px 12px rgba(0,0,0,0.07)',
        }}
      >

        {/* ── Header ── */}
        <div
          className="sidebar-header flex items-center gap-4 px-6 py-5 opacity-0"
          style={{ borderBottom: '1px solid #eef0f4' }}
        >
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: '#1a73e8' }}
          >
            <Navigation size={16} className="text-white" />
          </div>
          <div>
            {/* Level 1 — app name */}
            <h1
              className="text-[18px] font-black leading-none tracking-tight"
              style={{ color: '#1a2035' }}
            >
              Straightline
            </h1>
            {/* Level 2 — subtitle */}
            <p
              className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: '#8a9abf' }}
            >
              Accessibility Navigation
            </p>
          </div>
        </div>

        {/* ── Search + Suggestions ── */}
        <div
          className="search-section px-5 py-5 opacity-0"
          style={{ borderBottom: '1px solid #eef0f4' }}
        >
          {/* Search bar */}
          <div className="relative">
            <Search
              size={15}
              className="absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: '#9aa0b8' }}
            />
            <Input
              placeholder="Search accessible locations..."
              className="h-11 rounded-full border-[#e4e8f0] bg-[#f5f7fc] pl-11 text-[13px] text-[#1a2035] placeholder:text-[#9aa0b8] focus-visible:ring-0"
              onFocus={(e) => {
                e.currentTarget.style.backgroundColor = '#fff'
                e.currentTarget.style.boxShadow = '0 0 0 2px #1a73e8, 0 2px 12px rgba(26,115,232,0.12)'
                e.currentTarget.style.borderColor = 'transparent'
              }}
              onBlur={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f7fc'
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.borderColor = ''
              }}
            />
          </div>

          {/* Suggested prompts */}
          <div className="mt-5">
            {/* Level 3 — section micro-label */}
            <p
              className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.18em]"
              style={{ color: '#b0b8d0' }}
            >
              Try searching
            </p>
            <div className="flex flex-col gap-0.5">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  className="h-auto w-full justify-start rounded-xl px-3 py-2.5 text-left hover:bg-[#f0f4ff]"
                  style={{ color: '#1a52b4' }}
                >
                  <div
                    className="mr-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: '#e8f0fe' }}
                  >
                    <Search size={10} style={{ color: '#1a73e8' }} />
                  </div>
                  {/* Level 4 — prompt text */}
                  <span className="text-[13px] font-semibold">{prompt}</span>
                  <ChevronRight size={12} className="ml-auto flex-shrink-0 opacity-30" />
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Nearby Mapped Buildings ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            className="nearby-header flex items-center justify-between px-6 pb-4 pt-5 opacity-0"
          >
            <div className="flex items-center gap-2">
              <Layers size={14} style={{ color: '#1a73e8' }} />
              {/* Level 2 — section header */}
              <h2
                className="text-[13px] font-black uppercase tracking-[0.06em]"
                style={{ color: '#1a2035' }}
              >
                Nearby Mapped Buildings
              </h2>
            </div>
            <Badge
              className="h-auto rounded-full border-none px-2.5 py-1 text-[10px] font-bold"
              style={{ backgroundColor: '#e8f0fe', color: '#1a52b4' }}
            >
              {MOCK_LOCATIONS.length} found
            </Badge>
          </div>

          <Separator style={{ backgroundColor: '#eef0f4' }} />

          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-3 px-5 py-4">
              {MOCK_LOCATIONS.map((location) => (
                <LocationCard key={location.id} location={location} />
              ))}
            </div>
          </ScrollArea>
        </div>
      </aside>
    </div>
  )
}
