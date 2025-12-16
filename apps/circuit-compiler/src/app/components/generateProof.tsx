import { RenderIf } from "@remix-ui/helper"
import { FormattedMessage } from "react-intl"
import { generateProof } from "../actions"
import { CircuitAppContext } from "../contexts"
import { useContext } from "react"

export function GenerateProof () {
  const circuitApp = useContext(CircuitAppContext)
  const status = circuitApp.appState.status

  return (
    <div className="flex-column d-flex">
      <div className="mt-2 form-check">
        <input
          className="form-check-input"
          type="checkbox"
          id="circuitExportVerifierCalldata"
          onChange={() => circuitApp.dispatch({ type: 'SET_EXPORT_VERIFIER_CALLDATA', payload: !circuitApp.appState.exportVerifierCalldata })}
          checked={circuitApp.appState.exportVerifierCalldata}
        />
        <label className="form-check-label" htmlFor="circuitExportVerifierCalldata">
          <FormattedMessage id="circuit.exportVerifierCalldata" />
        </label>
      </div>
      <button
        className="btn btn-secondary btn-block d-block w-100 text-break mb-1 mt-1"
        onClick={() => generateProof(circuitApp.plugin, circuitApp.appState, circuitApp.dispatch)}
        disabled={(status === "compiling") || (status === "computing") || (status === "proving") || (status === "exporting")}
        data-id="generateProofBtn"
      >
        <RenderIf condition={status === 'proving'}>
          <i className="fas fa-sync fa-spin me-2" aria-hidden="true"></i>
        </RenderIf>
        <FormattedMessage id="circuit.generateProof" />
      </button>
    </div>
  )
}
