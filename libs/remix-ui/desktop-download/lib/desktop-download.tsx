import React, { useEffect, useState, useContext } from 'react'
import { DesktopDownloadEvent } from '@remix-api'
import { CustomTooltip } from '@remix-ui/helper'
import { FormattedMessage } from 'react-intl'
import './desktop-download.css'
import { TrackingContext } from '@remix-ide/tracking'

interface DesktopDownloadProps {
  className?: string
  compact?: boolean
  variant?: 'button' | 'span' | 'auto'
  style?: React.CSSProperties
  trackingContext?: string // Context for Matomo tracking (e.g., 'hometab', 'dropdown', 'navbar')
}

interface ReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface ReleaseData {
  tag_name: string
  name: string
  published_at: string
  html_url: string
  assets: ReleaseAsset[]
}

interface DetectedDownload {
  url: string
  filename: string
  platform: string
  size: number
}

const GITHUB_API_URL = 'https://api.github.com/repos/remix-project-org/remix-desktop/releases/latest'
const CACHE_KEY = 'remix-desktop-release-cache'
const CACHE_DURATION = 30 * 60 * 1000 // 30 minutes in milliseconds

export const DesktopDownload: React.FC<DesktopDownloadProps> = ({
  className = '',
  compact = true,
  variant = 'button',
  style = {},
  trackingContext = 'unknown'
}) => {
  const [releaseData, setReleaseData] = useState<ReleaseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detectedDownload, setDetectedDownload] = useState<DetectedDownload | null>(null)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends DesktopDownloadEvent = DesktopDownloadEvent>(event: T) => baseTrackEvent?.<T>(event)

  // Detect user's operating system
  const detectOS = (): 'windows' | 'macos' | 'linux' => {
    const userAgent = navigator.userAgent.toLowerCase()
    if (userAgent.includes('win')) return 'windows'
    if (userAgent.includes('mac')) return 'macos'
    return 'linux'
  }

  // Check if cached data is still valid
  const getCachedData = (): ReleaseData | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (!cached) return null

      const { data, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp > CACHE_DURATION) {
        localStorage.removeItem(CACHE_KEY)
        return null
      }

      return data
    } catch {
      localStorage.removeItem(CACHE_KEY)
      return null
    }
  }

  // Cache the release data
  const setCachedData = (data: ReleaseData) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    } catch {
      // Ignore storage errors
    }
  }

  // Fetch release data from GitHub API
  const fetchReleaseData = async (): Promise<ReleaseData> => {
    const response = await fetch(GITHUB_API_URL)
    if (!response.ok) {
      throw new Error(`Failed to fetch release data: ${response.status}`)
    }
    return response.json()
  }

  // Find the appropriate download for the user's OS
  const findDownloadForOS = (assets: ReleaseAsset[], os: string): DetectedDownload | null => {
    let preferredAsset: ReleaseAsset | null = null

    if (os === 'windows') {
      preferredAsset = assets.find(asset =>
        asset.name.toLowerCase().includes('setup') &&
        asset.name.toLowerCase().includes('.exe')
      ) || null
    } else if (os === 'macos') {
      // Check if user is on Apple Silicon (M1/M2/etc.)
      const isAppleSilicon = navigator.userAgent.includes('Macintosh') &&
        (navigator.userAgent.includes('ARM') ||
         /Mac OS X 10_1[5-9]|Mac OS X 1[1-9]|macOS/.test(navigator.userAgent))

      // Prefer ARM64 version for newer Macs, Intel version for older ones
      if (isAppleSilicon) {
        preferredAsset = assets.find(asset =>
          asset.name.toLowerCase().includes('.dmg') &&
          asset.name.toLowerCase().includes('arm64')
        ) || null
      }

      // Fallback to any dmg if ARM64 not found or not Apple Silicon
      if (!preferredAsset) {
        preferredAsset = assets.find(asset =>
          asset.name.toLowerCase().includes('.dmg') &&
          !asset.name.toLowerCase().includes('arm64')
        ) || assets.find(asset =>
          asset.name.toLowerCase().includes('.dmg')
        ) || null
      }
    } else if (os === 'linux') {
      // Prefer .deb for most Linux distributions
      preferredAsset = assets.find(asset =>
        asset.name.toLowerCase().includes('.deb')
      ) || null

      // Fallback to AppImage if no .deb found
      if (!preferredAsset) {
        preferredAsset = assets.find(asset =>
          asset.name.toLowerCase().includes('.appimage')
        ) || null
      }
    }

    if (!preferredAsset) return null

    return {
      url: preferredAsset.browser_download_url,
      filename: preferredAsset.name,
      platform: os,
      size: preferredAsset.size
    }
  }

  // Format file size
  const formatSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // Get platform-specific icon
  const getPlatformIcon = (platform: string): string => {
    switch (platform) {
    case 'windows': return 'fab fa-windows'
    case 'macos': return 'fab fa-apple'
    case 'linux': return 'fab fa-linux'
    default: return 'fas fa-desktop'
    }
  }

  // Get platform display name
  const getPlatformName = (platform: string): string => {
    switch (platform) {
    case 'windows': return 'Windows'
    case 'macos': return 'macOS'
    case 'linux': return 'Linux'
    default: return platform.charAt(0).toUpperCase() + platform.slice(1)
    }
  }

  // Track download click events
  const trackDownloadClick = (platform?: string, filename?: string, variant?: string) => {
    trackMatomoEvent({
      category: 'desktopDownload',
      action: 'click',
      name: `${trackingContext}-${variant || 'button'}`,
      value: platform ? `${platform}-${filename}` : 'releases-page',
      isClick: true
    })
  }

  // Load release data on component mount
  useEffect(() => {
    const loadReleaseData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Try to get cached data first
        const cached = getCachedData()
        if (cached) {
          setReleaseData(cached)
          const os = detectOS()
          const download = findDownloadForOS(cached.assets, os)
          setDetectedDownload(download)
          setLoading(false)
          return
        }

        // Fetch fresh data
        const data = await fetchReleaseData()
        setReleaseData(data)
        setCachedData(data)

        // Find appropriate download for user's OS
        const os = detectOS()
        const download = findDownloadForOS(data.assets, os)
        setDetectedDownload(download)

      } catch (err) {
        console.error('Failed to load release data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load release data')
      } finally {
        setLoading(false)
      }
    }

    loadReleaseData()
  }, [])

  if (loading) {
    return (
      <div className={`d-flex align-items-center ${className}`}>
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <span className="text-muted">
          <FormattedMessage id="desktopDownload.loading" defaultMessage="Loading desktop app info..." />
        </span>
      </div>
    )
  }

  if (error || !releaseData) {
    return (
      <div className={`text-muted ${className}`}>
        <small>
          <FormattedMessage
            id="desktopDownload.error"
            defaultMessage="Unable to load desktop app. Check the {link} for downloads."
            values={{
              link: (
                <a
                  href="https://github.com/remix-project-org/remix-desktop/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-decoration-none"
                >
                  releases page
                </a>
              )
            }}
          />
        </small>
      </div>
    )
  }

  return (
    <div className={`desktop-download ${compact ? 'compact' : 'full'} ${variant === 'span' ? 'span-variant' : ''} ${className}`} style={style}>
      {variant === 'span' ? (
        // Span variant - for use in dropdown items
        <div className="d-flex align-items-center">
          {detectedDownload ? (
            <CustomTooltip
              placement="top"
              tooltipText={`Download ${detectedDownload.filename} (${formatSize(detectedDownload.size)})`}
              tooltipId="desktop-download-tooltip"
            >
              <a
                href={detectedDownload.url}
                className="text-decoration-none d-flex align-items-center"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit' }}
                onClick={(e) => {
                  e.stopPropagation()
                  trackDownloadClick(detectedDownload.platform, detectedDownload.filename, 'span')
                  // Allow the default link behavior
                }}
              >
                <i className={getPlatformIcon(detectedDownload.platform)}></i>
                <span>
                  <FormattedMessage
                    id="desktopDownload.downloadSpan"
                    defaultMessage="Download Remix Desktop {platform} {version}"
                    values={{
                      platform: getPlatformName(detectedDownload.platform),
                      version: releaseData.tag_name
                    }}
                  />
                </span>
              </a>
            </CustomTooltip>
          ) : (
            <CustomTooltip
              placement="top"
              tooltipText={`Remix Desktop ${releaseData.tag_name} - Available for Windows, macOS, and Linux`}
              tooltipId="desktop-download-tooltip"
            >
              <a
                href={releaseData.html_url}
                className="text-decoration-none d-flex align-items-center gap-2"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit' }}
                onClick={(e) => {
                  e.stopPropagation()
                  // Allow the default link behavior
                }}
              >
                <i className="far fa-desktop"></i>
                <span>
                  <FormattedMessage
                    id="desktopDownload.downloadSpanGeneric"
                    defaultMessage="Download Remix Desktop {version}"
                    values={{ version: releaseData.tag_name }}
                  />
                </span>
              </a>
            </CustomTooltip>
          )}
        </div>
      ) : compact ? (
        // Compact layout - single line with additional info below
        <div className="d-flex flex-column gap-1">
          {detectedDownload ? (
            <>
              <CustomTooltip
                placement="top"
                tooltipText={`Download ${detectedDownload.filename} (${formatSize(detectedDownload.size)})`}
                tooltipId="desktop-download-tooltip"
              >
                <a
                  href={detectedDownload.url}
                  className="btn btn-sm btn-primary d-flex align-items-center gap-2"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackDownloadClick(detectedDownload.platform, detectedDownload.filename, 'compact')}
                >
                  <i className={getPlatformIcon(detectedDownload.platform)}></i>
                  <span>
                    <FormattedMessage
                      id="desktopDownload.downloadCompactFull"
                      defaultMessage="Download Remix Desktop {platform} {version}"
                      values={{
                        platform: getPlatformName(detectedDownload.platform),
                        version: releaseData.tag_name
                      }}
                    />
                  </span>
                </a>
              </CustomTooltip>
              <div className="text-muted">
                <small>
                  <a
                    href={releaseData.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decoration-none text-muted"
                  >
                    <FormattedMessage
                      id="desktopDownload.otherVersions"
                      defaultMessage="Other versions and platforms"
                    />
                  </a>
                </small>
              </div>
            </>
          ) : (
            <>
              <CustomTooltip
                placement="top"
                tooltipText={`Remix Desktop ${releaseData.tag_name} - Available for Windows, macOS, and Linux`}
                tooltipId="desktop-download-tooltip"
              >
                <a
                  href={releaseData.html_url}
                  className="btn btn-sm btn-primary d-flex align-items-center gap-2"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackDownloadClick(undefined, undefined, 'compact-fallback')}
                >
                  <i className="far fa-desktop"></i>
                  <span>
                    <FormattedMessage
                      id="desktopDownload.downloadCompactGeneric"
                      defaultMessage="Download Remix Desktop {version}"
                      values={{ version: releaseData.tag_name }}
                    />
                  </span>
                </a>
              </CustomTooltip>
              <div className="text-muted">
                <small>
                  <FormattedMessage
                    id="desktopDownload.noAutoDetect"
                    defaultMessage="Available for Windows, macOS, and Linux"
                  />
                </small>
              </div>
            </>
          )}
        </div>
      ) : (
        // Full layout - original multi-line design
        <div className="d-flex flex-column gap-2">
          <div className="d-flex align-items-center gap-2">
            <h5 className="mb-0">
              <FormattedMessage id="desktopDownload.title" defaultMessage="Remix Desktop" />
            </h5>
            <span className="badge bg-primary">{releaseData.tag_name}</span>
          </div>

          <div className="text-muted mb-2">
            <small>
              <FormattedMessage
                id="desktopDownload.releaseDate"
                defaultMessage="Released {date}"
                values={{ date: formatDate(releaseData.published_at) }}
              />
            </small>
          </div>

          {detectedDownload ? (
            <div className="d-flex flex-column gap-2">
              <CustomTooltip
                placement="top"
                tooltipText={`Download ${detectedDownload.filename} (${formatSize(detectedDownload.size)})`}
                tooltipId="desktop-download-tooltip"
              >
                <a
                  href={detectedDownload.url}
                  className="btn btn-primary d-flex align-items-center gap-2"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackDownloadClick(detectedDownload.platform, detectedDownload.filename, 'full')}
                >
                  <i className={getPlatformIcon(detectedDownload.platform)}></i>
                  <span>
                    <FormattedMessage
                      id="desktopDownload.downloadButton"
                      defaultMessage="Download for {platform}"
                      values={{
                        platform: getPlatformName(detectedDownload.platform)
                      }}
                    />
                  </span>
                </a>
              </CustomTooltip>

              <div className="text-muted">
                <small>
                  {formatSize(detectedDownload.size)} • {' '}
                  <a
                    href={releaseData.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-decoration-none text-muted"
                  >
                    <FormattedMessage
                      id="desktopDownload.otherVersions"
                      defaultMessage="Other versions and platforms"
                    />
                  </a>
                </small>
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              <a
                href={releaseData.html_url}
                className="btn btn-primary d-flex align-items-center gap-2"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackDownloadClick(undefined, undefined, 'full-fallback')}
              >
                <i className="fas fa-external-link-alt"></i>
                <span>
                  <FormattedMessage id="desktopDownload.viewReleases" defaultMessage="View Downloads" />
                </span>
              </a>

              <div className="text-muted">
                <small>
                  <FormattedMessage
                    id="desktopDownload.noAutoDetect"
                    defaultMessage="Available for Windows, macOS, and Linux"
                  />
                </small>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DesktopDownload
