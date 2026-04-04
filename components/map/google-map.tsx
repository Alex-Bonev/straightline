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
  { center, places, selectedPlaceId, onMarkerClick },
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

  useEffect(() => {
    if (!map) return
    map.panTo(center)
  }, [map, center])

  return (
    <>
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
