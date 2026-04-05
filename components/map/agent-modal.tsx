'use client'

import { X, Eye, FileText, Check, Minus } from 'lucide-react'

interface AgentLiveUrl {
  type: string
  url: string
}

interface TextChecklistItem {
  id: number
  status: string
  sourceLabel: string | null
  sourceQuote: string | null
}

const ITEM_NAMES: Record<number, string> = {
  1: 'Accessible Route',
  2: 'Accessible Entrance',
  3: 'Door Width & Type',
  4: 'Ramp Availability',
  5: 'Accessible Parking',
  6: 'Elevator / Lift',
  7: 'Accessible Restroom',
  8: 'Interior Pathway Width',
  9: 'Service Counter Height',
  10: 'Accessible Signage',
}

function statusIcon(status: string) {
  if (status === 'met') return <Check size={11} style={{ color: '#1e8e3e' }} />
  if (status === 'not_met') return <X size={11} style={{ color: '#fa7b17' }} />
  if (status === 'na') return <Minus size={11} style={{ color: '#9aa0b8' }} />
  return <span style={{ fontSize: 11, color: '#9aa0b8' }}>?</span>
}

export function AgentModal({
  liveUrls,
  textChecklist,
  onClose,
}: {
  liveUrls: AgentLiveUrl[]
  textChecklist: TextChecklistItem[] | null
  onClose: () => void
}) {
  const visualUrl = liveUrls.find(u => u.type === 'visual')

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 900,
          maxHeight: 'calc(100vh - 48px)',
          background: '#0d1020',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#009E85',
                boxShadow: '0 0 10px rgba(0,158,133,0.5)',
                animation: 'agent-pulse 2s infinite',
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>
              Agent Live View
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
              2 agents scanning
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content: two panels side by side */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left: Visual Agent (iframe) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <Eye size={13} style={{ color: '#009E85' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Visual Agent
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto', fontFamily: 'monospace' }}>
                LIVE
              </span>
            </div>
            <div style={{ flex: 1, background: '#000', position: 'relative', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {visualUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 32 }}>
                  {/* Animated scanning indicator */}
                  <div style={{ position: 'relative', width: 64, height: 64 }}>
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      border: '2px solid rgba(0,158,133,0.15)',
                    }} />
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      border: '2px solid transparent', borderTopColor: '#009E85',
                      animation: 'agent-spin 1.2s linear infinite',
                    }} />
                    <Eye size={22} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#009E85' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', margin: '0 0 6px' }}>
                      Scanning Google Maps Photos
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '0 0 16px', lineHeight: 1.5 }}>
                      The visual agent is browsing entrance and exterior photos to assess physical accessibility features.
                    </p>
                    <a
                      href={`${visualUrl.url}${visualUrl.url.includes('?') ? '&' : '?'}theme=dark`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontSize: 11, fontWeight: 700, color: '#009E85',
                        padding: '6px 14px', borderRadius: 6,
                        background: 'rgba(0,158,133,0.1)',
                        border: '1px solid rgba(0,158,133,0.25)',
                        textDecoration: 'none',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,158,133,0.2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,158,133,0.1)' }}
                    >
                      <Eye size={12} />
                      Watch live in new tab
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32 }}>
                  <div style={{ position: 'relative', width: 48, height: 48 }}>
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      border: '2px solid transparent', borderTopColor: 'rgba(255,255,255,0.15)',
                      animation: 'agent-spin 1.5s linear infinite',
                    }} />
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Starting visual agent...</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: Text Agent (results list) */}
          <div style={{ width: 300, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <FileText size={13} style={{ color: '#009E85' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Text Agent
              </span>
              {textChecklist && (
                <span style={{ fontSize: 10, color: '#009E85', marginLeft: 'auto', fontWeight: 600 }}>
                  {textChecklist.filter(i => i.status === 'met').length} found
                </span>
              )}
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
              {textChecklist ? (
                textChecklist.map(item => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                    }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 5, background: item.status === 'met' ? 'rgba(30,142,62,0.12)' : item.status === 'not_met' ? 'rgba(250,123,23,0.12)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      {statusIcon(item.status)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.75)', lineHeight: 1.3 }}>
                        {ITEM_NAMES[item.id] ?? `Item ${item.id}`}
                      </div>
                      {item.sourceQuote && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, lineHeight: 1.4 }}>
                          {item.sourceQuote}
                        </div>
                      )}
                      {item.sourceLabel && (
                        <div style={{ fontSize: 9, color: 'rgba(0,158,133,0.6)', marginTop: 2, fontWeight: 600 }}>
                          {item.sourceLabel}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, background: 'rgba(255,255,255,0.04)' }} />
                      <div style={{ height: 10, flex: 1, borderRadius: 4, background: 'rgba(255,255,255,0.04)', animation: 'agent-pulse 1.5s infinite', animationDelay: `${i * 0.1}s` }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes agent-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes agent-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
