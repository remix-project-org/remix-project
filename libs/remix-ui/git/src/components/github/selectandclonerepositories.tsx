import React, { useEffect, useState } from "react";
import { gitActionsContext } from "../../state/context";
import { repository } from "@remix-api";
import { gitPluginContext } from "../gitui";
import RepositorySelect from "./repositoryselect";
import { BranchSelect } from "./branchselect";
import { TokenWarning } from "../panels/tokenWarning";

interface RepositoriesProps {
  cloneDepth?: number
  cloneAllBranches?: boolean
}

export const SelectAndCloneRepositories = (props: RepositoriesProps) => {
  const { cloneDepth, cloneAllBranches } = props
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)
  const [branch, setBranch] = useState({ name: "" });
  const [repo, setRepo] = useState<repository>(null);

  const selectRemoteBranch = async (branch: { name: string }) => {
    setBranch(branch)
  }

  const selectRepo = async (repo: repository) => {
    setBranch(null)
    setRepo(repo)
  }

  const clone = async () => {
    try {
      await actions.clone({
        url: repo.html_url,
        branch: branch.name,
        depth: cloneDepth,
        singleBranch: !cloneAllBranches
      })
      //actions.clone(repo.html_url, branch.name, cloneDepth, !cloneAllBranches)
    } catch (e) {
      // do nothing
    }
  };

  return (
    <>
      <RepositorySelect title="Load from GitHub" select={selectRepo} />
      <TokenWarning />

      {repo && <BranchSelect select={selectRemoteBranch} />}

      {repo && branch && branch.name && branch.name !== '0' ?
        <button data-id={`clonebtn-${repo.full_name}-${branch.name}`} className='btn btn-primary w-full mt-1' onClick={async () => {
          await clone()
        }}>clone {repo.full_name}:{branch.name}</button> : null}

      {repo && (!branch || branch.name === '0') ?
        <label className="text-warning">Please select a branch to clone</label> : null}

    </>
  )
}

