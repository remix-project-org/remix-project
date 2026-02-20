import React, { useState } from "react"
import { FormattedMessage, useIntl } from "react-intl"
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { EnvironmentPlugin } from "apps/remix-ide/src/app/udapp/udappEnv"

const EIP712_Example = {
  domain: {
    chainId: 1,
    name: "Example App",
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
    version: "1",
  },
  message: {
    prompt: "Welcome! In order to authenticate to this website, sign this request and your public address will be sent to the server in a verifiable way.",
    createdAt: 1718570375196,
  },
  primaryType: 'AuthRequest',
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    AuthRequest: [
      { name: 'prompt', type: 'string' },
      { name: 'createdAt', type: 'uint256' },
    ],
  },
}

export function SignMessagePrompt ({
  onMessageChange,
  plugin,
  defaultMessage = ''
}: {
  onMessageChange: (message: string) => void
  plugin: EnvironmentPlugin
  defaultMessage?: string
}) {
  const intl = useIntl()
  const [message, setMessage] = useState(defaultMessage)

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setMessage(value)
    onMessageChange(value)
  }

  const handleEIP712Click = () => {
    // Hack to close SignMessagePrompt modal and show EIP712MessageSigning modal
    // TODO: Remove this hack when we have a proper way to close modals via plugin calls
    const cancelBtn = document.querySelector('[data-id="signMessage-modal-footer-cancel-react"]') as HTMLButtonElement
    if (cancelBtn) {
      cancelBtn.click()
    }
    setTimeout(() => {
      plugin.call('notification', 'modal', {
        id: 'eip712MessageSigning',
        title: 'Message signing with EIP-712',
        message: (
          <div>
            <div>{intl.formatMessage({ id: 'udapp.EIP712-2' }, {
              a: (chunks) => (
                <a href='https://eips.ethereum.org/EIPS/eip-712' target="_blank" rel="noreferrer">
                  {chunks}
                </a>
              )
            })}</div>
            <div>{intl.formatMessage({ id: 'udapp.EIP712-3' })}</div>
          </div>
        ),
        okLabel: intl.formatMessage({ id: 'udapp.EIP712-create-template' }),
        cancelLabel: intl.formatMessage({ id: 'udapp.EIP712-close' }),
        okFn: async () => {
          await plugin.call('fileManager', 'writeFileNoRewrite', 'EIP-712-data.json', JSON.stringify(EIP712_Example, null, '\t'))
          await plugin.call('fileManager', 'open', 'EIP-712-data.json')
        }
      })
    }, 100)
  }

  return (
    <div>
      <FormattedMessage id="udapp.enterAMessageToSign" />
      <textarea
        id="prompt_text"
        className="bg-light form-control"
        data-id="signMessageTextarea"
        style={{ width: '100%' }}
        rows={4}
        cols={50}
        onChange={handleInputChange}
        defaultValue={message}
      ></textarea>
      <div className='mt-2'>
        <span>otherwise</span>
        <button
          className='ms-2 modal-ok btn btn-sm border-primary'
          data-id="sign-eip-712"
          onClick={handleEIP712Click}
        >
          Sign with EIP 712
        </button>
      </div>
    </div>
  )
}

export function SignedMessagePrompt ({ msgHash, signedData }: { msgHash: string, signedData: string }) {
  return (
    <div className="d-flex flex-column">
      <label className="text-uppercase">
        <FormattedMessage id="udapp.hash" />
      </label>
      <span id="remixRunSignMsgHash" data-id="settingsRemixRunSignMsgHash">
        {msgHash}
      </span>
      <label className="pt-2 text-uppercase">
        <FormattedMessage id="udapp.signature" />
      </label>
      <span id="remixRunSignMsgSignature" data-id="settingsRemixRunSignMsgSignature">
        {signedData}
      </span>
    </div>
  )
}
