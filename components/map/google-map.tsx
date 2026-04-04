'use client'

import { useEffect, useImperativeHandle, forwardRef } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps'

export interface MapPlace {
  placeId: string
  name: string
  location: { lat: number; lng: number }
  grade?: string
}

export interface GoogleMapHandle {
  focusPlace: (location: { lat: number; lng: number }) => void
}

interface Props {
  center: { lat: number; lng: number }
  places: MapPlace[]
  selectedPlaceId?: string | null
  onMarkerClick?: (placeId: string) => void
  onReady?: () => void
  userLocation?: { lat: number; lng: number } | null
}

function gradeToColor(grade?: string): string {
  if (!grade) return '#1a73e8'
  const letter = grade[0].toUpperCase()
  if (letter === 'A') return '#1e8e3e'
  if (letter === 'B') return '#1a73e8'
  if (letter === 'C') return '#f9ab00'
  if (letter === 'D') return '#fa7b17'
  return '#d93025'
}

// Inner component — has access to the map instance via useMap()
const MapInner = forwardRef<GoogleMapHandle, Props>(function MapInner(
  { center, places, selectedPlaceId, onMarkerClick, onReady, userLocation },
  ref
) {
  const map = useMap()

  useImperativeHandle(ref, () => ({
    focusPlace(location) {
      if (map) {
        map.panTo(location)
        map.setZoom(17)
      }
    },
  }), [map])

  // Fire onReady once the map instance is available (tiles loaded)
  useEffect(() => {
    if (!map) return
    const listener = map.addListener('tilesloaded', () => {
      onReady?.()
      listener.remove()
    })
    return () => listener.remove()
  }, [map, onReady])

  useEffect(() => {
    if (!map) return
    map.panTo(center)
  }, [map, center])

  return (
    <>
      {userLocation && (
        <AdvancedMarker position={userLocation} title="Your location" zIndex={1000}>
          <div style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: '#1a73e8',
            border: '3px solid #fff',
            boxShadow: '0 2px 10px rgba(26,115,232,0.55)',
          }} />
        </AdvancedMarker>
      )}
      {places.map((place) => (
        <AdvancedMarker
          key={place.placeId}
          position={place.location}
          title={place.name}
          onClick={() => onMarkerClick?.(place.placeId)}
        >
          <Pin
            background={gradeToColor(place.grade)}
            borderColor={selectedPlaceId === place.placeId ? '#fff' : 'transparent'}
            glyphColor="#fff"
            scale={selectedPlaceId === place.placeId ? 1.4 : 1}
          />
        </AdvancedMarker>
      ))}
    </>
  )
})

// Outer component — wraps APIProvider + Map, passes ref into MapInner
export function GoogleMapView({
  apiKey,
  mapRef,
  ...props
}: Props & { apiKey: string; mapRef?: React.Ref<GoogleMapHandle> }) {
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        mapId="straightline-map"
        defaultCenter={props.center}
        defaultZoom={14}
        gestureHandling="greedy"
        style={{ width: '100%', height: '100%' }}
      >
        <MapInner ref={mapRef} {...props} />
      </Map>
    </APIProvider>
  )
}
