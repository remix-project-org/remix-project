import React from 'react'

export function LoadingCard() {
  return (
    <div className="bg-white dark:bg-gray-800 border border-theme rounded-lg">
      <div className="flex items-center p-3 overflow-hidden justify-between" style={{ height: '80px', backgroundColor: 'var(--bs-body-bg)' }}>
        <div className="skeleton-badge" style={{
          width: '60px',
          height: '30px',
          borderRadius: '50px',
          backgroundColor: 'var(--bs-secondary)',
          opacity: 0.3,
          animation: 'pulse 1.5s ease-in-out infinite'
        }}></div>
        <div className="skeleton-image" style={{
          height: '150px',
          width: '150px',
          backgroundColor: 'var(--bs-secondary)',
          opacity: 0.3,
          animation: 'pulse 1.5s ease-in-out infinite'
        }}></div>
      </div>
      <div className="p-3" style={{ fontSize: '1rem', zIndex: 1 }}>
        <div className="skeleton-title mb-2" style={{
          height: '20px',
          backgroundColor: 'var(--bs-secondary)',
          opacity: 0.3,
          animation: 'pulse 1.5s ease-in-out infinite'
        }}></div>
        <div className="skeleton-description mb-3" style={{
          height: '40px',
          backgroundColor: 'var(--bs-secondary)',
          opacity: 0.3,
          animation: 'pulse 1.5s ease-in-out infinite'
        }}></div>
        <div className="skeleton-button" style={{
          height: '32px',
          backgroundColor: 'var(--bs-secondary)',
          opacity: 0.3,
          animation: 'pulse 1.5s ease-in-out infinite'
        }}></div>
      </div>
    </div>
  )
}