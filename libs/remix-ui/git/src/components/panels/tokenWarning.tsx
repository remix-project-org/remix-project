import { gitPluginContext } from "../gitui"
import React, { useEffect, useState } from "react"
import { FormattedMessage } from "react-intl"

export const TokenWarning = () => {
  const context = React.useContext(gitPluginContext)
  return (<>
    {(context.gitHubUser && context.gitHubUser.login) ? null :
      <span className="text-warning text-start">
        <span><FormattedMessage id="gitui.tokenWarningMessage" /> </span><span className=" text-decoration-line-through messageTip" onClick={async () => {
        }}><FormattedMessage id="gitui.tokenWarningSettings" /></span>
      </span>
    }
  </>
  )
}
