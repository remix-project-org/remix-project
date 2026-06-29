import React, { useEffect, useRef } from 'react'

interface FeedbackPanelProps {
  isOpen: boolean
  onClose: () => void
  formUrl: string
}

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({ isOpen, onClose, formUrl }) => {
  const panelRef = useRef<HTMLDivElement>(null)

  // Build the embed URL from the form URL
  const embedUrl = formUrl
    ? formUrl.replace('/r/', '/embed/') + '?alignLeft=1&hideTitle=0&transparentBackground=1&dynamicHeight=1'
    : ''

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Load Tally embeds when panel opens
  useEffect(() => {
    if (isOpen && typeof (window as any).Tally !== 'undefined') {
      setTimeout(() => {
        (window as any).Tally.loadEmbeds()
      }, 100)
    }
  }, [isOpen])

  return (
    <>
      {/* Overlay backdrop */}
      <div
        className={`feedback-panel-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />
      {/* Slide-in panel */}
      <div
        ref={panelRef}
        className={`feedback-panel bg-light ${isOpen ? 'open' : ''}`}
      >
        <div className="feedback-panel-header bg-light border-bottom d-flex align-items-center justify-content-between px-3 py-2">
          <div className="d-flex align-items-center gap-2">
            <i className="fas fa-bug text-primary"></i>
            <span className="font-weight-bold" style={{ fontSize: '0.95rem' }}>Send Feedback</span>
          </div>
          <span
            className="feedback-panel-close cursor-pointer p-1"
            onClick={onClose}
            style={{ fontSize: '1.2rem', lineHeight: 1 }}
          >
            <i className="fas fa-times"></i>
          </span>
        </div>
        <div className="feedback-panel-body">
          {isOpen && embedUrl && (
            <iframe
              data-tally-src={embedUrl}
              src={embedUrl}
              loading="lazy"
              width="100%"
              height="100%"
              frameBorder={0}
              title="Feedback Form"
              style={{ border: 'none' }}
            />
          )}
        </div>
      </div>
    </>
  )
}
