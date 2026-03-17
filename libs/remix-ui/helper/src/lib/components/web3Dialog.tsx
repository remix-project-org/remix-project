// eslint-disable-next-line no-use-before-define
import React from 'react'
import { FormattedMessage } from 'react-intl'

interface web3ProviderDialogProps {
  setWeb3Endpoint: (value: string) => void
  externalEndpoint: string
}
const thePath = '<path/to/local/folder/for/test/chain>'

export function Web3ProviderDialog(props: web3ProviderDialogProps) {
  const handleInputEndpoint = (e) => {
    props.setWeb3Endpoint(e.target.value)
  }

  return (
    <>
      <div className="">
        <FormattedMessage id="helper.web3ProviderNote" values={{
          a: (chunks) => <a href="https://geth.ethereum.org/docs/rpc/server" target="_blank" rel="noreferrer">{chunks}</a>
        }} />
        <div className="border p-1">geth --http --http.corsdomain https://remix.ethereum.org</div>
        <br />
        <FormattedMessage id="helper.web3ProviderLocalNote" values={{
          a: (chunks) => <a href="https://geth.ethereum.org/getting-started/dev-mode" target="_blank" rel="noreferrer">{chunks}</a>
        }} />
        <div className="border p-1">
          geth --http --http.corsdomain="{window.origin}" --http.api web3,eth,debug,net --vmdebug --datadir {thePath} --dev console
        </div>
        <br />
        <br />
        <b><FormattedMessage id="helper.web3ProviderWarningLabel" /></b> <FormattedMessage id="helper.web3ProviderWarning" values={{ b: (chunks) => <b>{chunks}</b> }} />
        <br />
        <br />
        <FormattedMessage id="helper.web3ProviderMoreInfo" values={{
          a: (chunks) => <a href="https://remix-ide.readthedocs.io/en/latest/run.html#more-about-web3-provider" target="_blank" rel="noreferrer">{chunks}</a>
        }} />
        <br />
        <br />
        <FormattedMessage id="helper.web3ProviderEndpoint" />
      </div>
      <input
        onInput={handleInputEndpoint}
        type="text"
        name="prompt_text"
        id="prompt_text"
        style={{ width: '100%' }}
        className="form-control"
        defaultValue={props.externalEndpoint}
        data-id="modalDialogCustomPromptText"
      />
    </>
  )
}
