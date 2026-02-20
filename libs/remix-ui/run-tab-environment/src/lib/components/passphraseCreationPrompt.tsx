import { Plugin } from '@remixproject/engine'
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { EnvironmentPlugin } from 'apps/remix-ide/src/app/udapp/udappEnv'
import React, { useState } from 'react'
import { FormattedMessage } from 'react-intl'

export function PassphraseCreationPrompt ({ udappEnv }: { udappEnv: EnvironmentPlugin }) {
  const [passphrase, setPassphrase] = useState('')
  const [matchPassphrase, setMatchPassphrase] = useState('')

  const handlePassphrase = (e) => {
    setPassphrase(e.target.value)
    if (matchPassphrase && e.target.value === matchPassphrase) {
      udappEnv.setMatchPassphrase(passphrase)
    } else {
      udappEnv.setMatchPassphrase(null)
    }
  }

  const handleMatchPassphrase = (e) => {
    setMatchPassphrase(e.target.value)
    if (passphrase && e.target.value === passphrase) {
      udappEnv.setMatchPassphrase(matchPassphrase)
    } else {
      udappEnv.setMatchPassphrase(null)
    }

  }

  return (
    <div className="d-flex flex-column">
      <FormattedMessage id="udapp.text1" />
      <input id="prompt1" type="password" name="prompt_text" className="w-100 py-2" onInput={handlePassphrase} />
      <input id="prompt2" type="password" name="prompt_text" className="w-100" onInput={handleMatchPassphrase} />
    </div>
  )
}
