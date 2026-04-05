'use client'

import { useEffect } from 'react'

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

export function AgentModal({
  liveUrls,
  textChecklist,
  placeName,
  resolverSessionId,
  onClose,
}: {
  liveUrls: AgentLiveUrl[]
  textChecklist: TextChecklistItem[] | null
  placeName?: string
  resolverSessionId?: string | null
  onClose: () => void
}) {
  useEffect(() => {
    if (textChecklist) {
      sessionStorage.setItem('straightline_text_checklist', JSON.stringify(textChecklist))
    }

    const params = new URLSearchParams()
    if (placeName) params.set('name', placeName)
    const visual = liveUrls.find(u => u.type === 'visual')
    const resolver = liveUrls.find(u => u.type === 'resolver')
    if (visual) params.set('visual', visual.url)
    // Pass resolver session ID for live messages, fall back to live URL
    if (resolverSessionId) params.set('resolverSessionId', resolverSessionId)
    else if (resolver) params.set('resolver', resolver.url)

    window.open(`/agents?${params}`, 'straightline-agents')
    onClose()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
