import React from 'react'
import { CustomTooltip } from '@remix-ui/helper'

interface PromptDefaultProps {
  isStreaming: boolean
  // The send button only shows once there is something to send.
  hasContent: boolean
  handleSend: () => void
  handleCancel: () => void
  // True when the AI runtime is still initialising (anonymous user,
  // agents booting, etc.). We keep the send button visible — not the
  // stop button — but render it disabled so the click does nothing
  // and the user gets a visual cue instead of a misleading affordance.
  disabled?: boolean
  // When true the send button is replaced with an explicit "Sign in"
  // button — the user is anonymous and the route will never become
  // ready until they authenticate, so we surface the action they
  // actually need to take.
  showSignIn?: boolean
  onSignIn?: () => void
}

export function PromptDefault(props: PromptDefaultProps) {
  if (props.isStreaming) {
    return (
      <button
        type="button"
        className="ai-send-btn ai-stop-btn"
        data-id="remix-ai-composer-send-btn"
        title="Stop"
        aria-label="Stop"
        onClick={() => props.handleCancel()}
      >
        <i className="fas fa-stop"></i>
      </button>
    )
  }

  if (props.showSignIn) {
    return (
      <CustomTooltip placement="top" tooltipText="Sign in to chat with RemixAI" tooltipId="signInPromptTooltip">
        <button
          type="button"
          className="ai-send-btn ai-signin-btn"
          data-id="aiPromptSignInButton"
          onClick={() => props.onSignIn && props.onSignIn()}
        >
          <i className="fas fa-arrow-right-to-bracket"></i>
          <span>Sign in</span>
        </button>
      </CustomTooltip>
    )
  }

  if (!props.hasContent) return null

  return (
    <button
      type="button"
      className="ai-send-btn"
      data-id="remix-ai-composer-send-btn"
      title="Send"
      aria-label="Send"
      disabled={props.disabled}
      onClick={() => {
        if (!props.disabled) props.handleSend()
      }}
    >
      <i className="fas fa-arrow-up"></i>
    </button>
  )
}
