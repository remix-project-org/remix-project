import React from "react"
import { FormattedMessage } from "react-intl"

export const GasEstimationPrompt = ({ msg }: { msg: string }) => {
  return (
    <div>
      <FormattedMessage id="udapp.gasEstimationPromptText" /> <br />
      {msg}
    </div>
  )
}