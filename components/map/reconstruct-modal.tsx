'use client'

import { useState, useRef, useCallback } from 'react'
import { X, Upload, ImagePlus, RotateCw, Trash2 } from 'lucide-react'

interface ImageEntry {
  file: File
  preview: string
  azimuth: number
}

const AZIMUTH_PRESETS = [
  { label: 'Front', value: 0 },
  { label: 'Front-Right', value: 45 },
  { label: 'Right', value: 90 },
  { label: 'Back-Right', value: 135 },
  { label: 'Back', value: 180 },
  { label: 'Back-Left', value: 225 },
  { label: 'Left', value: 270 },
  { label: 'Front-Left', value: 315 },
]

export function ReconstructModal({
  placeName,
  placeId,
  onClose,
  onComplete,
}: {
  placeName: string
  placeId: string
  onClose: () => void
  onComplete: (modelUrl: string) => void
}) {
  const [images, setImages] = useState<ImageEntry[]>([])
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((files: FileList | File[]) => {
    const newImages: ImageEntry[] = []
    const remaining = 8 - images.length

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i]
      if (!file.type.startsWith('image/')) continue
      // Auto-assign azimuth based on position
      const idx = images.length + newImages.length
      const azimuth = AZIMUTH_PRESETS[idx % AZIMUTH_PRESETS.length].value
      newImages.push({
        file,
        preview: URL.createObjectURL(file),
        azimuth,
      })
    }

    setImages(prev => [...prev, ...newImages])
  }, [images.length])

  const removeImage = (idx: number) => {
    setImages(prev => {
      const next = [...prev]
      URL.revokeObjectURL(next[idx].preview)
      next.splice(idx, 1)
      return next
    })
  }

  const updateAzimuth = (idx: number, azimuth: number) => {
    setImages(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], azimuth }
      return next
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const startReconstruction = async () => {
    if (images.length === 0) return

    setStatus('uploading')
    setProgress('Preparing images...')

    // Convert files to data URLs
    const imageData: { azimuth: number; dataUrl: string }[] = []
    for (const img of images) {
      const dataUrl = await fileToDataUrl(img.file)
      imageData.push({ azimuth: img.azimuth, dataUrl })
    }

    setProgress('Uploading to World Labs...')

    try {
      const postRes = await fetch('/api/worldlabs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeName,
          placeId,
          images: imageData,
        }),
      })

      if (!postRes.ok) {
        const err = await postRes.json()
        throw new Error(err.error || 'Upload failed')
      }

      const { operationId } = await postRes.json()
      setStatus('processing')
      setProgress('Generating 3D model (~5 min)...')

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const pollRes = await fetch(
            `/api/worldlabs/generate?operationId=${operationId}&placeName=${encodeURIComponent(placeName)}&placeId=${placeId}`
          )
          const poll = await pollRes.json()

          if (poll.status === 'done') {
            clearInterval(pollInterval)
            setStatus('done')
            setProgress('3D model ready!')
            // Auto-display after short delay
            setTimeout(() => onComplete(poll.modelUrl), 1000)
          } else if (poll.status === 'error') {
            clearInterval(pollInterval)
            setStatus('error')
            setProgress(poll.error ?? 'Generation failed')
          }
        } catch {
          // Keep polling on network errors
        }
      }, 5000)
    } catch (e) {
      setStatus('error')
      setProgress(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  const isWorking = status === 'uploading' || status === 'processing'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {/* Backdrop */}
      <div
        onClick={isWorking ? undefined : onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      />

      {/* Modal */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 560,
        background: 'white', borderRadius: 16,
        boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #eef0f4' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1a2035', margin: 0 }}>
              3D Reconstruction
            </h2>
            <p style={{ fontSize: 11, color: '#6b7a99', margin: '2px 0 0', fontWeight: 500 }}>
              Interior isn't available. Help us by uploading up to 8 photos of <strong>{placeName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isWorking}
            style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid #eef0f4',
              background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isWorking ? 'not-allowed' : 'pointer', color: '#6b7a99',
              opacity: isWorking ? 0.4 : 1,
            }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 20 }}>
          {/* Drop zone */}
          {images.length < 8 && status === 'idle' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? '#009E85' : '#d0d5e0'}`,
                borderRadius: 12,
                padding: '24px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? 'rgba(0,158,133,0.04)' : '#fafbfc',
                transition: 'all 0.2s',
                marginBottom: images.length > 0 ? 16 : 0,
              }}
            >
              <ImagePlus size={28} style={{ color: dragOver ? '#009E85' : '#9aa0b8', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12, fontWeight: 600, color: '#1a2035', margin: '0 0 4px' }}>
                Drop images here or click to browse
              </p>
              <p style={{ fontSize: 10, color: '#9aa0b8', margin: 0 }}>
                JPG, PNG, or WebP — {8 - images.length} more allowed
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
              />
            </div>
          )}

          {/* Image grid */}
          {images.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {images.map((img, i) => (
                <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: '#f0f3fa', aspectRatio: '1' }}>
                  <img src={img.preview} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

                  {/* Azimuth selector */}
                  {status === 'idle' && (
                    <select
                      value={img.azimuth}
                      onChange={e => updateAzimuth(i, Number(e.target.value))}
                      style={{
                        position: 'absolute', bottom: 4, left: 4, right: 4,
                        fontSize: 9, fontWeight: 700, padding: '2px 4px',
                        borderRadius: 4, border: 'none',
                        background: 'rgba(0,0,0,0.7)', color: 'white',
                        cursor: 'pointer',
                      }}
                    >
                      {AZIMUTH_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label} ({p.value}°)</option>
                      ))}
                    </select>
                  )}

                  {/* Remove button */}
                  {status === 'idle' && (
                    <button
                      onClick={() => removeImage(i)}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)', border: 'none',
                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: 10,
                      }}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Status */}
          {isWorking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0 0' }}>
              <RotateCw size={14} style={{ color: '#009E85', animation: 'spin 1.2s linear infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#009E85' }}>{progress}</span>
            </div>
          )}
          {status === 'done' && (
            <div style={{ padding: '16px 0 0' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1e8e3e' }}>{progress}</span>
            </div>
          )}
          {status === 'error' && (
            <div style={{ padding: '16px 0 0' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#d93025' }}>{progress}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {status === 'idle' && images.length > 0 && (
          <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                fontSize: 12, fontWeight: 700, padding: '8px 16px',
                borderRadius: 8, border: '1px solid #eef0f4',
                background: 'white', color: '#6b7a99', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={startReconstruction}
              style={{
                fontSize: 12, fontWeight: 700, padding: '8px 20px',
                borderRadius: 8, border: 'none',
                background: '#009E85', color: 'white', cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#008572' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#009E85' }}
            >
              <Upload size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
              Reconstruct ({images.length} image{images.length !== 1 ? 's' : ''})
            </button>
          </div>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  )
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
