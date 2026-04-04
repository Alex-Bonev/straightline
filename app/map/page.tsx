'use client'

import { useEffect, useRef } from 'react'
import { animate, createScope, stagger } from 'animejs'
import { Nunito } from 'next/font/google'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
  Minus,
  Plus,
  Locate,
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

// ── Grade config ──────────────────────────────────────────────────────────────

function getGradeConfig(grade: string): { bg: string; border: string } {
  const letter = grade[0].toUpperCase()
  if (letter === 'A') return { bg: '#1e8e3e', border: '#1a7a37' }
  if (letter === 'B') return { bg: '#1a73e8', border: '#1557b0' }
  if (letter === 'C') return { bg: '#f9ab00', border: '#d6940a' }
  if (letter === 'D') return { bg: '#fa7b17', border: '#e06c0e' }
  return { bg: '#d93025', border: '#c5221f' }
}

// ── Mock data (replace with real API / data-fetching layer) ───────────────────

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

// ── Building block data for map skeleton ──────────────────────────────────────

const BUILDING_CLUSTERS = [
  // top-right cluster
  { top: '7%',  left: '52%', w: '11%', h: '9%'  },
  { top: '7%',  left: '65%', w: '13%', h: '13%' },
  { top: '18%', left: '52%', w: '17%', h: '10%' },
  { top: '18%', left: '71%', w: '8%',  h: '7%'  },
  // bottom-left cluster
  { top: '68%', left: '6%',  w: '10%', h: '13%' },
  { top: '68%', left: '18%', w: '14%', h: '9%'  },
  { top: '80%', left: '8%',  w: '12%', h: '8%'  },
  { top: '80%', left: '22%', w: '9%',  h: '11%' },
  // center cluster
  { top: '42%', left: '28%', w: '9%',  h: '11%' },
  { top: '42%', left: '39%', w: '7%',  h: '8%'  },
  { top: '55%', left: '30%', w: '13%', h: '9%'  },
  // scattered
  { top: '22%', left: '8%',  w: '8%',  h: '10%' },
  { top: '34%', left: '60%', w: '10%', h: '8%'  },
  { top: '58%', left: '48%', w: '8%',  h: '7%'  },
]

// ── Location Card ─────────────────────────────────────────────────────────────

function LocationCard({ location }: { location: Location }) {
  const gradeConfig = getGradeConfig(location.grade)

  return (
    <Card className="location-card flex-row gap-0 overflow-hidden rounded-xl border-[#e8eaed] p-0 opacity-0 shadow-none transition-all duration-200 hover:border-[#c5cae9] hover:shadow-[0_3px_12px_rgba(0,0,0,0.1)] cursor-pointer group">
      {/* Image placeholder — swap for <img> when available */}
      <div
        className="relative w-24 flex-shrink-0 overflow-hidden"
        style={{ backgroundColor: location.accentColor + '15' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: location.accentColor + '25' }}
          >
            <MapPin size={18} style={{ color: location.accentColor }} />
          </div>
        </div>
        {/* Future: <img src={location.imageUrl} className="absolute inset-0 h-full w-full object-cover" /> */}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3.5">
        <h3
          className="truncate text-[13px] font-bold leading-tight transition-colors group-hover:text-[#1a73e8]"
          style={{ color: '#202124' }}
        >
          {location.name}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: '#5f6368' }}>
          <Navigation size={9} className="flex-shrink-0" />
          <span>{location.distance}</span>
          <span className="opacity-40">·</span>
          <span className="truncate">{location.address}</span>
        </p>

        {/* Tags */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {location.tags.map((tag, i) => (
            <Badge
              key={i}
              className="inline-flex h-auto items-center gap-1 rounded-full border-none px-2 py-1 text-[10px] font-semibold leading-none"
              style={{ backgroundColor: '#e8f0fe', color: '#1a73e8' }}
            >
              {tag.icon}
              {tag.label}
            </Badge>
          ))}
          {!location.hasMapping && (
            <Badge
              className="inline-flex h-auto items-center gap-1 rounded-full border-none px-2 py-1 text-[10px] font-semibold leading-none"
              style={{ backgroundColor: '#fef7e0', color: '#b06000' }}
            >
              <Map size={10} />
              Map pending
            </Badge>
          )}
        </div>
      </div>

      {/* Grade badge */}
      <div
        className="flex w-[52px] flex-shrink-0 flex-col items-center justify-center gap-1"
        style={{
          backgroundColor: gradeConfig.bg,
          borderLeft: `1px solid ${gradeConfig.border}`,
        }}
      >
        <span className="text-[16px] font-black leading-none tracking-tight text-white">
          {location.grade}
        </span>
        <span className="text-[7px] font-bold uppercase tracking-widest text-white/70">
          score
        </span>
      </div>
    </Card>
  )
}

