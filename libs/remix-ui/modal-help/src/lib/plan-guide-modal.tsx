import React, { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Generic plan guide modal — a static, interactive demo of the features a
 * paid plan unlocks. Modeled on McpHelpModal: a grid of feature cards, each
 * with an example prompt and a "Demo" button that plays a simulated AI reply
 * (or, if `onSendPrompt` is wired, runs it for real in the assistant).
 *
 * It is plan-agnostic: the caller supplies the plan name/accent and the list
 * of feature demos, so the same component drives the Starter and Pro guides.
 */

export interface PlanGuideDemo {
  key: string
  name: string
  /** Accent dot colour for the card. */
  color: string
  desc: string
  /** Short, quoted example shown on the card. */
  example: string
  /** The prompt run (real or simulated) when the user clicks Demo. */
  prompt: string
  /** Simulated assistant reply (supports <span class="plg-hl">…</span>). */
  mockReply: string
}

export interface PlanGuideModalProps {
  open: boolean
  onClose: () => void
  /** Plan display name, e.g. "Remix Starter" / "Remix Pro". */
  planName: string
  /** Accent colour for the plan badge/header. */
  accent: string
  /** One-line intro under the title. */
  intro: string
  /** Feature demos to render as cards. */
  demos: PlanGuideDemo[]
  /** Optional "back to all guides" affordance. */
  onShowReel?: () => void
  /** Wire to the AI assistant to run prompts for real instead of simulating. */
  onSendPrompt?: (prompt: string) => void
  /** Close the modal after launching a real prompt. */
  closeOnTry?: boolean
}

const KEYFRAMES = `
  @keyframes plgIn { from { opacity: 0; transform: scale(0.92) translateY(20px);} to { opacity: 1; transform: scale(1) translateY(0);} }
  @keyframes plgOverlayIn { from { opacity: 0;} to { opacity: 1;} }
  @keyframes plgMsgIn { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: translateY(0);} }
  @keyframes plgTyping { 0%,60%,100% { opacity: 0.3; transform: translateY(0);} 30% { opacity: 1; transform: translateY(-4px);} }
  @keyframes plgDot { 0%,100% { opacity: 1;} 50% { opacity: 0.4;} }
`

const c = {
  bg: '#1a1a2e', s1: '#222240', s2: '#2a2a4a', cy: '#2fbfb1', cyd: 'rgba(47,191,177,0.12)',
  tx: '#e0e0ec', tm: '#8888aa', td: '#5c5c7a', pu: '#9b7dff', gn: '#6bdb8a'
}

const TypingIndicator: React.FC = () => (
  <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
    {[0, 0.2, 0.4].map((d, i) => (
      <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: c.tm, animation: 'plgTyping 1.4s infinite', animationDelay: `${d}s` }} />
    ))}
  </div>
)

