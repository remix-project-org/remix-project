import { CustomTooltip, RenderIf } from "@remix-ui/helper"
import { FormattedMessage, useIntl } from "react-intl"
import { CompilerStatus } from "../types"

export function SetupExportsBtn ({ handleRunSetup, status }: { handleRunSetup: () => Promise<void>, status: CompilerStatus }) {
  const intl = useIntl()
  return <button
    className="inline-flex items-center px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90 transition-colors btn-block block w-full break-words mt-2"
    onClick={handleRunSetup}
    data-id="runSetupBtn"
  >
    <CustomTooltip
      placement="auto"
      tooltipId="overlay-tooltip-compile"
      tooltipText={
        <div className="text-left">
          <div>
              {intl.formatMessage({ id: 'circuit.setupAndExportTooltip' })}
          </div>
        </div>
      }
    >
      <div className="flex items-center justify-center">
        <RenderIf condition={status === 'exporting'}>
          <i className="fas fa-sync fa-spin mr-2" aria-hidden="true"></i>
        </RenderIf>
        <div className="truncate overflow-hidden whitespace-nowrap">
          <span>
            <FormattedMessage id="circuit.runSetup" />
          </span>
        </div>
      </div>
    </CustomTooltip>
  </button>
}