import React from 'react'
import { PromptSubmitButton } from './promptSubmitButton'
import { PromptAreaProps } from './prompt'
import { CustomTooltip } from '@remix-ui/helper'
import { PromptStopButton } from './promptStopButton'

interface PromptDefaultProps {
  isStreaming: boolean
  handleSend: () => void
  themeTracker: any
  handleCancel: () => void
  // True when the AI runtime is still initialising (anonymous user,
  // agents booting, etc.). We keep the send button visible — not the
  // stop button — but render it disabled so the click does nothing
  // and the user gets a visual cue instead of a misleading affordance.
  disabled?: boolean
  // When true the disabled paper-plane is replaced with an explicit
  // "Sign in" button — the user is anonymous and the route will never
  // become ready until they authenticate, so we surface the action
  // they actually need to take.
  showSignIn?: boolean
  onSignIn?: () => void
}

export function PromptDefault(props: PromptDefaultProps) {
  const accent = props.themeTracker && props.themeTracker.name.toLowerCase() === 'light' ? '#1ea2aa' : '#2de7f3'

  return (
    <div
      className="d-flex justify-content-end gap-3 align-items-center w-100 px-1"
      style={{
        backgroundColor: props.themeTracker && props.themeTracker?.name.toLowerCase() === 'light' ? '#d9dee8' : '#222336',
      }}
    >
      {props.showSignIn && !props.isStreaming ? (
        <CustomTooltip placement="top" tooltipText="Sign in to chat with RemixAI" tooltipId="signInPromptTooltip">
          <button
            type="button"
            className="btn btn-sm small font-weight-light rounded-3 text-nowrap d-inline-flex align-items-center"
            data-id="aiPromptSignInButton"
            onClick={() => props.onSignIn && props.onSignIn()}
            style={{
              backgroundColor: accent,
              color: '#0b1020',
              fontWeight: 600,
              padding: '0.25rem 0.65rem'
            }}
          >
            <i className="fas fa-arrow-right-to-bracket me-1"></i>
            <span>Sign in</span>
          </button>
        </CustomTooltip>
      ) : !props.isStreaming ? (
        <PromptSubmitButton backgroundColor={accent} handleSend={props.handleSend} isStreaming={props.isStreaming} disabled={props.disabled} />
      ) : (
        <PromptStopButton backgroundColor={accent} isStreaming={props.isStreaming} handleCancel={props.handleCancel} />
      )}
    </div>
  )
}
