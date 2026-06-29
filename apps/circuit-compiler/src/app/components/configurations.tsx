import { CustomTooltip, RenderIf } from "@remix-ui/helper"
import { FormattedMessage, useIntl } from "react-intl"
import { ConfigurationsProps, PrimeValue } from "../types"

export function Configurations ({primeValue, setPrimeValue, versionValue}: ConfigurationsProps) {
  const intl = useIntl()
  return (
    <div className="flex-column">
      <div className="flex-column d-flex">
        <div className="ms-0">
          <label className="circuit_inner_label form-check-label" htmlFor="circuitPrimeSelector">
            <FormattedMessage id="circuit.prime" />
          </label>
          <CustomTooltip
            placement={"auto"}
            tooltipId="circuitPrimeLabelTooltip"
            tooltipClasses="text-nowrap"
            tooltipText={<span>{intl.formatMessage({ id: 'circuit.primeTooltip' })}</span>}
          >
            <div>
              <select
                onChange={(e) => setPrimeValue(e.target.value as PrimeValue)}
                value={primeValue}
                className="form-select"
                style={{
                  pointerEvents: 'auto'
                }}
              >
                <RenderIf condition={versionValue === '2.1.5'}>
                  <>
                    <option value="bn128">bn128</option>
                    <option value="bls12381">bls12381</option>
                    <option value="goldilocks">goldilocks</option>
                  </>
                </RenderIf>
                <RenderIf condition={versionValue === '2.1.6'}>
                  <>
                    <option value="bn128">bn128</option>
                    <option value="bls12381">bls12381</option>
                    <option value="goldilocks">goldilocks</option>
                    <option value="grumpkin">grumpkin</option>
                    <option value="pallas">pallas</option>
                    <option value="vesta">vesta</option>
                  </>
                </RenderIf>
                <RenderIf condition={versionValue === '2.1.7'}>
                  <>
                    <option value="bn128">bn128</option>
                    <option value="bls12381">bls12381</option>
                    <option value="goldilocks">goldilocks</option>
                    <option value="grumpkin">grumpkin</option>
                    <option value="pallas">pallas</option>
                    <option value="vesta">vesta</option>
                  </>
                </RenderIf>
                <RenderIf condition={versionValue === '2.1.8' || versionValue === 'latest'}>
                  <>
                    <option value="bn128">bn128</option>
                    <option value="bls12381">bls12381</option>
                    <option value="goldilocks">goldilocks</option>
                    <option value="grumpkin">grumpkin</option>
                    <option value="pallas">pallas</option>
                    <option value="vesta">vesta</option>
                    <option value="secq256r1">secq256r1</option>
                  </>
                </RenderIf>
              </select>
            </div>
          </CustomTooltip>
        </div>
      </div>
    </div>
  )
}