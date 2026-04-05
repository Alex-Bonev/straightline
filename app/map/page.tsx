'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { animate, createScope } from 'animejs'
import { Nunito } from 'next/font/google'
import { Waves } from '@/components/ui/wave-background'
import { TextScramble } from '@/components/ui/text-scramble'
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
  Layers,
  ChevronRight,
  Locate,
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
}

interface Suggestion {
  placeId: string
  description: string
  mainText: string
  secondaryText: string
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
          style={{ color: '#006b58', letterSpacing: '-0.02em' }}
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
  'Wheelchair-friendly restaurants',
  'ADA compliant museums',
]

function LocationCard({ place, selected, onClick, onView3D }: { place: Place; selected: boolean; onClick: () => void; onView3D: (place: Place) => void }) {
  const photoUrl = place.photoRef
    ? `/api/places/photo?ref=${encodeURIComponent(place.photoRef)}&w=200`
    : null

  return (
    <Card
      onClick={onClick}
      className={`relative flex-row gap-0 overflow-hidden rounded-2xl border p-0 shadow-sm transition-all duration-200 cursor-pointer group min-h-[76px]
        ${selected
          ? 'border-[#009E85] shadow-[0_4px_20px_rgba(0,158,133,0.22)] bg-[#edfaf7]'
          : 'border-[#eaecf0] hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:border-[#c8d0e0]'
        }`}
    >
      <div className="relative w-[68px] flex-shrink-0 overflow-hidden self-stretch">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={place.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: '#009E8514' }}>
            <MapPin size={18} style={{ color: '#009E85' }} />
          </div>
        )}
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col justify-center px-3.5 py-3">
        <h3 className="truncate text-[13.5px] font-bold leading-snug transition-colors"
          style={{ color: selected ? '#007a67' : '#1a2035' }}>
          {place.name}
        </h3>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium truncate" style={{ color: '#6b7a99' }}>
          <MapPin size={9} className="flex-shrink-0" />
          <span className="truncate">{place.address}</span>
        </p>
      </div>

      {/* View in 3D button */}
      <button
        onClick={(e) => { e.stopPropagation(); onView3D(place) }}
        className="absolute bottom-2 right-2 z-10 flex h-6 items-center gap-1 rounded-full px-2 text-[9px] font-bold transition-colors hover:bg-[#009E85] hover:text-white"
        style={{ backgroundColor: '#e0f5f1', color: '#007a67' }}
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

  const [splatJobId, setSplatJobId]           = useState<string | null>(null)
  const [splatModelUrl, setSplatModelUrl]     = useState<string | null>(null)
  const [showSplatViewer, setShowSplatViewer] = useState(false)
  const [showSplatPanel, setShowSplatPanel]   = useState(false)

  useEffect(() => {
    scopeRef.current = createScope({ root: sidebarRef }).add(() => {
      animate('.sidebar-header', { translateX: [-28, 0], opacity: [0, 1], duration: 650, ease: 'outExpo' })
      animate('.search-section',  { translateX: [-28, 0], opacity: [0, 1], duration: 650, delay: 80,  ease: 'outExpo' })
      animate('.nearby-header',   { translateX: [-22, 0], opacity: [0, 1], duration: 550, delay: 180, ease: 'outExpo' })
    })
    return () => scopeRef.current?.revert()
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
    } finally {
      setLoading(false)
    }
  }, [])

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
        mapHandleRef.current?.focusPlace(fallback[0].location, true)
        return
      }

      setPlaces(raw)
      setSelectedId(raw[0].placeId)
      mapHandleRef.current?.focusPlace(raw[0].location, true)
    } catch (err) {
      setSearchError(`Request failed: ${err instanceof Error ? err.message : 'unknown error'}`)
      setPlaces([])
    } finally {
      setLoading(false)
    }
  }, [userLocation, mapCenter])

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
    mapHandleRef.current?.focusPlace(place.location, true)
  }, [selectedId])

  const handleView3D = useCallback(async (_place: Place) => {
    // Use hardcoded demo model for now
    setSplatModelUrl('/model.spz')
    setShowSplatPanel(false)
    setSplatJobId(null)
    setShowSplatViewer(true)
  }, [])

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

  const mapPlaces: MapPlace[] = places.map((p) => ({ placeId: p.placeId, name: p.name, location: p.location }))
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
    <div className={`${nunito.className} relative h-screen overflow-hidden bg-[#e0f5f1]`}>

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
              <Waves backgroundColor="#e0f5f1" strokeColor="rgba(0,158,133,0.18)" pointerSize={0.5} />
              <MapLoadingText font={nunito.className} />
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          variant="outline" size="icon" onClick={handleLocateMe}
          className="absolute right-4 top-4 z-20 rounded-full border-[#dadce0] bg-white hover:bg-[#f1f3f4] md:top-auto md:bottom-[62px] md:right-[10px]"
          style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.14)' }}
          aria-label="Center on my location"
        >
          <Locate size={18} style={{ color: '#009E85' }} />
        </Button>

        {/* Place detail panel */}
        {selectedPlace && (
          <PlacePanel
            key={selectedPlace.placeId}
            place={selectedPlace}
            onClose={() => setSelectedId(null)}
            onView3D={() => handleView3D(selectedPlace)}
          />
        )}
      </main>

      {/* Floating sidebar */}
      <aside
        ref={sidebarRef}
        className="map-sidebar absolute bottom-0 left-0 right-0 z-20 flex w-full flex-shrink-0 flex-col overflow-hidden rounded-t-2xl bg-white md:bottom-4 md:left-4 md:right-auto md:top-4 md:w-[480px] md:rounded-2xl"
        style={{ boxShadow: '0 8px 40px rgba(0,158,133,0.13), 0 2px 12px rgba(0,0,0,0.07)' }}
      >
        {/* Header */}
        <div className="sidebar-header flex items-center gap-4 px-6 py-5 opacity-0" style={{ borderBottom: '1px solid #eef0f4' }}>
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#009E85' }}>
            <Navigation size={16} className="text-white" />
          </div>
          <div>
            <h1 style={{ fontFamily: 'var(--font-cormorant)', fontWeight: 300, fontSize: '1.6rem', lineHeight: 1, letterSpacing: '-0.02em', color: '#1A1612' }}>
              Straight<em style={{ fontStyle: 'italic', color: '#009E85', letterSpacing: '-0.03em' }}>line</em>
            </h1>
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
                e.currentTarget.style.boxShadow = '0 0 0 2px #009E85, 0 2px 12px rgba(0,158,133,0.12)'
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
                <button key={s.placeId} onMouseDown={() => handleSuggestionSelect(s)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#edfaf7]">
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
                  <Button key={i} variant="ghost" onClick={() => { setQuery(prompt); handleSearch(prompt) }} className="h-auto w-full justify-start rounded-xl px-3 py-2.5 text-left hover:bg-[#edfaf7]" style={{ color: '#007a67' }}>
                    <div className="mr-3 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: '#e0f5f1' }}>
                      <Search size={10} style={{ color: '#009E85' }} />
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
              <Layers size={14} style={{ color: '#009E85' }} />
              <h2 className="text-[13px] font-black uppercase tracking-[0.06em]" style={{ color: '#1a2035' }}>
                {query ? 'Search Results' : 'Nearby Locations'}
              </h2>
            </div>
            <Badge className="h-auto rounded-full border-none px-2.5 py-1 text-[10px] font-bold" style={{ backgroundColor: '#e0f5f1', color: '#007a67' }}>
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
                      className="w-full rounded-xl py-3 text-[13px] font-semibold hover:bg-[#edfaf7]"
                      style={{ color: '#007a67' }}
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
          placeId={selectedId ?? ''}
          onClose={() => {
            setShowSplatViewer(false)
            setSplatModelUrl(null)
          }}
        />
      )}
    </div>
  )
}
