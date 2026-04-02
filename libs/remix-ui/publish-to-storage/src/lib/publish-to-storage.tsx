import React, {useEffect, useState} from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import {ModalDialog} from '@remix-ui/modal-dialog' // eslint-disable-line
import {RemixUiPublishToStorageProps} from './types' // eslint-disable-line
import { publishToIPFS } from './publishToIPFS'
import { publishToSwarm } from './publishOnSwarm'

export const PublishToStorage = (props: RemixUiPublishToStorageProps) => {
  const intl = useIntl()
  const { api, storage, contract, resetStorage } = props
  const [modalShown, setModalShown] = useState(false)
  const [state, setState] = useState({
    modal: {
      title: '',
      message: null,
      hide: true,
      okLabel: '',
      okFn: null,
      cancelLabel: '',
      cancelFn: null
    }
  })

  useEffect(() => {
    const storageService = async () => {
      if (contract.metadata === undefined || contract.metadata.length === 0) {
        modal(
          intl.formatMessage({ id: 'publishToStorage.title1' }),
          intl.formatMessage({ id: 'publishToStorage.message1' })
        )
      } else {
        if (storage === 'swarm') {
          try {
            const result = await publishToSwarm(contract, api)

            modal(intl.formatMessage({ id: 'publishToStorage.title2' }, { name: contract.name }), publishMessage(result.uploaded))
          } catch (err) {
            modal(intl.formatMessage({ id: 'publishToStorage.title3' }), publishMessageFailed(storage, err.message))
          }
        } else {
          if (!api.config.get('settings/ipfs-url') && !modalShown) {
            modal(
              intl.formatMessage({ id: 'publishToStorage.title4' }),
              <div>
                <FormattedMessage id="publishToStorage.title4.message1" /><br></br>
                <br></br>
                <FormattedMessage id="publishToStorage.title4.message2" /><br></br><FormattedMessage id="publishToStorage.title4.message3" /><br></br>
                <br></br>
                <ul className="pl-3">
                  <li key="ipfs-default"><FormattedMessage id="publishToStorage.title4.message4" /></li>
                  <li key="infura-options">
                    <FormattedMessage
                      id="publishToStorage.title4.message5"
                      values={{
                        a: (chunks) => (
                          <a href="https://infura.io/product/ipfs" target={'_blank'}>
                            {chunks}
                          </a>
                        )
                      }}
                    />
                  </li>
                  <li key="ipfs-external"><FormattedMessage id="publishToStorage.title4.message6" /></li>
                  <li key="ipfs-local"><FormattedMessage id="publishToStorage.title4.message7" /></li>
                </ul>
                <FormattedMessage id="publishToStorage.title4.message8" />
                <br></br>
                <FormattedMessage id="publishToStorage.title4.message9" />
              </div>,
              async () => await ipfs(contract, api)
            )
          } else {
            await ipfs(contract, api)
          }
        }
      }
    }

    if (storage) {
      storageService()
    }
  }, [storage])

  const ipfs = async (contract, api) => {
    try {
      const result = await publishToIPFS(contract, api)
      modal(intl.formatMessage({ id: 'publishToStorage.title2' }, { name: contract.name }), publishMessage(result.uploaded))
    } catch (err) {
      modal(intl.formatMessage({ id: 'publishToStorage.title5' }), publishMessageFailed(storage, err.message))
    }
    setModalShown(true)
  }

  const publishMessage = (uploaded) => (
    <span>
      {' '}
      <FormattedMessage id="publishToStorage.title2.message" values={{ name: contract.name.toLowerCase() }} /> <br />
      <pre>
        <div>
          {uploaded.map((value, index) => (
            <div key={index}>
              <b>{value.filename}</b> : <pre>{value.output.url}</pre>
            </div>
          ))}
        </div>
      </pre>
    </span>
  )

  const publishMessageFailed = (storage, err) => (
    <span>
      <FormattedMessage id="publishToStorage.title5.message" values={{ storage }} /> <br />
      {err}
    </span>
  )

  const handleHideModal = () => {
    setState((prevState) => {
      return {
        ...prevState,
        modal: { ...prevState.modal, hide: true, message: null }
      }
    })
    resetStorage()
  }

  const modal = async (title: string, message: string | JSX.Element, okFn: any = () => {}) => {
    await setState((prevState) => {
      return {
        ...prevState,
        modal: {
          ...prevState.modal,
          hide: false,
          message,
          title,
          okFn
        }
      }
    })
  }

  return (
    <ModalDialog
      id={props.id || 'publishToStorage'}
      title={state.modal.title}
      message={state.modal.message}
      hide={state.modal.hide}
      okLabel="OK"
      okFn={state.modal.okFn}
      handleHide={handleHideModal}
    >
      {typeof state.modal.message !== 'string' && state.modal.message}
    </ModalDialog>
  )
}

export default PublishToStorage