const DemoCard: React.FC<{ demo: PlanGuideDemo; active: boolean; onSelect: () => void; onTry: () => void }> = ({ demo, active, onSelect, onTry }) => {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? 'rgba(47,191,177,0.06)' : hovered ? c.s2 : c.s1,
        border: `0.5px solid ${active ? 'rgba(47,191,177,0.4)' : hovered ? 'rgba(47,191,177,0.3)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 12, padding: 14, cursor: 'pointer', transition: 'all 0.3s', position: 'relative', overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: demo.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: c.tx }}>{demo.name}</span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? c.cy : c.td, marginLeft: 'auto', transition: 'background 0.3s' }} />
      </div>
      <div style={{ fontSize: 11, color: c.tm, lineHeight: 1.5, marginBottom: 10 }}>{demo.desc}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: c.td, background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '6px 8px', lineHeight: 1.5, marginBottom: 10, border: '0.5px solid rgba(255,255,255,0.04)' }}>
        {demo.example}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onTry() }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, color: c.cy, background: c.cyd, border: '0.5px solid rgba(47,191,177,0.2)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
      >
        Demo
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
      </button>
    </div>
  )
}

const PlanGuideModal: React.FC<PlanGuideModalProps> = ({ open, onClose, planName, accent, intro, demos, onShowReel, onSendPrompt, closeOnTry = false }) => {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const replyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (replyTimeout.current) clearTimeout(replyTimeout.current) }, [])

  const handleTry = useCallback((demo: PlanGuideDemo) => {
    if (onSendPrompt) {
      onSendPrompt(demo.prompt)
      if (closeOnTry) onClose()
      return
    }
    setActiveKey(demo.key)
    setMessages([{ role: 'user', content: demo.prompt }])
    setIsTyping(true)
    if (replyTimeout.current) clearTimeout(replyTimeout.current)
    replyTimeout.current = setTimeout(() => {
      setIsTyping(false)
      setMessages((prev) => [...prev, { role: 'assistant', content: demo.mockReply }])
    }, 1600)
  }, [onSendPrompt, closeOnTry, onClose])

  if (!open) return null

  return (
    <>
      <style>{KEYFRAMES}</style>
      <style>{`.plg-hl{color:${c.cy};font-family:'JetBrains Mono',monospace;font-size:11px}`}</style>

      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9998, animation: 'plgOverlayIn 0.3s ease' }} />

      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none' }}>
        <div
          onClick={(e) => e.stopPropagation()}
          data-id="plan-guide-modal"
          style={{ fontFamily: "'DM Sans', sans-serif", color: c.tx, background: c.bg, borderRadius: 20, border: `0.5px solid ${accent}40`, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', animation: 'plgIn 0.5s cubic-bezier(0.34,1.56,0.64,1)', pointerEvents: 'auto' }}
        >
          {/* Header */}
          <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: c.tx, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
              <i className="fas fa-circle-check" style={{ color: accent, fontSize: 16 }}></i>
              {planName} guide
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: accent, background: `${accent}1f`, padding: '3px 10px', borderRadius: 5, border: `0.5px solid ${accent}40` }}>
                Your plan
              </span>
            </h2>
            <div onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, background: c.s1, border: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: c.tm, fontSize: 16 }}>
              &times;
            </div>
          </div>

          {/* Intro */}
          <div style={{ padding: '8px 24px 0', fontSize: 13, color: c.tm, lineHeight: 1.6 }}>{intro}</div>

          {/* Demo cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '20px 24px' }}>
            {demos.map((demo) => (
              <DemoCard key={demo.key} demo={demo} active={activeKey === demo.key} onSelect={() => setActiveKey(demo.key)} onTry={() => handleTry(demo)} />
            ))}
          </div>

          {/* Simulated chat (demo only) */}
          {!onSendPrompt && (
            <div style={{ margin: '0 24px 20px', borderRadius: 12, background: c.s1, border: '0.5px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', fontSize: 12, fontWeight: 500, color: c.tm }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.gn, animation: 'plgDot 2s ease-in-out infinite' }} />
                RemixAI assistant
              </div>
              <div style={{ padding: 14, minHeight: 120, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.length === 0 && !isTyping ? (
                  <div style={{ fontSize: 12, color: c.td, textAlign: 'center', padding: '28px 0', fontStyle: 'italic' }}>
                    Click &ldquo;Demo&rdquo; on any feature above to see it in action
                  </div>
                ) : (
                  <>
                    {messages.map((msg, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, animation: 'plgMsgIn 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, background: msg.role === 'user' ? 'rgba(155,125,255,0.15)' : c.cyd, color: msg.role === 'user' ? c.pu : c.cy }}>
                          {msg.role === 'user' ? 'You' : (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={c.cy} strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="3" /><path d="M5 8h6" /></svg>
                          )}
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.6, color: msg.role === 'user' ? c.tx : c.tm, maxWidth: '85%' }} dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br>') }} />
                      </div>
                    ))}
                    {isTyping && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.cyd }}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={c.cy} strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="3" /><path d="M5 8h6" /></svg>
                        </div>
                        <TypingIndicator />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ padding: '14px 24px', borderTop: '0.5px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {onShowReel ? (
              <button onClick={onShowReel} style={{ fontSize: 12, fontWeight: 500, color: c.cy, background: 'rgba(47,191,177,0.1)', border: '1px solid rgba(47,191,177,0.3)', padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fas fa-chevron-left" style={{ fontSize: 9 }}></i>
                All guides
              </button>
            ) : <span />}
            <button onClick={onClose} style={{ fontSize: 12, fontWeight: 500, color: c.tm, background: c.s1, border: '0.5px solid rgba(255,255,255,0.08)', padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default PlanGuideModal
