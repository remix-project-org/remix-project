// eslint-disable-next-line no-use-before-define
import React from 'react'

interface PromptProps {
  message: string
  setPassphrase: (passphrase: string) => void
  defaultValue?: string
}

export function PassphrasePrompt(props: PromptProps) {
  const handleSignPassphrase = (e: any) => {
    props.setPassphrase(e.target.value)
  }

  return (
    <div>
      {' '}
      {props.message}
      <div>
        <input
          id="prompt_text"
          type="password"
          name="prompt_text"
          className="form-control"
          style={{ width: '100%' }}
          onInput={handleSignPassphrase}
          data-id="modalDialogCustomPromptText"
          defaultValue={props.defaultValue}
        />
      </div>
    </div>
  )
}
