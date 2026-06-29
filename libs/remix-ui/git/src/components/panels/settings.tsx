import { checkout, clone, ReadCommitResult } from "isomorphic-git";
import React from "react";
import { gitActionsContext } from "../../state/context";
import { gitPluginContext } from "../gitui";
import { CustomTooltip } from "@remix-ui/helper";

import { useIntl, FormattedMessage } from "react-intl";
import { CopyToClipboard } from "@remix-ui/clipboard";
import { FormControl, InputGroup } from "react-bootstrap";

export const Settings = () => {

  const [githubToken, setGithubToken] = React.useState('')
  const [githubUsername, setGithubUsername] = React.useState('')
  const [githubEmail, setGithubEmail] = React.useState('')
  const intl = useIntl()

  const gitAccessTokenLink = 'https://github.com/settings/tokens/new?scopes=gist,repo&description=Remix%20IDE%20Token'

  function handleChangeTokenState(e: string): void {
    throw new Error("Function not implemented.");
  }

  function handleChangeUserNameState(e: string): void {
    throw new Error("Function not implemented.");
  }

  function handleChangeEmailState(e: string): void {
    throw new Error("Function not implemented.");
  }

  function saveGithubToken(): void {
    throw new Error("Function not implemented.");
  }

  function removeToken(): void {
    throw new Error("Function not implemented.");
  }

  return (
    <>
      <input name='githubToken' onChange={e => handleChangeUserNameState(e.target.value)} value={githubToken} className="form-control mb-2" placeholder={intl.formatMessage({ id: 'gitui.githubTokenPlaceholder' })} type="text" id="githubToken" />
      <input name='githubUsername' onChange={e => handleChangeUserNameState(e.target.value)} value={githubUsername} className="form-control mb-2" placeholder={intl.formatMessage({ id: 'gitui.githubUsernamePlaceholder' })} type="text" id="githubUsername" />
      <input name='githubEmail' onChange={e => handleChangeEmailState(e.target.value)} value={githubEmail} className="form-control mb-1" placeholder={intl.formatMessage({ id: 'gitui.githubEmailPlaceholder' })} type="text" id="githubEmail" />
      <hr />
    </>
  );
}
