import React, { useState } from 'react'
import { MembershipGroup, MembershipStatusResponse } from '@remix-api'
import { LoginButton } from '@remix-ui/login'
import './invite-overlay.css'
import './membership-request-overlay.css'

export type MembershipRequestView = 'loading' | 'form' | 'submitting' | 'success' | 'pending' | 'error'

export interface MembershipRequestState {
  show: boolean
  view: MembershipRequestView
  groups: MembershipGroup[]
  selectedGroup: MembershipGroup | null
  pendingStatus: MembershipStatusResponse | null
  error: string | null
}

interface MembershipRequestOverlayProps {
  state: MembershipRequestState
  onSubmit: (groupId: number, nickname: string, email: string, comment: string) => Promise<void>
  onClose: () => void
  onLogin: () => void
}

export const MembershipRequestOverlay: React.FC<MembershipRequestOverlayProps> = ({
  state,
  onSubmit,
  onClose,
  onLogin
}) => {
  if (!state.show) return null

  const { view, selectedGroup, pendingStatus, error } = state

  if (view === 'loading') {
    return (
      <div className="invite-overlay" onClick={onClose}>
        <div className="invite-modal-dialog" onClick={e => e.stopPropagation()}>
          <div className="invite-modal-card">
            <div className="invite-modal-left invite-modal-left--beta">
              <div className="invite-modal-left-gradient invite-modal-left-gradient--beta" />
              <div className="invite-modal-left-content">
                <div className="invite-modal-hero-icon">
                  <i className="fas fa-flask"></i>
                </div>
                <h3 className="invite-modal-hero-title">Remix Beta</h3>
              </div>
            </div>
            <div className="invite-modal-right">
              <div className="invite-modal-right-body d-flex align-items-center justify-content-center" style={{ minHeight: 200 }}>
                <i className="fas fa-spinner fa-spin fa-2x" style={{ color: 'var(--bs-secondary-color, #888)' }}></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'error') {
    return (
      <div className="invite-overlay" onClick={onClose}>
        <div className="invite-modal-dialog" onClick={e => e.stopPropagation()}>
          <div className="invite-modal-card">
            <div className="invite-modal-left invite-modal-left--error">
              <div className="invite-modal-left-gradient invite-modal-left-gradient--error" />
              <div className="invite-modal-left-content">
                <div className="invite-modal-hero-icon">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <h3 className="invite-modal-hero-title">Oops</h3>
              </div>
            </div>
            <div className="invite-modal-right">
              <div className="invite-modal-right-header">
                <h5>Something went wrong</h5>
                <button className="invite-modal-close-btn" onClick={onClose}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="invite-modal-right-body">
                <p className="invite-modal-error-text">{error || 'An unexpected error occurred. Please try again later.'}</p>
              </div>
              <div className="invite-modal-right-footer">
                <button className="btn invite-modal-btn-secondary" onClick={onClose}>Close</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'success') {
    return (
      <div className="invite-overlay" onClick={onClose}>
        <div className="invite-modal-dialog invite-modal-dialog--wide" onClick={e => e.stopPropagation()}>
          <div className="invite-modal-card">
            <div className="invite-modal-left invite-modal-left--success">
              <div className="invite-modal-left-gradient invite-modal-left-gradient--success" />
              <div className="invite-modal-left-content">
                <div className="invite-modal-hero-icon invite-modal-hero-icon--success">
                  <i className="fas fa-check-circle"></i>
                </div>
                <h3 className="invite-modal-hero-title">Request Submitted!</h3>
                <p className="invite-modal-hero-subtitle">
                  We've received your request
                </p>
              </div>
            </div>
            <div className="invite-modal-right">
              <div className="invite-modal-right-header">
                <h5>You're on the list!</h5>
                <button className="invite-modal-close-btn" onClick={onClose}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="invite-modal-right-body">
                <p className="invite-modal-success-message">
                  Thanks for your interest in the <strong>Remix v2 Private Beta Testing Program</strong>! We're rolling out access in phases
                  to ensure the best experience for everyone.
                </p>
                <p className="invite-modal-success-message">
                  We'll notify you when your request is approved and you'll receive an invite to join.
                  Keep an eye on the notification bell — your invite will appear there when it's ready.
                </p>
                <div className="invite-modal-walkthrough-cta">
                  <div className="invite-modal-walkthrough-icon">
                    <i className="fas fa-bell"></i>
                  </div>
                  <div className="invite-modal-walkthrough-text">
                    <strong>What happens next?</strong>
                    <span>We review requests and approve them in waves. When approved, you'll get a notification with your personal invite link.</span>
                  </div>
                </div>
              </div>
              <div className="invite-modal-right-footer">
                <button data-id="membership-got-it-btn" className="btn invite-modal-btn-primary w-100" onClick={onClose}>
                  Got it!
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'pending' && pendingStatus) {
    const createdAt = new Date(pendingStatus.request.created_at).toLocaleDateString()
    return (
      <div className="invite-overlay" onClick={onClose}>
        <div className="invite-modal-dialog" onClick={e => e.stopPropagation()}>
          <div className="invite-modal-card">
            <div className="invite-modal-left invite-modal-left--info">
              <div className="invite-modal-left-gradient invite-modal-left-gradient--info" />
              <div className="invite-modal-left-content">
                <div className="invite-modal-hero-icon">
                  <i className="fas fa-hourglass-half"></i>
                </div>
                <h3 className="invite-modal-hero-title">Under Review</h3>
              </div>
            </div>
            <div className="invite-modal-right">
              <div className="invite-modal-right-header">
                <h5>Request Pending</h5>
                <button className="invite-modal-close-btn" onClick={onClose}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="invite-modal-right-body">
                <p>You've already requested access to <strong>{pendingStatus.request.feature_group_display_name}</strong>.</p>
                <div className="membership-pending-card">
                  <div className="membership-pending-icon">
                    <i className="fas fa-clock"></i>
                  </div>
                  <div className="membership-pending-text">
                    <strong>We're reviewing your request</strong>
                    <span>Submitted on {createdAt}. You'll be notified when it's approved.</span>
                  </div>
                </div>
              </div>
              <div className="invite-modal-right-footer">
                <button className="btn invite-modal-btn-secondary w-100" onClick={onClose}>Close</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main form view
  return <RequestFormModal
    group={selectedGroup}
    error={error}
    submitting={view === 'submitting'}
    onSubmit={onSubmit}
    onClose={onClose}
    onLogin={onLogin}
  />
}

/* ==================== Survey / Request Form Modal ==================== */

const SUBSCRIPTION_FEATURES_OPTIONS = [
  { id: 'advanced_ai', label: 'Advanced AI models (Claude, GPT-4 etc)' },
  { id: 'cloud_storage', label: 'Cloud Storage (not browser storage)' },
  { id: 'shared_workspaces', label: 'Shared access to Workspaces for your dev team' },
  { id: 'chat_history', label: 'Your AI chat history' },
  { id: 'ai_frontend_builder', label: 'An AI-assisted front-end builder with hosting for dApps and mini-apps' },
  { id: 'security_audits', label: 'AI-powered security audits' },
  { id: 'gas_optimization', label: 'Gas optimization suggestions' },
  { id: 'none', label: 'None of the above' },
]

interface SurveyData {
  usedAiFeatures: 'yes' | 'no' | ''
  subscriptionFeatures: string[]
}

const RequestFormModal: React.FC<{
  group: MembershipGroup | null
  error: string | null
  submitting: boolean
  onSubmit: (groupId: number, nickname: string, email: string, comment: string) => Promise<void>
  onClose: () => void
  onLogin: () => void
}> = ({ group, error, submitting, onSubmit, onClose, onLogin }) => {
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [emailConsent, setEmailConsent] = useState(false)

  const [survey, setSurvey] = useState<SurveyData>({
    usedAiFeatures: '',
    subscriptionFeatures: [],
  })

  const toggleFeature = (id: string) => {
    setSurvey(prev => {
      const arr = prev.subscriptionFeatures
      return { ...prev, subscriptionFeatures: arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]}
    })
  }

  const canSubmit = survey.usedAiFeatures !== '' && survey.subscriptionFeatures.length > 0 && emailConsent && email.trim().length > 0

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!group || !canSubmit) return

    // Serialize survey data + email consent as JSON comment
    const commentPayload = JSON.stringify({
      version: 2,
      type: 'beta_enrollment_survey',
      emailConsent,
      ...survey,
    })
    onSubmit(group.id, nickname, email, commentPayload)
  }

  return (
    <div className="invite-overlay" onClick={onClose}>
      <div className="invite-modal-dialog invite-modal-dialog--wide" onClick={e => e.stopPropagation()}>
        <div className="invite-modal-card">
          {/* Left swirl panel */}
          <div className="invite-modal-left invite-modal-left--beta">
            <div className="invite-modal-left-gradient invite-modal-left-gradient--beta" />
            <div className="invite-modal-left-content">
              <div className="invite-modal-hero-icon">
                <i className="fas fa-flask"></i>
              </div>
              <h3 className="invite-modal-hero-title">Remix v2</h3>
              <p className="invite-modal-hero-subtitle">
                Private Beta Testing Program
              </p>
            </div>
          </div>

          {/* Right content panel */}
          <div className="invite-modal-right">
            <div className="invite-modal-right-header">
              <div>
                <h5>Remix v2 Private Beta Testing Program Enrollment</h5>
                <p className="invite-modal-muted mb-0">
                  Get early access to new premium RemixAI features, big updates to Deploy &amp; Run, and the new AI-assisted Debugger.
                  Your participation as a Beta Tester will directly influence and help shape the future of Remix.
                  After this program ends, some features in this release will become part of Remix's paid subscription levels.
                </p>
              </div>
              <button className="invite-modal-close-btn" onClick={onClose}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="invite-modal-right-body">
              <form onSubmit={handleSubmit}>
                {/* Q1: Have you used RemixAI features? */}
                <div className="invite-modal-section">
                  <h6 className="invite-modal-section-label">
                    Have you used the AI features in Remix? <span className="text-danger">*</span>
                  </h6>
                  <div className="survey-chip-grid">
                    <button
                      type="button"
                      data-id="survey-ai-yes"
                      className={`survey-chip ${survey.usedAiFeatures === 'yes' ? 'survey-chip--selected' : ''}`}
                      onClick={() => setSurvey(prev => ({ ...prev, usedAiFeatures: 'yes' }))}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      data-id="survey-ai-no"
                      className={`survey-chip ${survey.usedAiFeatures === 'no' ? 'survey-chip--selected' : ''}`}
                      onClick={() => setSurvey(prev => ({ ...prev, usedAiFeatures: 'no' }))}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Q2: Would you consider paying for... */}
                <div className="invite-modal-section">
                  <h6 className="invite-modal-section-label">
                    Would you consider paying a modest month-to-month or discounted annual subscription fee for: <span className="text-danger">*</span>
                  </h6>
                  <div className="survey-checkbox-list">
                    {SUBSCRIPTION_FEATURES_OPTIONS.map(opt => (
                      <label key={opt.id} className={`survey-checkbox-item ${survey.subscriptionFeatures.includes(opt.id) ? 'survey-checkbox-item--selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={survey.subscriptionFeatures.includes(opt.id)}
                          onChange={() => toggleFeature(opt.id)}
                          className="survey-checkbox-input"
                        />
                        <span>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Discount note */}
                <div className="invite-modal-section">
                  <div className="invite-modal-walkthrough-cta">
                    <div className="invite-modal-walkthrough-icon">
                      <i className="fas fa-gift"></i>
                    </div>
                    <div className="invite-modal-walkthrough-text">
                      <strong>Beta Tester Perk</strong>
                      <span>Beta testers will get significant product discounts after this program concludes.</span>
                    </div>
                  </div>
                </div>

                {/* Nickname (optional) */}
                <div className="invite-modal-section">
                  <h6 className="invite-modal-section-label">YOUR DETAILS</h6>

                  <div className="membership-form-group">
                    <label className="membership-form-label">Nickname <span className="text-muted">(optional)</span></label>
                    <input
                      type="text"
                      className="membership-form-input"
                      placeholder="How should we call you?"
                      value={nickname}
                      onChange={e => setNickname(e.target.value)}
                      maxLength={50}
                    />
                  </div>

                  <div className="membership-form-group">
                    <label className="membership-form-label">Email <span className="text-danger">*</span></label>
                    <input
                      type="email"
                      data-id="membership-email"
                      className="membership-form-input"
                      placeholder="your@email.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                    <div className="membership-form-hint">
                      To become a private beta tester, we would like to contact you by email.
                    </div>
                  </div>
                </div>

                {/* Email consent */}
                <div className="survey-consent-box">
                  <label className="survey-consent-label">
                    <input
                      type="checkbox"
                      data-id="membership-consent"
                      checked={emailConsent}
                      onChange={e => setEmailConsent(e.target.checked)}
                      className="survey-consent-checkbox"
                    />
                    <span>
                      I agree to receive email updates about the Remix v2 Private Beta Testing Program,
                      including access invitations and product announcements. I can unsubscribe at any time. <span className="text-danger">*</span>
                    </span>
                  </label>
                </div>

                {error && (
                  <div className="invite-modal-error mt-2">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    {error}
                  </div>
                )}
              </form>
            </div>

            <div className="invite-modal-right-footer">
              <button
                className="btn invite-modal-btn-primary invite-modal-btn--glow w-100"
                onClick={handleSubmit}
                data-id="membership-apply-btn"
                disabled={submitting || !canSubmit}
                title={!emailConsent ? 'Please accept the email consent to continue' : !email.trim() ? 'Please enter your email' : !canSubmit ? 'Please answer the required questions' : ''}
              >
                {submitting ? (
                  <><i className="fas fa-spinner fa-spin me-2"></i>Submitting...</>
                ) : (
                  <><i className="fas fa-rocket me-2"></i>Apply for Private Beta Test Access</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
