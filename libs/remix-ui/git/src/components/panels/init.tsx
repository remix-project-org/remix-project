import { CustomTooltip } from '@remix-ui/helper';
import { pull } from 'lodash';
import React, { useContext } from 'react';
import { FormattedMessage } from 'react-intl';
import { gitActionsContext } from '../../state/context';
import GitUIButton from '../buttons/gituibutton';
import { Clone } from './clone';

export const Init = () => {

  const actions = React.useContext(gitActionsContext)

  const init = async () => {
    actions.init()
  }

  return (
    <>

      <div>
        <div className='mt-1 mb-2'>
          <h6><FormattedMessage id="gitui.initialize" /></h6>
          <GitUIButton
            onClick={init}
            className="btn w-md-25 w-100 btn-primary"
            data-id="initgit-btn"
          ><FormattedMessage id='git.init' /></GitUIButton>
        </div>
      </div>
    </>
  )
}
