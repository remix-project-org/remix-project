import { CustomTooltip } from "@remix-ui/helper"
import { FormattedMessage } from "react-intl"
import { SetupExportsBtn } from "./setupExportsBtn"
import { useContext } from "react"
import { CircuitAppContext } from "../contexts"
import { runSetupAndExport } from "../actions"

export function SetupExports () {
  const circuitApp = useContext(CircuitAppContext)

  return (
    <div className="flex-column">
      <div className="flex-column d-flex">
        <div className="mb-1 ms-0">
          <label className="circuit_inner_label form-check-label">
            <FormattedMessage id="circuit.provingScheme" />
          </label>
          <div className="radio form-control custom-radio mb-1 form-check bg-body">
            <input
              type="radio"
              className="align-middle form-check-input"
              name="circuitProvingScheme"
              id="groth16ProvingScheme"
              onClick={() => circuitApp.dispatch({ type: 'SET_PROVING_SCHEME', payload: 'groth16' })}
              value='groth16'
              checked={circuitApp.appState.provingScheme === 'groth16'}
              readOnly
            />
            <label className="form-check-label" data-id="groth16ProvingScheme" htmlFor="groth16ProvingScheme" style={{ paddingTop: '0.125rem' }}>
              Groth16
            </label>
          </div>
          <div className="radio form-control custom-radio form-check bg-body">
            <input
              type="radio"
              className="align-middle form-check-input"
              name="circuitProvingScheme"
              id="plonkProvingScheme"
              onClick={() => circuitApp.dispatch({ type: 'SET_PROVING_SCHEME', payload: 'plonk' })}
              value='plonk'
              checked={circuitApp.appState.provingScheme === 'plonk'}
              readOnly
            />
            <label className="form-check-label" data-id="plonkProvingScheme" htmlFor="plonkProvingScheme" style={{ paddingTop: '0.125rem' }}>
              Plonk
            </label>
          </div>
        </div>
        <div className="mb-1 ms-0">
          <label className="circuit_inner_label form-check-label">
            <FormattedMessage id="circuit.ptau" />
          </label>
          <CustomTooltip
            placement={"auto"}
            tooltipId="circuitPtauTooltip"
            tooltipClasses="text-nowrap"
            tooltipText={<span>{'To choose the from the list of ptau files'}</span>}
          >
            <div className="mb-1">
              <select
                value={circuitApp.appState.ptauValue}
                className="form-select"
                style={{
                  pointerEvents: 'auto'
                }}
                onChange={(e) => circuitApp.dispatch({ type: 'SET_PTAU_VALUE', payload: e.target.value })}
                data-id="circuitPtauSelect"
              >
                {
                  circuitApp.appState.ptauList.map((ptau, index) => {
                    return (
                      <option key={index} value={ptau.name} data-id={`dropdown-item-${ptau.name}`}>{`${ptau.name} (${ptau.maxConstraint} max constr.)`}</option>
                    )
                  })
                }
              </select>
            </div>
          </CustomTooltip>
          <div className="mt-2 form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="circuitExportVerifierContract"
              onChange={() => circuitApp.dispatch({ type: 'SET_EXPORT_VERIFICATION_CONTRACT', payload: !circuitApp.appState.exportVerificationContract })}
              checked={circuitApp.appState.exportVerificationContract}
            />
            <label className="form-check-label" htmlFor="circuitExportVerifierContract">
              <FormattedMessage id="circuit.exportVerifierContract" />
            </label>
          </div>
          <div className="mt-2 form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="circuitExportVerificationKey"
              onChange={() => circuitApp.dispatch({ type: 'SET_EXPORT_VERIFICATION_KEY', payload: !circuitApp.appState.exportVerificationKey })}
              checked={circuitApp.appState.exportVerificationKey}
            />
            <label className="form-check-label" htmlFor="circuitExportVerificationKey">
              <FormattedMessage id="circuit.exportVerificationKey" />
            </label>
          </div>
          <SetupExportsBtn handleRunSetup={() => runSetupAndExport(circuitApp.plugin, circuitApp.appState, circuitApp.dispatch)} status={circuitApp.appState.status} />
        </div>
      </div>
    </div>
  )
}
