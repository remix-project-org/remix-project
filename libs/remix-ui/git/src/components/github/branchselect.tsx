import React, { useState, useCallback, useEffect } from 'react';
import { gitActionsContext } from '../../state/context';
import { Select, SelectOption } from '@remix-ui/helper';
import { gitPluginContext } from '../gitui';

interface BranchySelectProps {
  select: (branch: { name: string }) => void;
}

export const BranchSelect = (props: BranchySelectProps) => {
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)
  const [branchOptions, setBranchOptions] = useState<SelectOption[]>([]);
  const [selected, setSelected] = useState('')

  useEffect(() => {
    // a new repository was picked, its branches replace the list
    setSelected('')
    if (context.remoteBranches && context.remoteBranches.length > 0) {
      const options = context.remoteBranches
        && context.remoteBranches.length > 0
        && context.remoteBranches.map(branch => {
          return { value: branch.name, label: branch.name }
        })
      setBranchOptions(options)
    } else {
      setBranchOptions([])
    }
  }, [context.remoteBranches])

  const selectRemoteBranch = async (value: string) => {
    setSelected(value)
    if (!value) {
      props.select(null)
      return
    }
    props.select({ name: value })
  }

  return (<>{branchOptions && branchOptions.length ?
    <Select
      options={branchOptions}
      className="mt-2"
      id="branch-select"
      value={selected}
      onChange={selectRemoteBranch}
      placeholder="Select a branch"
      searchable
      searchPlaceholder="Type to search for a branch..."
    /> : null}
  </>)

}