import React from 'react'

export function NotFound() {
  return (
    <section className="d-flex flex-column align-items-center justify-content-center">
      <img src={'assets/img/remixLogo.webp'} alt="Not Found" style={{ width: '80px', height: '80px' }} />
      <p className="fs-5">No results found</p>
      <p className="fs-6">Please try again with a different search criteria or choose from our template library</p>
    </section>
  )
}