// ── Map Skeleton ──────────────────────────────────────────────────────────────

function MapSkeleton() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#e8e0d4]">

      {/* ── Roads: horizontal ── */}
      {[14, 32, 50, 67, 83].map((top) => (
        <Skeleton
          key={`hr-${top}`}
          className="absolute h-[6px] rounded-none bg-white/80"
          style={{ top: `${top}%`, left: 0, right: 0 }}
        />
      ))}
      {/* Major boulevard (wider) */}
      <Skeleton
        className="absolute h-[10px] rounded-none bg-white/90"
        style={{ top: '50%', left: 0, right: 0 }}
      />

      {/* ── Roads: vertical ── */}
      {[11, 26, 43, 60, 76].map((left) => (
        <Skeleton
          key={`vr-${left}`}
          className="absolute w-[6px] rounded-none bg-white/80"
          style={{ left: `${left}%`, top: 0, bottom: 0 }}
        />
      ))}
      {/* Major avenue (wider) */}
      <Skeleton
        className="absolute w-[10px] rounded-none bg-white/90"
        style={{ left: '43%', top: 0, bottom: 0 }}
      />

      {/* ── Diagonal boulevard ── */}
      <Skeleton
        className="absolute rounded-none bg-white/90"
        style={{
          top: '10%',
          left: '-5%',
          width: '130%',
          height: '11px',
          transform: 'rotate(-7deg)',
          transformOrigin: 'left center',
        }}
      />

      {/* ── Park (top-left) ── */}
      <Skeleton
        className="absolute rounded-2xl bg-[#c8dfa8]"
        style={{ top: '8%', left: '5%', width: '20%', height: '22%' }}
      >
        <span
          className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold"
          style={{ color: '#4a7a2a' }}
        >
          Park
        </span>
      </Skeleton>

      {/* ── Water feature (right) ── */}
      <Skeleton
        className="absolute bg-[#a8d5f0]"
        style={{
          top: '38%',
          right: '5%',
          width: '17%',
          height: '33%',
          borderRadius: '40% 60% 55% 45% / 50% 40% 60% 50%',
        }}
      />

      {/* ── Building clusters ── */}
      {BUILDING_CLUSTERS.map((b, i) => (
        <Skeleton
          key={`bldg-${i}`}
          className="absolute rounded-sm bg-[rgba(160,140,120,0.28)]"
          style={{ top: b.top, left: b.left, width: b.w, height: b.h }}
        />
      ))}

      {/* ── Location pin ── */}
      <div
        className="absolute"
        style={{ top: '50%', left: '52%', transform: 'translate(-50%, -100%)' }}
      >
        {/* Pulse halo */}
        <div
          className="absolute animate-ping rounded-full"
          style={{
            width: 52,
            height: 52,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(26,115,232,0.18)',
          }}
        />
        {/* Inner dot */}
        <div
          className="absolute rounded-full"
          style={{
            width: 18,
            height: 18,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(26,115,232,0.12)',
            border: '1.5px solid rgba(26,115,232,0.25)',
          }}
        />
        {/* Diamond pin */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: 34,
            height: 34,
            backgroundColor: '#1a73e8',
            borderRadius: '50% 50% 50% 0',
            transform: 'rotate(-45deg)',
            boxShadow: '0 3px 10px rgba(26,115,232,0.55)',
            border: '2.5px solid white',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'rotate(45deg)',
            }}
          >
            <div style={{ width: 10, height: 10, backgroundColor: 'white', borderRadius: '50%' }} />
          </div>
        </div>
      </div>

      {/* ── Integration placeholder pill ── */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
        <div
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold shadow-md"
          style={{
            backgroundColor: 'rgba(255,255,255,0.93)',
            color: '#5f6368',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <Map size={13} style={{ color: '#1a73e8' }} />
          Map provider integration point
          <ChevronRight size={13} className="opacity-50" />
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const sidebarRef = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<HTMLDivElement>(null)
  const scopeRef  = useRef<{ revert: () => void } | null>(null)

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
    <div
      className={`${nunito.className} flex h-screen overflow-hidden bg-[#f1f3f4]`}
    >
      {/* ══════════════════════ Left Sidebar ══════════════════════ */}
      <aside
        ref={sidebarRef}
        className="flex w-[420px] flex-shrink-0 flex-col overflow-hidden bg-white"
        style={{ boxShadow: '2px 0 10px rgba(0,0,0,0.07)', zIndex: 10 }}
      >

        {/* ── Header ── */}
        <div
          className="sidebar-header flex items-center gap-3.5 px-5 py-4 opacity-0"
          style={{ borderBottom: '1px solid #e8eaed' }}
        >
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: '#1a73e8' }}
          >
            <Navigation size={15} className="text-white" />
          </div>
          <div>
            <h1
              className="text-[15px] font-extrabold leading-none tracking-tight"
              style={{ color: '#202124' }}
            >
              Straightline
            </h1>
            <p className="mt-1 text-[11px] font-medium" style={{ color: '#5f6368' }}>
              Accessibility Navigation
            </p>
          </div>
        </div>

        {/* ── Search + Suggestions ── */}
        <div className="search-section px-4 py-4 opacity-0" style={{ borderBottom: '1px solid #e8eaed' }}>
          {/* Search bar */}
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: '#9aa0a6' }}
            />
            <Input
              placeholder="Search accessible locations..."
              className="h-10 rounded-full border-transparent pl-10 text-[13px] placeholder:text-[#9aa0a6] focus-visible:ring-0"
              style={{ backgroundColor: '#f1f3f4', color: '#202124' }}
              onFocus={(e) => {
                e.currentTarget.style.backgroundColor = '#fff'
                e.currentTarget.style.boxShadow = '0 0 0 2px #1a73e8, 0 2px 10px rgba(26,115,232,0.12)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f3f4'
                e.currentTarget.style.boxShadow = ''
              }}
            />
          </div>

          {/* Suggested prompts */}
          <div className="mt-4">
            <p
              className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: '#9aa0a6' }}
            >
              Try searching
            </p>
            <div className="flex flex-col">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  className="h-auto w-full justify-start rounded-xl px-3 py-2.5 text-left text-[12px] font-semibold hover:bg-[#f1f3f4]"
                  style={{ color: '#1a73e8' }}
                >
                  <div
                    className="mr-2.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: '#e8f0fe' }}
                  >
                    <Search size={10} style={{ color: '#1a73e8' }} />
                  </div>
                  {prompt}
                  <ChevronRight size={12} className="ml-auto flex-shrink-0 opacity-35" />
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Nearby Mapped Buildings ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            className="nearby-header flex items-center justify-between px-5 pb-3 pt-4 opacity-0"
          >
            <div className="flex items-center gap-2">
              <Layers size={13} style={{ color: '#1a73e8' }} />
              <h2
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: '#202124' }}
              >
                Nearby Mapped Buildings
              </h2>
            </div>
            <Badge
              className="h-auto rounded-full border-none px-2.5 py-1 text-[10px] font-bold"
              style={{ backgroundColor: '#e8f0fe', color: '#1a73e8' }}
            >
              {MOCK_LOCATIONS.length} found
            </Badge>
          </div>

          <Separator className="mx-5 w-auto" style={{ width: 'calc(100% - 2.5rem)' }} />

          <ScrollArea className="flex-1 px-4 pt-3 pb-4">
            <div className="flex flex-col gap-3">
              {MOCK_LOCATIONS.map((location) => (
                <LocationCard key={location.id} location={location} />
              ))}
            </div>
          </ScrollArea>
        </div>
      </aside>

      {/* ══════════════════════ Map Area ══════════════════════ */}
      <main ref={mapRef} className="relative flex-1 overflow-hidden opacity-0">
        <MapSkeleton />

        {/* Zoom controls */}
        <div
          className="absolute right-4 top-4 overflow-hidden rounded-xl border border-[#dadce0] bg-white"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.14)' }}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-none border-b border-[#dadce0] hover:bg-[#f1f3f4]"
            aria-label="Zoom in"
          >
            <Plus size={16} style={{ color: '#3c4043' }} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-none hover:bg-[#f1f3f4]"
            aria-label="Zoom out"
          >
            <Minus size={16} style={{ color: '#3c4043' }} />
          </Button>
        </div>

        {/* Locate me */}
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-10 right-4 rounded-full border-[#dadce0] bg-white hover:bg-[#f1f3f4]"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.14)' }}
          aria-label="Center on my location"
        >
          <Locate size={18} style={{ color: '#1a73e8' }} />
        </Button>

        {/* Attribution */}
        <div
          className="absolute bottom-2 right-2 rounded px-1.5 py-0.5 text-[9px] font-medium"
          style={{ backgroundColor: 'rgba(255,255,255,0.85)', color: '#5f6368' }}
        >
          Map data © Straightline
        </div>
      </main>
    </div>
  )
}
