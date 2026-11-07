import { CustomTooltip, Select } from "@remix-ui/helper"
import { FormattedMessage, useIntl } from "react-intl"
import { SetupExportsBtn } from "./setupExportsBtn"
import { useContext } from "react"
import { CircuitAppContext } from "../contexts"
import { runSetupAndExport } from "../actions"

export function SetupExports () {
  const circuitApp = useContext(CircuitAppContext)
  const intl = useIntl()

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
              <FormattedMessage id="circuit.groth16" />
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
              <FormattedMessage id="circuit.plonk" />
            </label>
          </div>
        </div>
        <div className="mb-1 ms-0">
          {/* the tooltip sits on the label: on the select it would cover the open list */}
          <CustomTooltip
            placement={"auto"}
            tooltipId="circuitPtauTooltip"
            tooltipClasses="text-nowrap"
            tooltipText={<span>{intl.formatMessage({ id: 'circuit.ptauTooltip' })}</span>}
          >
            <label className="circuit_inner_label form-check-label" htmlFor="circuitPtauSelect">
              <FormattedMessage id="circuit.ptau" />
            </label>
          </CustomTooltip>
          <div className="mb-1">
            <Select
              id="circuitPtauSelect"
              value={circuitApp.appState.ptauValue}
              options={circuitApp.appState.ptauList.map((ptau) => ({ value: ptau.name, label: `${ptau.name} (${ptau.maxConstraint} max constr.)` }))}
              onChange={(value) => circuitApp.dispatch({ type: 'SET_PTAU_VALUE', payload: value })}
              itemDataId={(o) => `dropdown-item-${o.value}`}
            />
          </div>
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
