'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { animate, createScope } from 'animejs'
import { Nunito } from 'next/font/google'
import { Waves } from '@/components/ui/wave-background'
import { TextScramble } from '@/components/ui/text-scramble'
import { Glow } from '@/components/ui/glow'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
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
  Locate,
  Loader2,
  Box,
} from 'lucide-react'
import { GoogleMapView, type GoogleMapHandle, type MapPlace } from '@/components/map/google-map'
import { PlacePanel } from '@/components/map/place-panel'
import { SplatViewer } from '@/components/splat/splat-viewer'
import { SplatJobPanel } from '@/components/splat/splat-job-panel'

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
})

interface Place {
  placeId: string
  name: string
  address: string
  location: { lat: number; lng: number }
  rating: number | null
  userRatingsTotal: number
  types: string[]
  openNow: boolean | null
  photoRef?: string | null
  score?: {
    grade: string
    tags: string[]
    summary: string
  }
  scoring?: boolean
}

interface Suggestion {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
}

function getGradeConfig(grade: string): { bg: string; border: string } {
  const l = grade[0].toUpperCase()
  if (l === 'A') return { bg: '#1e8e3e', border: '#1a7a37' }
  if (l === 'B') return { bg: '#1a73e8', border: '#1557b0' }
  if (l === 'C') return { bg: '#f9ab00', border: '#d6940a' }
  if (l === 'D') return { bg: '#fa7b17', border: '#e06c0e' }
  return { bg: '#d93025', border: '#c5221f' }
}

function getGlowVars(grade: string): React.CSSProperties {
  const l = grade[0].toUpperCase()
  if (l === 'A') return { '--brand': '142 60% 34%', '--brand-foreground': '142 60% 52%' } as React.CSSProperties
  if (l === 'B') return { '--brand': '211 80% 45%', '--brand-foreground': '211 80% 62%' } as React.CSSProperties
  if (l === 'C') return { '--brand': '43 96% 44%',  '--brand-foreground': '43 96% 60%'  } as React.CSSProperties
  if (l === 'D') return { '--brand': '27 96% 48%',  '--brand-foreground': '27 96% 65%'  } as React.CSSProperties
  return           { '--brand': '4 78% 42%',   '--brand-foreground': '4 78% 60%'   } as React.CSSProperties
}

function tagIcon(tag: string) {
  switch (tag) {
    case 'Wheelchair':  return <Accessibility size={10} />
    case 'Elevator':    return <ArrowUpDown size={10} />
    case 'ADA':         return <ShieldCheck size={10} />
    case 'Parking':     return <Car size={10} />
    default:            return <MapPin size={10} />
  }
}

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
    setTimeout(() => setIndex((prev) => (prev + 1) % LOADING_PHRASES.length), 2400)
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
      <p className="mt-2.5 select-none text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'rgba(26,58,107,0.4)' }}>
        please wait
      </p>
    </div>
  )
}

const SUGGESTED_PROMPTS = [
  'Accessible malls near me',
  'Ramp-accessible libraries',
  'Wheelchair-friendly restaurants',
  'ADA compliant museums',
  'Accessible transit stations',
]

