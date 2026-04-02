import { useEffect, useState } from "react"
import { FormattedMessage } from "react-intl"
import { CustomTooltip, RenderIf, RenderIfNot } from "@remix-ui/helper"

export function Toggler ({ children, title, dataId, show = false, icon, iconTooltip }: { children: JSX.Element, title: string, dataId: string, show?: boolean, icon?: string, iconTooltip?: string }) {
  const [toggleExpander, setToggleExpander] = useState<boolean>(show)

  useEffect(() => {
    setToggleExpander(show)
  }, [show])

  const toggleConfigurations = () => {
    setToggleExpander(!toggleExpander)
  }

  return (
    <div className="pt-2 border-t pb-2">
      <div className="flex circuit_config_section justify-between" onClick={toggleConfigurations} data-id={dataId}>
        <div className="flex">
          <label className="circuit_config_section">
            <FormattedMessage id={title} />
            { icon ? iconTooltip ? (
              <CustomTooltip
                placement="auto"
                tooltipId="rerunSetupWarningTooltip"
                tooltipClasses="whitespace-nowrap"
                tooltipText={iconTooltip}
              >
                <span className={`${icon} border-0 p-0 ml-2`} aria-hidden="true"></span>
              </CustomTooltip>) :
              <span className={`${icon} border-0 p-0 ml-2`} aria-hidden="true"></span> : null }
          </label>
        </div>
        <div>
          <span data-id="scConfigExpander" onClick={toggleConfigurations}>
            <RenderIf condition={toggleExpander}>
              <i className="fas fa-angle-down" aria-hidden="true"></i>
            </RenderIf>
            <RenderIfNot condition={toggleExpander}>
              <i className="fas fa-angle-right" aria-hidden="true"></i>
            </RenderIfNot>
          </span>
        </div>
      </div>
      <RenderIf condition={toggleExpander}>
        { children }
      </RenderIf>
    </div>
  )
}