import React from 'react'
import { FormattedMessage } from 'react-intl'
import * as packageJson from '../../../../../../package.json'
import { DISCORD_URL, GITHUB_URL, TWITTER_URL, YOUTUBE_URL, SUBSTACK_URL, REMIX_WEBSITE_URL, REMIX_DESKTOP_URL, REMIX_DOCS_URL } from '@remix-ui/helper'

interface HelpMenuProps {
  onClose: () => void
}

export function HelpMenu({ onClose }: HelpMenuProps) {
  return (
    <>
      <div className="hm-overlay" onClick={onClose} />
      <div className="hm-popover" role="menu" aria-label="Help and resources">

        <section className="hm-section">
          <h3 className="hm-section-title">
            <FormattedMessage id="home.learn" defaultMessage="Learn" />
          </h3>
          <a className="hm-row" href={REMIX_DOCS_URL} target="_blank" rel="noreferrer">
            <span className="hm-row-icon"><BookGlyph /></span>
            <span className="hm-row-text">
              <strong><FormattedMessage id="home.documentation" defaultMessage="Documentation" /></strong>
              <small><FormattedMessage id="home.documentationDesc" defaultMessage="Reference, guides, and plugin API" /></small>
            </span>
          </a>
          <a className="hm-row" href="https://remix.ethereum.org/?#activate=LearnEth" target="_blank" rel="noreferrer">
            <span className="hm-row-icon"><CapGlyph /></span>
            <span className="hm-row-text">
              <strong><FormattedMessage id="home.tutorials" defaultMessage="Tutorials" /></strong>
              <small><FormattedMessage id="home.tutorialsDesc" defaultMessage="LearnEth interactive tutorials" /></small>
            </span>
          </a>
          <a className="hm-row" href="https://remix.ethereum.org/?#activate=remixGuide" target="_blank" rel="noreferrer">
            <span className="hm-row-icon"><SparkGlyph /></span>
            <span className="hm-row-text">
              <strong><FormattedMessage id="home.startLearning" defaultMessage="Start learning" /></strong>
              <small><FormattedMessage id="home.startLearningDesc" defaultMessage="Curated path for new Solidity devs" /></small>
            </span>
          </a>
        </section>

        <section className="hm-section">
          <h3 className="hm-section-title">
            <FormattedMessage id="home.community" defaultMessage="Community" />
          </h3>
          <div className="hm-social">
            <a className="hm-social-btn" href={DISCORD_URL} title="Discord" target="_blank" rel="noreferrer">
              <DiscordGlyph /><span>Discord</span>
            </a>
            <a className="hm-social-btn" href={GITHUB_URL} title="GitHub" target="_blank" rel="noreferrer">
              <GitHubGlyph /><span>GitHub</span>
            </a>
            <a className="hm-social-btn" href={TWITTER_URL} title="X" target="_blank" rel="noreferrer">
              <XGlyph /><span>X</span>
            </a>
            <a className="hm-social-btn" href={YOUTUBE_URL} title="YouTube" target="_blank" rel="noreferrer">
              <YouTubeGlyph /><span>YouTube</span>
            </a>
            <a className="hm-social-btn" href={SUBSTACK_URL} title="Substack" target="_blank" rel="noreferrer">
              <SubstackGlyph /><span>Substack</span>
            </a>
          </div>
        </section>

        <section className="hm-section">
          <a className="hm-row hm-row-cta" href={REMIX_DESKTOP_URL} target="_blank" rel="noreferrer">
            <span className="hm-row-icon hm-row-icon-cta"><DownloadGlyph /></span>
            <span className="hm-row-text">
              <strong><FormattedMessage id="home.downloadDesktop" defaultMessage="Download Remix Desktop" /></strong>
              <small><FormattedMessage id="home.downloadDesktopDesc" defaultMessage="macOS, Windows, Linux — work offline with the same UI" /></small>
            </span>
          </a>
        </section>

        <section className="hm-section hm-section-muted">
          <div className="hm-about-row">
            <span className="hm-about-version">Remix v{(packageJson as any).version}</span>
            <a className="hm-about-link" href={REMIX_WEBSITE_URL} target="_blank" rel="noreferrer">
              <FormattedMessage id="home.website" defaultMessage="Website" />
            </a>
          </div>
        </section>

      </div>
    </>
  )
}

function BookGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 0-2 2v0M8 7h6M8 11h6" />
    </svg>
  )
}

function CapGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 10 12 4l10 6-10 6L2 10z M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
    </svg>
  )
}

function SparkGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4 M6 6l2 2M16 16l2 2M16 8l2-2M6 18l2-2" />
    </svg>
  )
}

function DiscordGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.3 5.3a17 17 0 0 0-4.3-1.4l-.2.4a15 15 0 0 1 4 1.3 12 12 0 0 0-4.6-1.5h-4a12 12 0 0 0-4.6 1.5 15 15 0 0 1 4-1.3l-.2-.4A17 17 0 0 0 4.7 5.3 18 18 0 0 0 2 13.9c1.6 1.2 3.3 1.9 5 2.4l.6-1A11 11 0 0 1 5.5 14a8 8 0 0 0 13 0 11 11 0 0 1-2.1 1.3l.6 1c1.7-.5 3.4-1.2 5-2.4a18 18 0 0 0-2.7-8.6zM9.5 13.2c-.9 0-1.6-.9-1.6-2s.7-2 1.6-2 1.6.9 1.6 2-.7 2-1.6 2zm5 0c-.9 0-1.6-.9-1.6-2s.7-2 1.6-2 1.6.9 1.6 2-.7 2-1.6 2z" />
    </svg>
  )
}

function GitHubGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 1.5a10.5 10.5 0 0 0-3.3 20.5c.5.1.7-.2.7-.5v-1.8c-2.9.6-3.5-1.4-3.5-1.4-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.6 1 1.6 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.7-1.4-2.3-.3-4.7-1.2-4.7-5.1 0-1.1.4-2.1 1-2.8-.1-.3-.4-1.4.1-2.9 0 0 .9-.3 2.8 1a9.5 9.5 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.5.2 2.6.1 2.9.7.7 1 1.7 1 2.8 0 3.9-2.4 4.8-4.7 5.1.4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10.5 10.5 0 0 0 12 1.5z" />
    </svg>
  )
}

function XGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zM17.083 19.77h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function YouTubeGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23 7.3a3 3 0 0 0-2-2.1C19.2 4.7 12 4.7 12 4.7s-7.2 0-9 .5a3 3 0 0 0-2.1 2.1A31 31 0 0 0 .5 12a31 31 0 0 0 .4 4.7 3 3 0 0 0 2.1 2.1c1.8.5 9 .5 9 .5s7.2 0 9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-4.7 31 31 0 0 0-.5-4.7zM9.6 15.5V8.5l6.2 3.5z" />
    </svg>
  )
}

function SubstackGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 4h18v3H3V4zm0 5h18v3H3V9zm0 5h18v8l-9-5-9 5v-8z" />
    </svg>
  )
}

function DownloadGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  )
}
