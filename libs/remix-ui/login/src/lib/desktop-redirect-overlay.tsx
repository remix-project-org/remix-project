import React, { useEffect, useState } from 'react'
import { QueryParams } from '@remix-project/remix-lib'
import { useAuth } from '../../../app/src/lib/remix-app/context/auth-context'

/**
 * Full-screen overlay shown in the browser tab that was launched by the
 * Remix Desktop SSO bridge. Once the user is authenticated, it informs them
 * that the session has been handed back to the desktop app and they can
 * safely close this tab.
 */
export const DesktopRedirectOverlay: React.FC = () => {
  const { isAuthenticated, user } = useAuth()
  const [hasDesktopAuth, setHasDesktopAuth] = useState(false)

  useEffect(() => {
    const params = new QueryParams().get() as Record<string, string>
    setHasDesktopAuth(Boolean(params.desktop_auth))
  }, [])

  if (!hasDesktopAuth || !isAuthenticated) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Returning to Remix Desktop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(10, 10, 16, 0.92)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
        color: '#e9eef5',
        padding: 24
      }}
      data-id="desktop-redirect-overlay"
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: '#16161e',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          padding: '36px 32px',
          textAlign: 'center',
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)'
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 20px',
            borderRadius: '50%',
            background: 'rgba(54, 211, 178, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#36d3b2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px', color: '#fff' }}>
          You&apos;re signed in
        </h2>

        {user && (
          <p style={{ fontSize: 14, color: '#9aa4b2', margin: '0 0 18px' }}>
            {user.email || user.name || 'Signed in successfully'}
          </p>
        )}

        <p style={{ fontSize: 15, lineHeight: 1.6, color: '#c4cdd9', margin: '0 0 24px' }}>
          Your Remix Desktop app is now authenticated. You can return to the
          desktop app to continue.
        </p>

        <p style={{ fontSize: 13, color: '#7a8494', margin: 0 }}>
          You can safely close this browser tab.
        </p>
      </div>
    </div>
  )
}
