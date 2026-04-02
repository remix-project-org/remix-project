import React, { useEffect, useState } from "react";
import { gitActionsContext } from "../../../state/context";
import GitUIButton from "../../buttons/gituibutton";
import { gitPluginContext } from "../../gitui";

export const Fetch = () => {
  const actions = React.useContext(gitActionsContext)
  const context = React.useContext(gitPluginContext)

  const fetchIsDisabled = () => {
    return (!context.upstream) || context.remotes.length === 0
  }
  return (
    <>
      <div className="btn-group w-full" role="group">
        <GitUIButton data-id='sourcecontrol-fetch-remote' disabledCondition={fetchIsDisabled()} type="button" onClick={async () => actions.fetch({
          remote: context.upstream,
        })} className="inline-flex items-center px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90 transition-colors mr-1 w-1/2"><div>Fetch {context.upstream && context.upstream.name}</div></GitUIButton>
        <GitUIButton data-id='sourcecontrol-fetch-branch' disabledCondition={fetchIsDisabled()} type="button" onClick={async () => actions.fetch({
          remote: context.upstream,
          ref: context.currentBranch
        })} className="inline-flex items-center px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90 transition-colors w-1/2 long-and-truncated">Fetch {context.currentBranch.name}</GitUIButton>
      </div>
    </>)
}
