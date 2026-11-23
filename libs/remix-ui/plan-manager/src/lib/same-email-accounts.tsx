/**
 * Informational "other accounts with your email" notice.
 *
 * The auth API never links accounts, so credits/subscriptions bought on an
 * account created with another sign-in method (Google, GitHub, wallet, …)
 * are not usable from the current one. Surfacing them stops users from
 * paying twice after switching provider. Help merging goes through support.
 */

import React, { useEffect, useState } from 'react'
import { DISCORD_URL } from '@remix-ui/helper'
import type { SameEmailAccount, SameEmailGroup, SameEmailOverviewResponse } from '@remix-api'

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  discord: 'Discord',
  apple: 'Apple',
  coinbase: 'Coinbase Wallet',
  siwe: 'Ethereum wallet',
  base: 'Base',
  email: 'Email code'
}

const PROVIDER_ICONS: Record<string, string> = {
  google: 'fab fa-google',
  github: 'fab fa-github',
  discord: 'fab fa-discord',
  apple: 'fab fa-apple',
  siwe: 'fab fa-ethereum',
  base: 'fas fa-circle-half-stroke',
  coinbase: 'fas fa-wallet',
  email: 'fas fa-envelope'
}

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: 'active',
  trialing: 'trial',
  past_due: 'payment due',
  paused: 'paused'
}

export function providerLabel(provider: string | null): string {
  if (!provider) return 'Unknown sign-in'
  return PROVIDER_LABELS[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1)
}

function providerIcon(provider: string | null): string {
  return (provider && PROVIDER_ICONS[provider]) || 'fas fa-right-to-bracket'
}

function accountLabel(account: SameEmailAccount): string {
  const detail = account.display_identifier || account.name
  return detail ? `${providerLabel(account.provider)} · ${detail}` : providerLabel(account.provider)
}

function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Human summary of what an unlinked group holds, e.g. ["Starter plan (active)", "100,000 credits"]. */
export function describeGroupValue(group: SameEmailGroup): string[] {
  const parts = group.subscriptions.map(s => {
    const name = s.plan_name || s.plan_slug || 'Subscription'
    const status = SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status
    const ends = s.cancel_at_period_end ? formatShortDate(s.current_period_end) : null
    return `${name} plan (${status}${ends ? `, ends ${ends}` : ''})`
  })
  if (group.has_credits) parts.push(`${Math.round(group.credits.balance).toLocaleString()} credits`)
  return parts
}

export function groupHasValue(group: SameEmailGroup): boolean {
  return group.has_credits || group.subscriptions.length > 0
}

/**
 * Stable fingerprint of what the other accounts hold. The post-login modal is
 * shown once per fingerprint, so it only reappears when that value changes.
 */
export function sameEmailValueSignature(overview: SameEmailOverviewResponse): string {
  return overview.groups
    .filter(g => !g.is_current_group && groupHasValue(g))
    .map(g => `${g.group_id}:${g.has_credits ? 1 : 0}:${g.subscriptions.map(s => `${s.plan_slug ?? ''}/${s.status}`).sort().join(',')}`)
    .sort()
    .join('|')
}

/** Matomo hook — kept as a callback so this file stays free of plugin wiring. */
export type SameEmailTrack = (action: 'same_email_banner' | 'same_email_expand' | 'same_email_support', name?: string, value?: number) => void

const SupportLink: React.FC<{ onClick?: () => void }> = ({ onClick }) => (
  <a href={DISCORD_URL} target="_blank" rel="noreferrer" onClick={onClick} data-id="pm-same-email-support">contact support</a>
)

