import React, { Fragment, useEffect, useState } from 'react'
import { CustomTooltip } from "@remix-ui/helper";
import { isVyper, compile, toStandardOutput, isCompilationError, remixClient, normalizeContractPath, compileContract, RemixClient } from '../utils'
import Button from 'react-bootstrap/Button'

interface Props {
  compilerUrl: string
  contract?: string
  output?: any
  setOutput: (name: string, output: any) => void
  resetCompilerState: () => void
  remixClient: RemixClient
}

function CompilerButton({ contract, setOutput, compilerUrl, resetCompilerState, output, remixClient }: Props) {
  const [loadingSpinner, setLoadingSpinnerState] = useState(false)

  if (!contract || !contract) {
    return <Button disabled className="w-full">No contract selected</Button>
  }

  if (!isVyper(contract)) {
    return <Button disabled className="w-full">Not a vyper contract</Button>
  }

  /** Compile a Contract */

  return (
    <Fragment>
      <CustomTooltip
        placement="auto"
        tooltipId="overlay-tooltip-compile"
        tooltipText={contract}
      >
        <button data-id="compile"
          onClick={async () => {
            setLoadingSpinnerState(true)
            await compileContract(contract, compilerUrl, setOutput, setLoadingSpinnerState)
          }}
          className="btn btn-primary w-full"
        >
          <div className="flex items-center justify-center fa-1x">
            <span className={ loadingSpinner ? 'fas fa-sync fa-pulse mr-1' : 'fas fa-sync mr-1'} />
            <div className="truncate overflow-hidden whitespace-nowrap">
              <span>Compile</span>
              <span className="ml-1 whitespace-nowrap">{contract}</span>
            </div>
          </div>
        </button>
      </CustomTooltip>
    </Fragment>
  )
}

export default CompilerButton
