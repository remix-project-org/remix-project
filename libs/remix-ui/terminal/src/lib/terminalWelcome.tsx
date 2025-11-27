import React, {useEffect} from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { Registry } from '@remix-project/remix-lib'

const TerminalWelcomeMessage = ({ packageJson, storage }) => {
  // Don't show the welcome message in Electron - desktop client shows its own version
  const isDesktop = Registry.getInstance().get('platform')?.api?.isDesktop?.() || false

  if (isDesktop) {
    return null
  }

  return (
    <div className="remix_ui_terminal_block px-4 " data-id="block_null">
      <div className="remix_ui_terminal_welcome">
        {' '}
        <FormattedMessage id="terminal.welcomeText1" /> Remix {packageJson}{' '}
      </div>
      <br />
      <div className="">
        <FormattedMessage id="terminal.welcomeText2" /> {(window as any).remixFileSystem.name}, {storage} <FormattedMessage id="terminal.used" />
      </div>
      <br />
      <div>
        <FormattedMessage id="terminal.welcomeText3" />:{' '}
      </div>
      <ul className="ms-0 me-4">
        <li key="details-and-debug">
          <FormattedMessage id="terminal.welcomeText4" />.
        </li>
        <li key="run-javascript">
          <FormattedMessage id="terminal.welcomeText5" />:
          <br />
          <i>
            {' '}
            - <FormattedMessage id="terminal.welcomeText6" />{' '}
          </i>
          <br />
          <i>
            {' '}
            - <FormattedMessage id="terminal.welcomeText7" />{' '}
          </i>
          <br />
          <i>
            {' '}
            - <FormattedMessage id="terminal.welcomeText8" />{' '}
          </i>
        </li>
      </ul>

      <div>
        <FormattedMessage id="terminal.welcomeText9" />:
      </div>
      <ul className="ms-0 me-4">
        <li key="ethers-console">
          <a target="_blank" href="https://docs.ethers.io">
            ethers.js
          </a>{' '}
        </li>
      </ul>
      <div>
        <FormattedMessage id="terminal.welcomeText10" />.
      </div>
    </div>
  )
}

export default TerminalWelcomeMessage
