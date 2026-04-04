'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
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
  Locate,
  Loader2,
} from 'lucide-react'
import { GoogleMapView, type GoogleMapHandle, type MapPlace } from '@/components/map/google-map'

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
  const letter = grade[0].toUpperCase()
  if (letter === 'A') return { bg: '#1e8e3e', border: '#1a7a37' }
  if (letter === 'B') return { bg: '#1a73e8', border: '#1557b0' }
  if (letter === 'C') return { bg: '#f9ab00', border: '#d6940a' }
  if (letter === 'D') return { bg: '#fa7b17', border: '#e06c0e' }
  return { bg: '#d93025', border: '#c5221f' }
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

function LocationCard({
  place,
  selected,
  onClick,
}: {
  place: Place
  selected: boolean
  onClick: () => void
}) {
  const grade = place.score?.grade
  const gradeConfig = grade ? getGradeConfig(grade) : null

  return (
    <Card
      onClick={onClick}
      className={`location-card flex-row gap-0 overflow-hidden rounded-xl border-[#e8eaed] p-0 shadow-none transition-all duration-200 hover:border-[#c5cae9] hover:shadow-[0_3px_12px_rgba(0,0,0,0.1)] cursor-pointer group ${selected ? 'border-[#1a73e8] shadow-[0_3px_12px_rgba(26,115,232,0.18)]' : ''}`}
    >
      <div
        className="relative w-24 flex-shrink-0 overflow-hidden"
        style={{ backgroundColor: gradeConfig ? gradeConfig.bg + '18' : '#1a73e815' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: gradeConfig ? gradeConfig.bg + '25' : '#1a73e825' }}
          >
            <MapPin size={18} style={{ color: gradeConfig?.bg ?? '#1a73e8' }} />
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3.5">
        <h3
          className="truncate text-[13px] font-bold leading-tight transition-colors group-hover:text-[#1a73e8]"
          style={{ color: '#202124' }}
        >
          {place.name}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-[11px]" style={{ color: '#5f6368' }}>
          <MapPin size={9} className="flex-shrink-0" />
          <span className="truncate">{place.address}</span>
        </p>
        {place.rating !== null && (
          <p className="mt-0.5 text-[11px]" style={{ color: '#5f6368' }}>
            ★ {place.rating} · {place.userRatingsTotal.toLocaleString()} reviews
          </p>
        )}

        {place.score && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {place.score.tags.map((tag) => (
              <Badge
                key={tag}
                className="inline-flex h-auto items-center gap-1 rounded-full border-none px-2 py-1 text-[10px] font-semibold leading-none"
                style={{ backgroundColor: '#e8f0fe', color: '#1a73e8' }}
              >
                {tagIcon(tag)}
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {place.score?.summary && (
          <p className="mt-2 text-[11px] leading-relaxed line-clamp-2" style={{ color: '#5f6368' }}>
            {place.score.summary}
          </p>
        )}
      </div>

      <div
        className="flex w-[52px] flex-shrink-0 flex-col items-center justify-center gap-1"
        style={
          gradeConfig
            ? { backgroundColor: gradeConfig.bg, borderLeft: `1px solid ${gradeConfig.border}` }
            : { backgroundColor: '#f1f3f4', borderLeft: '1px solid #e8eaed' }
        }
      >
        {place.scoring ? (
          <Loader2
            size={16}
            className="animate-spin"
            style={{ color: '#9aa0a6' }}
          />
        ) : grade ? (
          <>
            <span className="text-[16px] font-black leading-none tracking-tight text-white">
              {grade}
            </span>
            <span className="text-[7px] font-bold uppercase tracking-widest text-white/70">
              score
            </span>
          </>
        ) : (
          <span className="text-[11px] font-semibold" style={{ color: '#9aa0a6' }}>—</span>
        )}
      </div>
    </Card>
  )
}

const MAPS_KEY = process.env.NEXT_PUBLIC_MAPS_KEY ?? ''

export default function MapPage() {
  const sidebarRef    = useRef<HTMLDivElement>(null)
  const scopeRef      = useRef<{ revert: () => void } | null>(null)
  const mapHandleRef  = useRef<GoogleMapHandle>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [mapCenter, setMapCenter]       = useState<{ lat: number; lng: number }>({ lat: 32.8801, lng: -117.2340 })
  const [places, setPlaces]             = useState<Place[]>([])
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)

  const [query, setQuery]                     = useState('')
  const [suggestions, setSuggestions]         = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    scopeRef.current = createScope({ root: sidebarRef }).add(() => {
      animate('.sidebar-header', { translateX: [-28, 0], opacity: [0, 1], duration: 650, ease: 'outExpo' })
      animate('.search-section',  { translateX: [-28, 0], opacity: [0, 1], duration: 650, delay: 80,  ease: 'outExpo' })
      animate('.nearby-header',   { translateX: [-22, 0], opacity: [0, 1], duration: 550, delay: 180, ease: 'outExpo' })
    })
    return () => scopeRef.current?.revert()
  }, [])

  const scorePlace = useCallback(async (placeId: string) => {
    setPlaces((prev) =>
      prev.map((p) => p.placeId === placeId ? { ...p, scoring: true } : p)
    )
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

      setPlaces((prev) =>
        prev.map((p) =>
          p.placeId === placeId
            ? { ...p, scoring: false, score: scoreData.score }
            : p
        )
      )
    } catch {
      setPlaces((prev) =>
        prev.map((p) => p.placeId === placeId ? { ...p, scoring: false } : p)
      )
    }
  }, [])

  const fetchNearby = useCallback(async (loc: { lat: number; lng: number }) => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/places/nearby?lat=${loc.lat}&lng=${loc.lng}&radius=1500`)
      const data = await res.json()
      const raw: Place[] = (data.places ?? []).map((p: Place) => ({
        placeId:          p.placeId,
        name:             p.name,
        address:          p.address,
        location:         p.location,
        rating:           p.rating,
        userRatingsTotal: p.userRatingsTotal,
        types:            p.types,
        openNow:          p.openNow,
      }))
      setPlaces(raw)

      setTimeout(() => {
        animate('.location-card', {
          translateX: [-30, 0],
          opacity:    [0, 1],
          delay:      stagger(60, { start: 0 }),
          duration:   450,
          ease:       'outExpo',
        })
      }, 50)

      // Score top 5 sequentially to avoid rate-limit issues
      ;(async () => {
        for (const p of raw.slice(0, 5)) {
          await scorePlace(p.placeId)
        }
      })()
    } finally {
      setLoading(false)
    }
  }, [scorePlace])

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
    setSelectedId(place.placeId)
    setMapCenter(place.location)
    mapHandleRef.current?.focusPlace(place.location)
    if (!place.score && !place.scoring) {
      scorePlace(place.placeId)
    }
  }, [scorePlace])

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)

    if (!value.trim()) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    searchTimeout.current = setTimeout(async () => {
      const loc = userLocation ?? mapCenter
      const res  = await fetch(
        `/api/places/autocomplete?query=${encodeURIComponent(value)}&lat=${loc.lat}&lng=${loc.lng}`
      )
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
    const place: Place = {
      placeId:          d.placeId,
      name:             d.name,
      address:          d.address,
      location:         d.location,
      rating:           d.rating,
      userRatingsTotal: d.userRatingsTotal,
      types:            d.types,
      openNow:          d.openNow,
    }

    setPlaces((prev) => {
      const exists = prev.find((p) => p.placeId === place.placeId)
      if (exists) return prev
      return [place, ...prev]
    })
    selectPlace(place)
  }

  const handleLocateMe = () => {
    if (userLocation) {
      setMapCenter({ ...userLocation })
      mapHandleRef.current?.focusPlace(userLocation)
    }
  }

  const mapPlaces: MapPlace[] = places.map((p) => ({
    placeId:  p.placeId,
    name:     p.name,
    location: p.location,
    grade:    p.score?.grade,
  }))

  return (
    <div className={`${nunito.className} flex h-screen overflow-hidden bg-[#f1f3f4]`}>

      <aside
        ref={sidebarRef}
        className="flex w-[420px] flex-shrink-0 flex-col overflow-hidden bg-white"
        style={{ boxShadow: '2px 0 10px rgba(0,0,0,0.07)', zIndex: 10 }}
      >
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
            <h1 className="text-[15px] font-extrabold leading-none tracking-tight" style={{ color: '#202124' }}>
              Straightline
            </h1>
            <p className="mt-1 text-[11px] font-medium" style={{ color: '#5f6368' }}>
              Accessibility Navigation
            </p>
          </div>
        </div>

        <div className="search-section relative px-4 py-4 opacity-0" style={{ borderBottom: '1px solid #e8eaed' }}>
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#9aa0a6' }} />
            <Input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Search accessible locations..."
              className="h-10 rounded-full border-transparent pl-10 text-[13px] placeholder:text-[#9aa0a6] focus-visible:ring-0"
              style={{ backgroundColor: '#f1f3f4', color: '#202124' }}
            />
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-4 right-4 top-[calc(100%-8px)] z-20 overflow-hidden rounded-xl border border-[#e8eaed] bg-white shadow-lg">
              {suggestions.map((s) => (
                <button
                  key={s.placeId}
                  onMouseDown={() => handleSuggestionSelect(s)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#f1f3f4] transition-colors"
                >
                  <MapPin size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#9aa0a6' }} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold" style={{ color: '#202124' }}>
                      {s.mainText}
                    </p>
                    <p className="truncate text-[11px]" style={{ color: '#5f6368' }}>
                      {s.secondaryText}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="nearby-header flex items-center justify-between px-5 pb-3 pt-4 opacity-0">
            <div className="flex items-center gap-2">
              <Layers size={13} style={{ color: '#1a73e8' }} />
              <h2 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#202124' }}>
                {query ? 'Search Results' : 'Nearby Locations'}
              </h2>
            </div>
            <Badge
              className="h-auto rounded-full border-none px-2.5 py-1 text-[10px] font-bold"
              style={{ backgroundColor: '#e8f0fe', color: '#1a73e8' }}
            >
              {places.length} found
            </Badge>
          </div>

          <Separator className="mx-5 w-auto" style={{ width: 'calc(100% - 2.5rem)' }} />

          <ScrollArea className="flex-1 px-4 pt-3 pb-4">
            {loading ? (
              <div className="flex flex-col gap-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {places.map((place) => (
                  <LocationCard
                    key={place.placeId}
                    place={place}
                    selected={selectedId === place.placeId}
                    onClick={() => selectPlace(place)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </aside>

      <main className="relative flex-1 overflow-hidden">
        <GoogleMapView
          apiKey={MAPS_KEY}
          mapRef={mapHandleRef}
          center={mapCenter}
          places={mapPlaces}
          selectedPlaceId={selectedId}
          onMarkerClick={(placeId) => {
            const place = places.find((p) => p.placeId === placeId)
            if (place) selectPlace(place)
          }}
        />

        <Button
          variant="outline"
          size="icon"
          onClick={handleLocateMe}
          className="absolute bottom-10 right-4 rounded-full border-[#dadce0] bg-white hover:bg-[#f1f3f4]"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.14)' }}
          aria-label="Center on my location"
        >
          <Locate size={18} style={{ color: '#1a73e8' }} />
        </Button>
      </main>
    </div>
  )
}
