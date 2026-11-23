import { CustomTooltip, Select } from "@remix-ui/helper"
import { FormattedMessage, useIntl } from "react-intl"
import { ConfigurationsProps, PrimeValue } from "../types"

const allPrimes = ['bn128', 'bls12381', 'goldilocks', 'grumpkin', 'pallas', 'vesta', 'secq256r1']
// prime fields supported by each compiler version
const primeOptions: Record<string, string[]> = {
  '2.1.5': allPrimes.slice(0, 3),
  '2.1.6': allPrimes.slice(0, 6),
  '2.1.7': allPrimes.slice(0, 6),
  '2.1.8': allPrimes,
  'latest': allPrimes
}

export function Configurations ({primeValue, setPrimeValue, versionValue}: ConfigurationsProps) {
  const intl = useIntl()
  return (
    <div className="flex-column">
      <div className="flex-column d-flex">
        <div className="ms-0">
          {/* the tooltip sits on the label: on the select it would cover the open list */}
          <CustomTooltip
            placement={"auto"}
            tooltipId="circuitPrimeLabelTooltip"
            tooltipClasses="text-nowrap"
            tooltipText={<span>{intl.formatMessage({ id: 'circuit.primeTooltip' })}</span>}
          >
            <label className="circuit_inner_label form-check-label" htmlFor="circuitPrimeSelector">
              <FormattedMessage id="circuit.prime" />
            </label>
          </CustomTooltip>
          <Select
            id="circuitPrimeSelector"
            value={primeValue}
            options={(primeOptions[versionValue] || []).map((prime) => ({ value: prime, label: prime }))}
            onChange={(value) => setPrimeValue(value as PrimeValue)}
          />
        </div>
      </div>
    </div>
  )
}