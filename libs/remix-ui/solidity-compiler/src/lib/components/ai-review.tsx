import React from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'

export type AuditType = 'security' | 'gas'

// the RemixAI mark, always in the theme's AI colour (see .sc-ai-icon)
export const AiIcon = ({ size = 11 }: { size?: number }) => (
  <span className="sc-ai-icon" style={{ '--s': `${size}px` } as React.CSSProperties} aria-hidden="true"></span>
)

// discovery card under Compile, shown until dismissed
export const AiReviewCard = ({ fileName, onAudit, onDismiss }: { fileName: string, onAudit: (type: AuditType) => void, onDismiss: () => void }) => {
  const intl = useIntl()
  const dismissLabel = intl.formatMessage({ id: 'solidity.aiCardDismiss' })

  return (
    <div className="sc-ai-card" data-id="compilerAiReviewCard">
      <div className="sc-ai-card-head">
        <AiIcon size={14} />
        <span className="t">
          <FormattedMessage id="solidity.reviewFileWithRemixAI" values={{ file: fileName }} />
        </span>
        <button className="sc-icon-btn" aria-label={dismissLabel} title={dismissLabel} data-id="compilerAiReviewCardDismiss" onClick={onDismiss}>
          <i className="fas fa-xmark"></i>
        </button>
      </div>
      <div className="sc-ai-card-text">
        <FormattedMessage id="solidity.aiCardText" />
      </div>
      <div className="sc-two">
        <CustomTooltip placement="auto" tooltipId="overlay-tooltip-ai-audit" tooltipText={<FormattedMessage id="solidity.securityAuditTooltip" />}>
          <button data-id="compilerContainerStartAIAuditBtn" className="btn btn-ai" onClick={() => onAudit('security')}>
            <AiIcon />
            <span><FormattedMessage id="solidity.securityAudit" /></span>
          </button>
        </CustomTooltip>
        <CustomTooltip placement="auto" tooltipId="overlay-tooltip-gas-audit" tooltipText={<FormattedMessage id="solidity.gasAuditTooltip" />}>
          <button data-id="compilerContainerStartGasAuditBtn" className="btn btn-ai" onClick={() => onAudit('gas')}>
            <AiIcon />
            <span><FormattedMessage id="solidity.gasAudit" /></span>
          </button>
        </CustomTooltip>
      </div>
    </div>
  )
}

// where the audits live once the card is dismissed: a row under the compile results
export const AiReviewRow = ({ onAudit }: { onAudit: (type: AuditType) => void }) => (
  <div className="sc-ai-row" data-id="compilerAiReviewRow">
    <span className="sc-muted"><FormattedMessage id="solidity.reviewWithRemixAI" /></span>
    <CustomTooltip placement="auto" tooltipId="overlay-tooltip-ai-audit-row" tooltipText={<FormattedMessage id="solidity.securityAuditTooltip" />}>
      <button data-id="compilerContainerStartAIAuditBtn" className="btn btn-ai btn-sm" onClick={() => onAudit('security')}>
        <AiIcon />
        <span><FormattedMessage id="solidity.securityAuditShort" /></span>
      </button>
    </CustomTooltip>
    <CustomTooltip placement="auto" tooltipId="overlay-tooltip-gas-audit-row" tooltipText={<FormattedMessage id="solidity.gasAuditTooltip" />}>
      <button data-id="compilerContainerStartGasAuditBtn" className="btn btn-ai btn-sm" onClick={() => onAudit('gas')}>
        <AiIcon />
        <span><FormattedMessage id="solidity.gasAuditShort" /></span>
      </button>
    </CustomTooltip>
  </div>
)
