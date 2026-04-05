interface CacheEntry {
  jobId: string
  modelUrl: string
  createdAt: number
}

const cache = new Map<string, CacheEntry>()

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)}:${lng.toFixed(4)}`
}

export function getCachedSplat(lat: number, lng: number): CacheEntry | null {
  return cache.get(cacheKey(lat, lng)) ?? null
}

export function setCachedSplat(lat: number, lng: number, entry: CacheEntry): void {
  cache.set(cacheKey(lat, lng), entry)
}
