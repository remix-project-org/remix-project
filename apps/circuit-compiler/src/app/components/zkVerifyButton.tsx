import { useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { CircuitAppContext } from '../contexts'
import { verifyProofWithKurier } from '../actions'
import { CustomTooltip, RenderIf } from '@remix-ui/helper'

export function ZkVerifyButton() {
  const circuitApp = useContext(CircuitAppContext)
  const { appState, dispatch, plugin } = circuitApp

  const handleVerifyClick = () => {
    verifyProofWithKurier(plugin, appState, dispatch)
  }
  const isDisabled =
    appState.zkVerifyStatus === 'verifying' ||
    appState.status === 'proving' ||
    appState.status === 'exporting' ||
    !appState.verificationKey

  const getButtonContent = () => {
    if (appState.zkVerifyStatus === 'verifying') {
      return (
        <>
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
          <FormattedMessage id="circuit.verifyingOnZkVerify" defaultMessage="Verifying on zkVerify..." />
        </>
      )
    }

    if (appState.zkVerifyStatus === 'verified') {
      return (
        <>
          <i className="fas fa-check-circle text-success me-2"></i>
          <FormattedMessage id="circuit.verifiedOnZkVerify" defaultMessage="Verified on zkVerify" />
        </>
      )
    }

    if (appState.zkVerifyStatus === 'failed') {
      return (
        <>
          <i className="fas fa-times-circle text-danger me-2"></i>
          <FormattedMessage id="circuit.zkVerifyFailed" defaultMessage="Verification Failed - Retry" />
        </>
      )
    }

    return <FormattedMessage id="circuit.verifyOnZkVerify" defaultMessage="Verify on zkVerify" />
  }

  const getButtonClass = () => {
    if (appState.zkVerifyStatus === 'verified') {
      return 'btn btn-success'
    }
    if (appState.zkVerifyStatus === 'failed') {
      return 'btn btn-warning'
    }
    return 'btn btn-secondary'
  }

  // zkVerify only supports groth16 proving scheme
  if (appState.provingScheme !== 'groth16') {
    return null
  }

  return (
    <div className="mt-2">
      <CustomTooltip
        placement="bottom"
        tooltipId="zkVerifyTooltip"
        tooltipText={
          !appState.verificationKey
            ? 'Generate a proof first to verify on zkVerify'
            : 'Verify proof on zkVerify network via Kurier API'
        }
      >
        <button
          id="zkverify_btn"
          data-id="zkverify_btn"
          className={`${getButtonClass()} w-100`}
          onClick={handleVerifyClick}
          disabled={isDisabled}
        >
          {getButtonContent()}
        </button>
      </CustomTooltip>

      <RenderIf condition={!!appState.zkVerifyAttestation}>
        <div
          className="small text-muted mt-1"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={appState.zkVerifyAttestation || ''}
        >
          <i className="fas fa-certificate me-1"></i>
          Job ID: {appState.zkVerifyAttestation}
        </div>
      </RenderIf>
    </div>
  )
}
