'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef, Suspense } from 'react'
import { Eye, Search, FileText, Check, X, Minus } from 'lucide-react'

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

interface TextChecklistItem {
  id: number
  status: string
  sourceLabel: string | null
  sourceQuote: string | null
}

interface BuMessage {
  id: string
  role: string
  type: string
  summary: string | null
  data: string | null
  screenshotUrl: string | null
  createdAt: string
}

function statusIcon(status: string) {
  if (status === 'met') return <Check size={11} style={{ color: '#1e8e3e' }} />
  if (status === 'not_met') return <X size={11} style={{ color: '#fa7b17' }} />
  if (status === 'na') return <Minus size={11} style={{ color: '#9aa0b8' }} />
  return <span style={{ fontSize: 11, color: '#9aa0b8' }}>?</span>
}

// ── Live messages panel for a BrowserUse session ────────────────────────────
function LiveMessages({ sessionId, color, label }: { sessionId: string; color: string; label: string }) {
  const [messages, setMessages] = useState<BuMessage[]>([])
  const lastIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!sessionId) return

    const poll = setInterval(async () => {
      try {
        const params = new URLSearchParams({ sessionId })
        if (lastIdRef.current) params.set('after', lastIdRef.current)
        const res = await fetch(`/api/places/browseruse/messages?${params}`)
        const data = await res.json()
        const newMsgs: BuMessage[] = data.messages ?? []
        if (newMsgs.length > 0) {
          lastIdRef.current = newMsgs[newMsgs.length - 1].id
          setMessages(prev => [...prev, ...newMsgs])
        }
      } catch {}
    }, 1500)

    // Also poll session status to know when to stop
    const statusPoll = setInterval(async () => {
      try {
        const res = await fetch(`https://api.browser-use.com/api/v3/sessions/${sessionId}`, {
          headers: { 'Content-Type': 'application/json' },
        })
        // We can't call BU API directly from client without key, so check via our proxy
      } catch {}
    }, 5000)

    return () => {
      clearInterval(poll)
      clearInterval(statusPoll)
    }
  }, [sessionId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filteredMsgs = messages.filter(m => !m.hidden && m.summary)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredMsgs.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
            <div style={{ position: 'relative', width: 48, height: 48 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: `2px solid transparent`, borderTopColor: color,
                animation: 'agent-spin 1.2s linear infinite',
              }} />
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Waiting for {label} messages...</p>
          </div>
        )}
        {filteredMsgs.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 6,
              background: msg.role === 'ai' ? color : 'rgba(255,255,255,0.2)',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5,
                wordBreak: 'break-word',
              }}>
                {msg.summary}
              </div>
              {msg.type && (
                <span style={{
                  fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace',
                  marginTop: 2, display: 'inline-block',
                }}>
                  {msg.type}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function AgentPageInner() {
  const params = useSearchParams()
  const visualUrl = params.get('visual')
  const resolverSessionId = params.get('resolverSessionId')
  const resolverUrl = params.get('resolver')
  const placeName = params.get('name') ?? 'Location'

  const [textChecklist, setTextChecklist] = useState<TextChecklistItem[] | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('straightline_text_checklist')
      if (raw) setTextChecklist(JSON.parse(raw))
    } catch {}
  }, [])

  const hasVisual = !!visualUrl
  const hasResolver = !!resolverSessionId || !!resolverUrl
  const agentCount = 1 + (hasVisual ? 1 : 0) + (hasResolver ? 1 : 0)

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d1020', color: 'white' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#009E85',
          boxShadow: '0 0 10px rgba(0,158,133,0.5)',
          animation: 'agent-pulse 2s infinite',
        }} />
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Agent Live View
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
          {placeName}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>
          {agentCount} agent{agentCount !== 1 ? 's' : ''} scanning
        </span>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Visual Agent — iframe */}
        {hasVisual && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
              <Eye size={13} style={{ color: '#009E85' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Visual Agent
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto', fontFamily: 'monospace' }}>
                LIVE
              </span>
            </div>
            <iframe
              src={`${visualUrl}${visualUrl!.includes('?') ? '&' : '?'}theme=dark`}
              style={{ flex: 1, border: 'none', background: '#000' }}
              allow="clipboard-read; clipboard-write"
            />
          </div>
        )}

        {/* Resolver Agent — live messages stream */}
        {hasResolver && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
              <Search size={13} style={{ color: '#e8a317' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Resolver Agent
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto', fontFamily: 'monospace' }}>
                MESSAGES
              </span>
            </div>
            {resolverSessionId ? (
              <LiveMessages sessionId={resolverSessionId} color="#e8a317" label="resolver" />
            ) : resolverUrl ? (
              <iframe
                src={`${resolverUrl}${resolverUrl.includes('?') ? '&' : '?'}theme=dark`}
                style={{ flex: 1, border: 'none', background: '#000' }}
                allow="clipboard-read; clipboard-write"
              />
            ) : null}
          </div>
        )}

        {/* Text Agent Results */}
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
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
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
                    background: item.status === 'met' ? 'rgba(30,142,62,0.12)' : item.status === 'not_met' ? 'rgba(250,123,23,0.12)' : 'rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
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

export default function AgentsPage() {
  return (
    <Suspense fallback={<div style={{ height: '100vh', background: '#0d1020' }} />}>
      <AgentPageInner />
    </Suspense>
  )
}
