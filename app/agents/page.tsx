'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useRef, Suspense } from 'react'
import { Eye, Search, FileText, Check, X, Minus, Navigation } from 'lucide-react'
import { Nunito } from 'next/font/google'

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
})

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
  hidden?: boolean
}

function statusIcon(status: string) {
  if (status === 'met') return <Check size={11} style={{ color: '#1e8e3e' }} />
  if (status === 'not_met') return <X size={11} style={{ color: '#d93025' }} />
  if (status === 'na') return <Minus size={11} style={{ color: '#9aa0b8' }} />
  return <span style={{ fontSize: 11, color: '#9aa0b8' }}>?</span>
}

function statusBg(status: string) {
  if (status === 'met') return 'rgba(30,142,62,0.1)'
  if (status === 'not_met') return 'rgba(217,48,37,0.08)'
  return 'rgba(154,160,184,0.1)'
}

// ── Live messages panel for a BrowserUse session ────────────────────────────
function LiveMessages({ sessionId, color, label }: { sessionId: string; color: string; label: string }) {
  const [messages, setMessages] = useState<BuMessage[]>([])
  const lastIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

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

    return () => clearInterval(poll)
  }, [sessionId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const filteredMsgs = messages.filter(m => !m.hidden && m.summary)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredMsgs.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
            <div style={{ position: 'relative', width: 40, height: 40 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: `2px solid #eef0f4`, borderTopColor: color,
                animation: 'agent-spin 1.2s linear infinite',
              }} />
            </div>
            <p style={{ fontSize: 12, color: '#9aa0b8', fontWeight: 600 }}>Waiting for {label} messages…</p>
          </div>
        )}
        {filteredMsgs.map((msg) => (
          <div key={msg.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 10, background: msg.role === 'ai' ? '#f5f7fc' : '#fff', border: '1px solid #eef0f4' }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 5,
              background: msg.role === 'ai' ? color : '#dadce0',
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, color: '#1a2035', lineHeight: 1.55,
                wordBreak: 'break-word', fontWeight: 500,
              }}>
                {msg.summary}
              </div>
              {msg.type && (
                <span style={{
                  fontSize: 9, color: '#9aa0b8', fontFamily: 'monospace',
                  marginTop: 2, display: 'inline-block', letterSpacing: '0.04em',
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

function PanelHeader({ icon, label, badge, color }: { icon: React.ReactNode; label: string; badge?: React.ReactNode; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 16px',
      borderBottom: '1px solid #eef0f4',
      flexShrink: 0,
      background: '#fff',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: `${color}14`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <span style={{
        fontSize: 11, fontWeight: 800, color: '#1a2035',
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        {label}
      </span>
      {badge && <div style={{ marginLeft: 'auto' }}>{badge}</div>}
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
  const metCount = textChecklist?.filter(i => i.status === 'met').length ?? 0

  return (
    <div className={nunito.className} style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f7fc', color: '#1a2035' }}>
      {/* Header — mirrors the map sidebar header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 20px',
        background: '#fff',
        borderBottom: '1px solid #eef0f4',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,158,133,0.07)',
      }}>
        {/* Logo mark */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          backgroundColor: '#009E85',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Navigation size={15} style={{ color: '#fff' }} />
        </div>

        <div>
          <h1 style={{ fontFamily: 'var(--font-cormorant)', fontWeight: 300, fontSize: '1.4rem', lineHeight: 1, letterSpacing: '-0.02em', color: '#1A1612' }}>
            Straight<em style={{ fontStyle: 'italic', color: '#009E85', letterSpacing: '-0.03em' }}>line</em>
          </h1>
          <p style={{ marginTop: 1, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a9abf' }}>
            Agent Live View
          </p>
        </div>

        <div style={{ marginLeft: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#009E85',
            boxShadow: '0 0 8px rgba(0,158,133,0.5)',
            animation: 'agent-pulse 2s infinite',
          }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1a2035' }}>
            {placeName}
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: '#e0f5f1', borderRadius: 99,
            padding: '4px 10px',
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#007a67' }}>
              {agentCount} agent{agentCount !== 1 ? 's' : ''} scanning
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 1, background: '#eef0f4' }}>
        {/* Visual Agent — iframe */}
        {hasVisual && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            <PanelHeader
              icon={<Eye size={13} style={{ color: '#009E85' }} />}
              label="Visual Agent"
              color="#009E85"
              badge={
                <span style={{ fontSize: 9, fontWeight: 800, color: '#009E85', letterSpacing: '0.1em', textTransform: 'uppercase', background: '#e0f5f1', borderRadius: 99, padding: '3px 8px' }}>
                  LIVE
                </span>
              }
            />
            <iframe
              src={`${visualUrl}${visualUrl!.includes('?') ? '&' : '?'}theme=light`}
              style={{ flex: 1, border: 'none', background: '#f5f7fc' }}
              allow="clipboard-read; clipboard-write"
            />
          </div>
        )}

        {/* Resolver Agent — live messages stream */}
        {hasResolver && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            <PanelHeader
              icon={<Search size={13} style={{ color: '#e8a317' }} />}
              label="Resolver Agent"
              color="#e8a317"
              badge={
                <span style={{ fontSize: 9, fontWeight: 800, color: '#b07a0f', letterSpacing: '0.1em', textTransform: 'uppercase', background: '#fef3dc', borderRadius: 99, padding: '3px 8px' }}>
                  MESSAGES
                </span>
              }
            />
            {resolverSessionId ? (
              <LiveMessages sessionId={resolverSessionId} color="#e8a317" label="resolver" />
            ) : resolverUrl ? (
              <iframe
                src={`${resolverUrl}${resolverUrl.includes('?') ? '&' : '?'}theme=light`}
                style={{ flex: 1, border: 'none', background: '#f5f7fc' }}
                allow="clipboard-read; clipboard-write"
              />
            ) : null}
          </div>
        )}

        {/* Text Agent Results */}
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#fff', overflow: 'hidden' }}>
          <PanelHeader
            icon={<FileText size={13} style={{ color: '#009E85' }} />}
            label="Text Agent"
            color="#009E85"
            badge={
              textChecklist ? (
                <span style={{ fontSize: 9, fontWeight: 800, color: '#007a67', background: '#e0f5f1', borderRadius: 99, padding: '3px 8px' }}>
                  {metCount} found
                </span>
              ) : undefined
            }
          />
          <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
            {textChecklist ? (
              textChecklist.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '9px 16px',
                    borderBottom: idx < textChecklist.length - 1 ? '1px solid #eef0f4' : 'none',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                    background: statusBg(item.status),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {statusIcon(item.status)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1a2035', lineHeight: 1.3 }}>
                      {ITEM_NAMES[item.id] ?? `Item ${item.id}`}
                    </div>
                    {item.sourceQuote && (
                      <div style={{ fontSize: 10, color: '#6b7a99', marginTop: 2, lineHeight: 1.45 }}>
                        {item.sourceQuote}
                      </div>
                    )}
                    {item.sourceLabel && (
                      <div style={{ fontSize: 9, color: '#007a67', marginTop: 2, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {item.sourceLabel}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: '#eef0f4', animation: 'agent-pulse 1.5s infinite', animationDelay: `${i * 0.1}s` }} />
                    <div style={{ height: 11, flex: 1, borderRadius: 5, background: '#eef0f4', animation: 'agent-pulse 1.5s infinite', animationDelay: `${i * 0.12}s` }} />
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
          50% { opacity: 0.45; }
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
    <Suspense fallback={<div style={{ height: '100vh', background: '#f5f7fc' }} />}>
      <AgentPageInner />
    </Suspense>
  )
}