const GroupRows: React.FC<{ groups: SameEmailGroup[] }> = ({ groups }) => (
  <ul className="pm-same-email__list" data-id="pm-same-email-list">
    {groups.map(group => {
      const value = describeGroupValue(group)
      return group.accounts.map(account => {
        const lastLogin = formatShortDate(account.last_login_at)
        return (
          <li key={account.id} className="pm-same-email__item" data-id={`pm-same-email-account-${account.id}`}>
            <i className={`${providerIcon(account.provider)} pm-same-email__icon`} aria-hidden></i>
            <div className="pm-same-email__meta">
              <span className="pm-same-email__name">{accountLabel(account)}</span>
              {lastLogin && <span className="pm-same-email__sub">Last sign-in {lastLogin}</span>}
            </div>
            <span className={`pm-same-email__value ${value.length ? 'has-value' : ''}`}>
              {value.length ? value.join(' · ') : 'No credits or subscription'}
            </span>
          </li>
        )
      })
    })}
  </ul>
)

/** Banner rendered at the top of the Plan & Credits panel. */
export const SameEmailAccountsBanner: React.FC<{ groups: SameEmailGroup[]; onTrack?: SameEmailTrack }> = ({ groups, onTrack }) => {
  const [expanded, setExpanded] = useState(false)
  const accountCount = groups.reduce((n, g) => n + g.accounts.length, 0)
  const valued = groups.filter(groupHasValue)
  const valueTag = valued.length ? 'with_value' : 'no_value'
  // One impression per mount, i.e. per panel open.
  useEffect(() => {
    if (accountCount > 0) onTrack?.('same_email_banner', valueTag, accountCount)
  }, [])
  if (!groups.length) return null
  const providers = Array.from(new Set(groups.flatMap(g => g.accounts.map(a => providerLabel(a.provider)))))

  const title = valued.length
    ? 'You have credits or a subscription on another account'
    : `Your email is also used by ${accountCount === 1 ? 'another Remix account' : `${accountCount} other Remix accounts`}`

  return (
    <section className={`pm-alert pm-alert--same-email ${valued.length ? 'has-value' : ''}`} data-id="pm-same-email-banner">
      <div className="pm-alert__icon">
        <i className="fas fa-user-group"></i>
      </div>
      <div className="pm-alert__body">
        <div className="pm-alert__eyebrow">Other accounts with your email</div>
        <div className="pm-alert__title">{title}</div>
        <p className="pm-alert__desc">
          Signed up with {providers.join(', ')}. Credits and subscriptions belong to the account they were
          bought on and are not shared with the one you're using now — sign in with that method to use them.
          Accounts can't be merged here; <SupportLink onClick={() => onTrack?.('same_email_support', 'banner')} /> if you need help.
        </p>
        {expanded && <GroupRows groups={groups} />}
      </div>
      <div className="pm-alert__actions">
        <button
          className="pm-alert__btn pm-alert__btn--link"
          onClick={() => {
            if (!expanded) onTrack?.('same_email_expand', valueTag, accountCount)
            setExpanded(e => !e)
          }}
          aria-expanded={expanded}
          data-id="pm-same-email-toggle"
        >
          {expanded ? 'Hide accounts' : `Show ${accountCount === 1 ? 'account' : 'accounts'}`}
        </button>
      </div>
    </section>
  )
}

/** Body of the one-time post-login modal (only shown when other accounts hold value). */
export const SameEmailAccountsModalBody: React.FC<{ groups: SameEmailGroup[]; onSupportClick?: () => void }> = ({ groups, onSupportClick }) => (
  <div className="pm-same-email pm-same-email--modal" data-id="pm-same-email-modal">
    <p className="mb-2">
      Your email address is also registered on other Remix accounts that you signed up for with a
      different sign-in method. Some of them still hold credits or a subscription:
    </p>
    <GroupRows groups={groups.filter(groupHasValue)} />
    <p className="mb-0 mt-2 text-muted small">
      Credits and subscriptions stay with the account they were bought on and are not shared with the
      account you're using now. To use them, sign in with that method. Accounts can't be merged in the
      app — <SupportLink onClick={onSupportClick} /> if you need help.
    </p>
  </div>
)