function LocationCard({ place, selected, onClick, onView3D }: { place: Place; selected: boolean; onClick: () => void; onView3D: (place: Place) => void }) {
  const grade       = place.score?.grade
  const gradeConfig = grade ? getGradeConfig(grade) : null
  const glowVars    = grade ? getGlowVars(grade) : null
  const accentColor = gradeConfig?.bg ?? '#1a73e8'
  const photoUrl    = place.photoRef
    ? `/api/places/photo?ref=${encodeURIComponent(place.photoRef)}&w=200`
    : null

  return (
    <Card
      onClick={onClick}
      className={`relative flex-row gap-0 overflow-hidden rounded-2xl border p-0 shadow-sm transition-all duration-200 cursor-pointer group h-[76px]
        ${selected
          ? 'border-[#1a73e8] shadow-[0_4px_20px_rgba(26,115,232,0.22)] bg-[#f0f6ff]'
          : 'border-[#eaecf0] hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:border-[#c8d0e0]'
        }`}
    >
      {glowVars && !selected && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0" style={glowVars}>
          <Glow variant="top" className="opacity-[0.12]" />
        </div>
      )}

      {/* Photo thumbnail — no z-10 so it doesn't leak into the sidebar stacking context */}
      <div className="relative w-[68px] flex-shrink-0 overflow-hidden h-full">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={place.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: accentColor + '14' }}>
            <MapPin size={18} style={{ color: accentColor }} />
          </div>
        )}
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col justify-center px-3.5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[13.5px] font-bold leading-snug transition-colors"
            style={{ color: selected ? '#1a52b4' : '#1a2035' }}>
            {place.name}
          </h3>
          {place.scoring && <Loader2 size={11} className="animate-spin flex-shrink-0" style={{ color: '#9aa0b8' }} />}
          {grade && !place.scoring && (
            <span className="flex-shrink-0 rounded-full px-1.5 py-[2px] text-[9px] font-black text-white leading-none"
              style={{ backgroundColor: gradeConfig?.bg }}>
              {grade}
            </span>
          )}
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium truncate" style={{ color: '#6b7a99' }}>
          <MapPin size={9} className="flex-shrink-0" />
          <span className="truncate">{place.address}</span>
        </p>
        {place.score && place.score.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {place.score.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} className="inline-flex h-auto items-center gap-0.5 rounded-full border-none px-1.5 py-[2px] text-[9px] font-semibold leading-none"
                style={{ backgroundColor: selected ? '#dce8fe' : '#e8f0fe', color: '#1a52b4' }}>
                {tagIcon(tag)}
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* View in 3D button */}
      <button
        onClick={(e) => { e.stopPropagation(); onView3D(place) }}
        className="absolute bottom-2 right-2 z-10 flex h-6 items-center gap-1 rounded-full px-2 text-[9px] font-bold transition-colors hover:bg-[#1a73e8] hover:text-white"
        style={{ backgroundColor: '#e8f0fe', color: '#1a52b4' }}
        title="View in 3D"
      >
        <Box size={10} />
        3D
      </button>
    </Card>
  )
}

const MAPS_KEY = process.env.NEXT_PUBLIC_MAPS_KEY ?? ''

