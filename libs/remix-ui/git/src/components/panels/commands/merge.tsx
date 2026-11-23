import React, { useEffect, useState } from "react";
import { gitActionsContext } from "../../../state/context";
import { gitPluginContext } from "../../gitui";
import { Select, SelectOption } from "@remix-ui/helper";
import GitUIButton from "../../buttons/gituibutton";
import { FormattedMessage, useIntl } from "react-intl";

export const Merge = () => {
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)
  const intl = useIntl()
  const [localBranch, setLocalBranch] = useState('')
  const [localBranchOptions, setLocalBranchOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    setLocalBranch(context.currentBranch.name)
  }, [context.currentBranch])

  const onLocalBranchChange = (value: any) => {
    setLocalBranch(value)
  }

  const merge = async () => {
    //gitservice.push(currentRemote, branch || '', remoteBranch, force)
  }

  useEffect(() => {
    // map context.repositories to options
    const localBranches = context.branches && context.branches.length > 0 && context.branches
      .filter(branch => !branch.remote)
      .map(repo => {
        return { value: repo.name, label: repo.name }
      })
    setLocalBranchOptions(localBranches || [])

  }, [context.branches])

  return (
    <>

      <div className="btn-group w-100" role="group" aria-label="Basic example">
        <GitUIButton type="button" onClick={async () => merge()} className="btn btn-primary me-1"><FormattedMessage id="gitui.mergeButton" /></GitUIButton>
      </div>

      <label><FormattedMessage id="gitui.mergeFromBranch" /></label>
      <Select
        id='commands-merge-branch-select'
        options={localBranchOptions}
        disabled={context.branches.length === 0}
        onChange={onLocalBranchChange}
        value={localBranch}
        placeholder={intl.formatMessage({ id: 'gitui.branchSearchPlaceholder' })}
        searchable
        searchPlaceholder={intl.formatMessage({ id: 'gitui.branchSearchPlaceholder' })}
      />

    </>)
}
