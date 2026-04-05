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
}

export interface GoogleMapHandle {
  focusPlace: (location: { lat: number; lng: number }, panelOpen?: boolean) => void
}

function offsetLatLng(
  location: { lat: number; lng: number },
  xPixels: number,
  yPixels: number,
  zoom: number
): { lat: number; lng: number } {
  const scale   = Math.pow(2, zoom)
  const worldX  = ((location.lng + 180) / 360) * 256
  const sinLat  = Math.sin((location.lat * Math.PI) / 180)
  const worldY  = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * 256
  const newX    = worldX + xPixels / scale
  const newY    = worldY + yPixels / scale
  const newLng  = (newX / 256) * 360 - 180
  const n       = Math.PI - (2 * Math.PI * newY) / 256
  const newLat  = (Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))) * 180) / Math.PI
  return { lat: newLat, lng: newLng }
}

interface Props {
  center: { lat: number; lng: number }
  places: MapPlace[]
  selectedPlaceId?: string | null
  onMarkerClick?: (placeId: string) => void
  onReady?: () => void
  userLocation?: { lat: number; lng: number } | null
}

const MapInner = forwardRef<GoogleMapHandle, Props>(function MapInner(
  { center, places, selectedPlaceId, onMarkerClick, onReady, userLocation },
  ref
) {
  const map = useMap()

  useImperativeHandle(ref, () => ({
    focusPlace(location, panelOpen = false) {
      if (map) {
        const zoom   = 17
        const target = offsetLatLng(location, -100, panelOpen ? 100 : 0, zoom)
        map.panTo(target)
        map.setZoom(zoom)
      }
    },
  }), [map])

  useEffect(() => {
    if (!map) return
    map.setOptions({
      mapTypeControl: false,
      rotateControl: false,
      scaleControl: false,
    })
  }, [map])

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
            backgroundColor: '#009E85',
            border: '3px solid #fff',
            boxShadow: '0 2px 10px rgba(0,158,133,0.55)',
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
            background="#009E85"
            borderColor={selectedPlaceId === place.placeId ? '#fff' : 'transparent'}
            glyphColor="#fff"
            scale={selectedPlaceId === place.placeId ? 1.4 : 1}
          />
        </AdvancedMarker>
      ))}
    </>
  )
})

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
        mapTypeControl={false}
        fullscreenControl={false}
        zoomControl={false}
      >
        <MapInner ref={mapRef} {...props} />
      </Map>
    </APIProvider>
  )
}