export default function MapPage() {
  const sidebarRef    = useRef<HTMLDivElement>(null)
  const scopeRef      = useRef<{ revert: () => void } | null>(null)
  const mapHandleRef    = useRef<GoogleMapHandle>(null)
  const searchTimeout   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nearbyPlacesRef = useRef<Place[]>([])

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [mapCenter, setMapCenter]       = useState<{ lat: number; lng: number }>({ lat: 32.8801, lng: -117.2340 })
  const [places, setPlaces]             = useState<Place[]>([])
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [mapLoaded, setMapLoaded]       = useState(false)

  const [query, setQuery]                     = useState('')
  const [suggestions, setSuggestions]         = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [visibleCount, setVisibleCount]       = useState(5)
  const [searchError, setSearchError]         = useState<string | null>(null)

  const [splatJobId, setSplatJobId]             = useState<string | null>(null)
  const [splatModelUrl, setSplatModelUrl]       = useState<string | null>(null)
  const [showSplatViewer, setShowSplatViewer]   = useState(false)
  const [showSplatPanel, setShowSplatPanel]     = useState(false)

  useEffect(() => {
    scopeRef.current = createScope({ root: sidebarRef }).add(() => {
      animate('.sidebar-header', { translateX: [-28, 0], opacity: [0, 1], duration: 650, ease: 'outExpo' })
      animate('.search-section',  { translateX: [-28, 0], opacity: [0, 1], duration: 650, delay: 80,  ease: 'outExpo' })
      animate('.nearby-header',   { translateX: [-22, 0], opacity: [0, 1], duration: 550, delay: 180, ease: 'outExpo' })
    })
    return () => scopeRef.current?.revert()
  }, [])

  const scorePlace = useCallback(async (placeId: string) => {
    setPlaces((prev) => prev.map((p) => p.placeId === placeId ? { ...p, scoring: true } : p))
    try {
      const detailRes  = await fetch(`/api/places/details?placeId=${placeId}`)
      const detailData = await detailRes.json()
      if (!detailData.detail) return
      const scoreRes  = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detail: detailData.detail }),
      })
      const scoreData = await scoreRes.json()
      setPlaces((prev) => prev.map((p) => p.placeId === placeId ? { ...p, scoring: false, score: scoreData.score } : p))
      nearbyPlacesRef.current = nearbyPlacesRef.current.map((p) =>
        p.placeId === placeId ? { ...p, scoring: false, score: scoreData.score } : p
      )
    } catch {
      setPlaces((prev) => prev.map((p) => p.placeId === placeId ? { ...p, scoring: false } : p))
    }
  }, [])

  const fetchNearby = useCallback(async (loc: { lat: number; lng: number }) => {
    setLoading(true)
    setVisibleCount(5)
    setSearchError(null)
    try {
      const res  = await fetch(`/api/places/nearby?lat=${loc.lat}&lng=${loc.lng}&radius=1500`)
      const data = await res.json()
      const raw: Place[] = (data.places ?? []).map((p: Place) => ({
        placeId: p.placeId, name: p.name, address: p.address, location: p.location,
        rating: p.rating, userRatingsTotal: p.userRatingsTotal, types: p.types, openNow: p.openNow,
        photoRef: p.photoRef ?? null,
      }))
      nearbyPlacesRef.current = raw
      setPlaces(raw)
      // Do NOT auto-select on boot — user picks their own first result
      ;(async () => { for (const p of raw.slice(0, 5)) await scorePlace(p.placeId) })()
    } finally {
      setLoading(false)
    }
  }, [scorePlace])

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return
    setLoading(true)
    setVisibleCount(5)
    setSearchError(null)
    setShowSuggestions(false)
    setSuggestions([])
    try {
      const loc = userLocation ?? mapCenter
      const res  = await fetch(`/api/places/search?query=${encodeURIComponent(searchQuery)}&lat=${loc.lat}&lng=${loc.lng}`)
      const data = await res.json()
      if (data.error) {
        setSearchError(`Search failed: ${data.error}${data.details ? ` — ${data.details}` : ''}`)
        setPlaces([])
        return
      }
      const raw: Place[] = (data.places ?? []).map((p: Place) => ({
        placeId: p.placeId, name: p.name, address: p.address, location: p.location,
        rating: p.rating, userRatingsTotal: p.userRatingsTotal, types: p.types, openNow: p.openNow,
        photoRef: p.photoRef ?? null,
      }))
      if (raw.length === 0) {
        // nearbysearch+keyword is strict — fall back to autocomplete→details for fuzzy name matching
        const acRes  = await fetch(`/api/places/autocomplete?query=${encodeURIComponent(searchQuery)}&lat=${loc.lat}&lng=${loc.lng}`)
        const acData = await acRes.json()
        const acSuggestions: Suggestion[] = acData.suggestions ?? []

        if (acSuggestions.length === 0) {
          setSearchError('No results found. Try a different search.')
          setPlaces([])
          return
        }

        const detailResults = await Promise.all(
          acSuggestions.slice(0, 5).map(s =>
            fetch(`/api/places/details?placeId=${s.placeId}`)
              .then(r => r.json())
              .then(d => d.detail ?? null)
              .catch(() => null)
          )
        )

        const fallback: Place[] = detailResults
          .filter(Boolean)
          .map((d) => ({
            placeId: d.placeId, name: d.name, address: d.address, location: d.location,
            rating: d.rating, userRatingsTotal: d.userRatingsTotal, types: d.types,
            openNow: d.openNow, photoRef: d.photoRef ?? null,
          }))
          .filter(p => p.location != null)

        if (fallback.length === 0) {
          setSearchError('No results found. Try a different search.')
          setPlaces([])
          return
        }

        setPlaces(fallback)
        setSelectedId(fallback[0].placeId)
        setMapCenter(fallback[0].location)
        mapHandleRef.current?.focusPlace(fallback[0].location)
        ;(async () => { for (const p of fallback.slice(0, 5)) await scorePlace(p.placeId) })()
        return
      }

      setPlaces(raw)
      setSelectedId(raw[0].placeId)
      setMapCenter(raw[0].location)
      mapHandleRef.current?.focusPlace(raw[0].location)
      ;(async () => { for (const p of raw.slice(0, 5)) await scorePlace(p.placeId) })()
    } catch (err) {
      setSearchError(`Request failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      setPlaces([])
    } finally {
      setLoading(false)
    }
  }, [userLocation, mapCenter, scorePlace])

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const loc = { lat: coords.latitude, lng: coords.longitude }
        setUserLocation(loc)
        setMapCenter(loc)
        fetchNearby(loc)
      },
      () => {
        const fallback = { lat: 32.8801, lng: -117.2340 }
        setMapCenter(fallback)
        fetchNearby(fallback)
      }
    )
  }, [fetchNearby])

  const selectPlace = useCallback((place: Place) => {
    if (selectedId === place.placeId) {
      setSelectedId(null)
      return
    }
    setSelectedId(place.placeId)
    setMapCenter(place.location)
    mapHandleRef.current?.focusPlace(place.location)
    if (!place.score && !place.scoring) scorePlace(place.placeId)
  }, [selectedId, scorePlace])

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!value.trim()) {
      setSuggestions([])
      setShowSuggestions(false)
      setSearchError(null)
      setVisibleCount(5)
      // Restore nearby places; if selected place came from a search, keep it at the front
      const nearby = nearbyPlacesRef.current
      if (selectedId && !nearby.some(p => p.placeId === selectedId)) {
        const sel = places.find(p => p.placeId === selectedId)
        setPlaces(sel ? [sel, ...nearby] : nearby)
      } else {
        setPlaces(nearby)
      }
      return
    }
    searchTimeout.current = setTimeout(async () => {
      const loc = userLocation ?? mapCenter
      const res  = await fetch(`/api/places/autocomplete?query=${encodeURIComponent(value)}&lat=${loc.lat}&lng=${loc.lng}`)
      const data = await res.json()
      setSuggestions(data.suggestions ?? [])
      setShowSuggestions(true)
    }, 300)
  }

  const handleSuggestionSelect = async (suggestion: Suggestion) => {
    setQuery(suggestion.mainText)
    setShowSuggestions(false)
    setSuggestions([])
    const detailRes  = await fetch(`/api/places/details?placeId=${suggestion.placeId}`)
    const detailData = await detailRes.json()
    if (!detailData.detail) return
    const d = detailData.detail
    const place: Place = { placeId: d.placeId, name: d.name, address: d.address, location: d.location, rating: d.rating, userRatingsTotal: d.userRatingsTotal, types: d.types, openNow: d.openNow }
    setPlaces((prev) => prev.find((p) => p.placeId === place.placeId) ? prev : [place, ...prev])
    selectPlace(place)
  }

  const handleLocateMe = () => {
    if (userLocation) { setMapCenter({ ...userLocation }); mapHandleRef.current?.focusPlace(userLocation) }
  }

  const handleView3D = useCallback(async (place: Place) => {
    try {
      const res = await fetch('/api/splat/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: place.location.lat, lng: place.location.lng }),
      })
      const data = await res.json()
      if (data.status === 'done' && data.model_url) {
        setSplatModelUrl(data.model_url)
        setShowSplatViewer(true)
      } else if (data.job_id) {
        setSplatJobId(data.job_id)
        setShowSplatPanel(true)
      }
    } catch {
      // Silently fail — user can retry
    }
  }, [])

  const mapPlaces: MapPlace[]   = places.map((p) => ({ placeId: p.placeId, name: p.name, location: p.location, grade: p.score?.grade }))
  const selectedPlace           = places.find(p => p.placeId === selectedId) ?? null

  // Show selected card first, then rest in original order
  const displayedPlaces = (() => {
    const visible = places.slice(0, visibleCount)
    if (!selectedId) return visible
    const selIdx = visible.findIndex(p => p.placeId === selectedId)
    if (selIdx <= 0) return visible
    const reordered = [...visible]
    reordered.splice(selIdx, 1)
    reordered.unshift(visible[selIdx])
    return reordered
  })()

  return (
    <div className={`${nunito.className} relative h-screen overflow-hidden bg-[#dce8fb]`}>

      {/* Map — fills the full canvas */}
      <main className="absolute inset-0">
        <GoogleMapView
          apiKey={MAPS_KEY}
          mapRef={mapHandleRef}
          center={mapCenter}
          places={mapPlaces}
          selectedPlaceId={selectedId}
          userLocation={userLocation}
          onMarkerClick={(placeId) => { const place = places.find((p) => p.placeId === placeId); if (place) selectPlace(place) }}
          onReady={() => setMapLoaded(true)}
        />

        {/* Wave skeleton — fades out once Google Maps tiles are ready */}
        <AnimatePresence>
          {!mapLoaded && (
            <motion.div
              className="absolute inset-0 z-10"
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            >
              <Waves backgroundColor="#dce8fb" strokeColor="rgba(26,82,180,0.18)" pointerSize={0.5} />
              <MapLoadingText font={nunito.className} />
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          variant="outline" size="icon" onClick={handleLocateMe}
          className="absolute bottom-6 right-5 z-20 rounded-full border-[#dadce0] bg-white hover:bg-[#f1f3f4]"
          style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.14)' }}
          aria-label="Center on my location"
        >
          <Locate size={18} style={{ color: '#1a73e8' }} />
        </Button>

        {/* Place detail panel */}
        {selectedPlace && (
          <PlacePanel
            key={selectedPlace.placeId}
            place={selectedPlace}
            onClose={() => setSelectedId(null)}
          />
        )}
      </main>

      {/* Floating sidebar */}
      <aside
        ref={sidebarRef}
        className="absolute bottom-4 left-4 top-4 z-20 flex w-[480px] flex-shrink-0 flex-col overflow-hidden rounded-2xl bg-white"
        style={{ boxShadow: '0 8px 40px rgba(26,58,180,0.13), 0 2px 12px rgba(0,0,0,0.07)' }}
      >
        {/* Header */}
        <div className="sidebar-header flex items-center gap-4 px-6 py-5 opacity-0" style={{ borderBottom: '1px solid #eef0f4' }}>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#1a73e8' }}>
            <Navigation size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-[18px] font-black leading-none tracking-tight" style={{ color: '#1a2035' }}>Straightline</h1>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: '#8a9abf' }}>Accessibility Navigation</p>
          </div>
        </div>

        {/* Search */}
        <div className="search-section relative z-30 px-5 py-5 opacity-0 bg-white border-b border-[#eef0f4]">
          <div className="relative">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#9aa0b8' }} />
            <Input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(query) }}
              onFocus={(e) => {
                if (suggestions.length > 0) setShowSuggestions(true)
                e.currentTarget.style.backgroundColor = '#fff'
                e.currentTarget.style.boxShadow = '0 0 0 2px #1a73e8, 0 2px 12px rgba(26,115,232,0.12)'
                e.currentTarget.style.borderColor = 'transparent'
              }}
              onBlur={(e) => {
                setTimeout(() => setShowSuggestions(false), 150)
                e.currentTarget.style.backgroundColor = '#f5f7fc'
                e.currentTarget.style.boxShadow = ''
                e.currentTarget.style.borderColor = ''
              }}
              placeholder="Search accessible locations..."
              className="h-11 rounded-full border-[#e4e8f0] bg-[#f5f7fc] pl-11 text-[13px] text-[#1a2035] placeholder:text-[#9aa0b8] focus-visible:ring-0"
            />
          </div>

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-5 right-5 top-[calc(100%-10px)] z-30 overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-xl">
              {suggestions.map((s) => (
                <button key={s.placeId} onMouseDown={() => handleSuggestionSelect(s)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f0f4ff]">
                  <MapPin size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#9aa0b8' }} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold" style={{ color: '#1a2035' }}>{s.mainText}</p>
                    <p className="truncate text-[11px]" style={{ color: '#6b7a99' }}>{s.secondaryText}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Suggested prompts — shown when search is empty */}
          {!query && (
            <div className="mt-5">
              <p className="mb-2 px-1 text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: '#b0b8d0' }}>Try searching</p>
              <div className="flex flex-col gap-0.5">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <Button key={i} variant="ghost" onClick={() => { setQuery(prompt); handleSearch(prompt) }} className="h-auto w-full justify-start rounded-xl px-3 py-2.5 text-left hover:bg-[#f0f4ff]" style={{ color: '#1a52b4' }}>
                    <div className="mr-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#e8f0fe' }}>
                      <Search size={10} style={{ color: '#1a73e8' }} />
                    </div>
                    <span className="text-[13px] font-semibold">{prompt}</span>
                    <ChevronRight size={12} className="ml-auto flex-shrink-0 opacity-30" />
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Nearby list */}
        <div className="flex flex-1 flex-col overflow-hidden min-h-0">
          <div className="nearby-header flex items-center justify-between px-6 pb-4 pt-5 opacity-0 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Layers size={14} style={{ color: '#1a73e8' }} />
              <h2 className="text-[13px] font-black uppercase tracking-[0.06em]" style={{ color: '#1a2035' }}>
                {query ? 'Search Results' : 'Nearby Locations'}
              </h2>
            </div>
            <Badge className="h-auto rounded-full border-none px-2.5 py-1 text-[10px] font-bold" style={{ backgroundColor: '#e8f0fe', color: '#1a52b4' }}>
              {places.length} found
            </Badge>
          </div>

          <Separator style={{ backgroundColor: '#eef0f4' }} className="flex-shrink-0" />

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex flex-col gap-2.5 px-5 py-4">
              {loading ? (
                [...Array(5)].map((_, i) => <Skeleton key={i} className="h-[76px] w-full rounded-2xl" />)
              ) : searchError ? (
                <p className="rounded-xl px-2 py-3 text-[13px] font-medium" style={{ color: '#d93025', backgroundColor: '#fce8e6' }}>{searchError}</p>
              ) : (
                <>
                  <AnimatePresence mode="popLayout" initial={false}>
                    {displayedPlaces.map((place) => (
                      <motion.div
                        key={place.placeId}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12, scale: 0.97 }}
                        transition={{ duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] }}
                      >
                        <LocationCard place={place} selected={selectedId === place.placeId} onClick={() => selectPlace(place)} onView3D={handleView3D} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {visibleCount < places.length && (
                    <Button
                      variant="ghost"
                      onClick={() => setVisibleCount((c) => c + 5)}
                      className="w-full rounded-xl py-3 text-[13px] font-semibold hover:bg-[#f0f4ff]"
                      style={{ color: '#1a52b4' }}
                    >
                      Show {Math.min(5, places.length - visibleCount)} more
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Splat job progress panel */}
      {showSplatPanel && splatJobId && (
        <div className="absolute bottom-6 right-5 z-30 w-[340px]">
          <SplatJobPanel
            jobId={splatJobId}
            onComplete={(url) => {
              setSplatModelUrl(url)
              setShowSplatPanel(false)
              setShowSplatViewer(true)
            }}
            onCancel={() => {
              setShowSplatPanel(false)
              setSplatJobId(null)
            }}
          />
        </div>
      )}

      {/* Full-screen splat viewer overlay */}
      {showSplatViewer && splatModelUrl && (
        <SplatViewer
          modelUrl={splatModelUrl}
          onClose={() => {
            setShowSplatViewer(false)
            setSplatModelUrl(null)
          }}
        />
      )}
    </div>
  )
}
