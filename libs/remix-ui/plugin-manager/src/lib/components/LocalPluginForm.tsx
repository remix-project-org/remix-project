/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useReducer, useState } from 'react' // eslint-disable-line no-use-before-define
import { ModalDialog } from '@remix-ui/modal-dialog'
import { Toaster } from '@remix-ui/toaster'
import { IframePlugin, WebsocketPlugin } from '@remixproject/engine-web'
import { FormattedMessage, useIntl } from 'react-intl'
import { localPluginReducerActionType, localPluginToastReducer } from '../reducers/pluginManagerReducer'
import { canActivate, FormStateProps, PluginManagerComponent } from '../../types'

interface LocalPluginFormProps {
  closeModal: () => void
  visible: boolean
  pluginManager: PluginManagerComponent
}

const initialState: FormStateProps = {
  name: '',
  displayName: '',
  url: '',
  type: 'iframe',
  hash: '',
  methods: [],
  location: 'sidePanel',
  canActivate: []
}

const defaultProfile = {
  methods: [],
  location: 'sidePanel',
  type: 'iframe',
  name: '',
  displayName: '',
  url: '',
  hash: ''
}

function LocalPluginForm({ closeModal, visible, pluginManager }: LocalPluginFormProps) {
  const [errorMsg, dispatchToastMsg] = useReducer(localPluginToastReducer, '')
  const [name, setName] = useState<string>('')
  const [displayName, setDisplayName] = useState<string>('')
  const [url, setUrl] = useState<string>('')
  const [type, setType] = useState<'iframe' | 'ws'>('iframe')
  const [location, setLocation] = useState<'sidePanel' | 'mainPanel' | 'none'>('sidePanel')
  const [methods, setMethods] = useState<string>('')
  const [canactivate, setCanactivate] = useState<string>('')

  useEffect(() => {
    const storagePlugin: FormStateProps = localStorage.getItem('plugins/local') ? JSON.parse(localStorage.getItem('plugins/local')) : defaultProfile
    setName(storagePlugin.name)
    setUrl(storagePlugin.url)
    setLocation(storagePlugin.location as 'sidePanel' | 'mainPanel' | 'none')
    setMethods(Array.isArray(storagePlugin.methods) ? storagePlugin.methods.join(',') : storagePlugin.methods)
    setType(storagePlugin.type)
    setDisplayName(storagePlugin.displayName)
    setCanactivate(Array.isArray(storagePlugin.canActivate) ? storagePlugin.canActivate.join(',') : storagePlugin.canActivate || '')
  }, [])

  const handleModalOkClick = async () => {
    try {
      if (!name) throw new Error(intl.formatMessage({ id: 'pluginManager.localForm.errorPluginNeedsName' }))
      if (pluginManager.appManager.getIds().includes(name)) {
        throw new Error(intl.formatMessage({ id: 'pluginManager.localForm.errorNameAlreadyUsed' }))
      }
      if (!location) throw new Error(intl.formatMessage({ id: 'pluginManager.localForm.errorPluginNeedsLocation' }))
      if (!url) throw new Error(intl.formatMessage({ id: 'pluginManager.localForm.errorPluginNeedsUrl' }))
      const newMethods =
        typeof methods === 'string'
          ? methods
            .split(',')
            .filter((val) => val)
            .map((val) => {
              return val.trim()
            })
          : []
      const targetPlugin = {
        name: name,
        displayName: displayName,
        description: '',
        documentation: '',
        events: [],
        hash: '',
        kind: '',
        methods: newMethods,
        url: url,
        type: type,
        location: location,
        icon: 'assets/img/localPlugin.webp',
        canActivate:
          typeof canactivate === 'string'
            ? canactivate
              .split(',')
              .filter((val) => val)
              .map((val) => {
                return val.trim()
              })
            : []
      }
      const localPlugin = type === 'iframe' ? new IframePlugin(initialState) : new WebsocketPlugin(initialState)
      localPlugin.profile.hash = `local-${name}`
      targetPlugin.description = localPlugin.profile.description !== undefined ? localPlugin.profile.description : ''
      targetPlugin.events = localPlugin.profile.events !== undefined ? localPlugin.profile.events : []
      targetPlugin.kind = localPlugin.profile.kind !== undefined ? localPlugin.profile.kind : ''
      localPlugin.profile = { ...localPlugin.profile, ...targetPlugin }
      pluginManager.activateAndRegisterLocalPlugin(localPlugin)
    } catch (error) {
      const action: localPluginReducerActionType = {
        type: 'show',
        payload: `${error.message}`
      }
      dispatchToastMsg(action)
      console.log(error)
    }
  }

  const intl = useIntl()

  return (
    <>
      <ModalDialog
        handleHide={closeModal}
        id="pluginManagerLocalPluginModalDialog"
        hide={visible}
        title={intl.formatMessage({ id: 'pluginManager.localForm.title' })}
        okLabel={intl.formatMessage({ id: 'pluginManager.localForm.ok' })}
        okFn={handleModalOkClick}
        cancelLabel={intl.formatMessage({ id: 'pluginManager.localForm.cancel' })}
        cancelFn={closeModal}
      >
        <form id="local-plugin-form">
          <div className="mb-3">
            <label htmlFor="plugin-name">
              <FormattedMessage id="pluginManager.localForm.pluginName" />
              &nbsp;
              <small>
                (<FormattedMessage id="pluginManager.localForm.required" />)
              </small>
            </label>
            <input
              className="form-control"
              onChange={(e) => setName(e.target.value)}
              value={name || ''}
              id="plugin-name"
              data-id="localPluginName"
              placeholder={intl.formatMessage({
                id: 'pluginManager.localForm.shouldBeCamelCase'
              })}
            />
          </div>
          <div className="mb-3">
            <label htmlFor="plugin-displayname">
              <FormattedMessage id="pluginManager.localForm.displayName" />
            </label>
            <input
              className="form-control"
              onChange={(e) => setDisplayName(e.target.value)}
              value={displayName || ''}
              id="plugin-displayname"
              data-id="localPluginDisplayName"
              placeholder={intl.formatMessage({
                id: 'pluginManager.localForm.nameInTheHeader'
              })}
            />
          </div>
          <div className="mb-3">
            <label htmlFor="plugin-methods">
              <FormattedMessage id="pluginManager.localForm.api" />&nbsp; (
              <FormattedMessage id="pluginManager.localForm.commaSeparatedMethod" />)
            </label>
            <input
              className="form-control"
              onChange={(e) => setMethods(e.target.value)}
              value={methods || ''}
              id="plugin-methods"
              data-id="localPluginMethods"
              placeholder={intl.formatMessage({ id: 'pluginManager.localForm.methods' })}
            />
          </div>
          <div className="mb-3">
            <label htmlFor="plugin-methods">
              <FormattedMessage id="pluginManager.localForm.pluginsItCanActivate" />
              &nbsp; (
              <FormattedMessage id="pluginManager.localForm.commaSeparatedPlugin" />)
            </label>
            <input
              className="form-control"
              onChange={(e) => setCanactivate(e.target.value)}
              value={canactivate || ''}
              id="plugin-canactivate"
              data-id="localPluginCanActivate"
              placeholder={intl.formatMessage({ id: 'pluginManager.localForm.pluginNames' })}
            />
          </div>

          <div className="mb-3">
            <label htmlFor="plugin-url">
              <FormattedMessage id="pluginManager.localForm.url" />&nbsp;
              <small>
                (<FormattedMessage id="pluginManager.localForm.required" />)
              </small>
            </label>
            <input
              className="form-control"
              onChange={(e) => setUrl(e.target.value)}
              value={url || ''}
              id="plugin-url"
              data-id="localPluginUrl"
              placeholder={intl.formatMessage({ id: 'pluginManager.localForm.urlPlaceholder' })}
            />
          </div>
          <h6>
            <FormattedMessage id="pluginManager.localForm.typeOfConnection" />
            &nbsp;
            <small>
              (<FormattedMessage id="pluginManager.localForm.required" />)
            </small>
          </h6>
          <div className="form-check mb-3">
            <div className="radio">
              <input
                className="form-check-input"
                type="radio"
                name="type"
                value="iframe"
                id="iframe"
                data-id="localPluginRadioButtoniframe"
                checked={type === 'iframe'}
                onChange={(e) => setType(e.target.value as 'iframe' | 'ws')}
              />
              <label className="form-check-label" htmlFor="iframe">
                <FormattedMessage id="pluginManager.localForm.iframeType" />
              </label>
            </div>
            <div className="radio">
              <input
                className="form-check-input"
                type="radio"
                name="type"
                value="ws"
                id="ws"
                data-id="localPluginRadioButtonws"
                checked={type === 'ws'}
                onChange={(e) => setType(e.target.value as 'iframe' | 'ws')}
              />
              <label className="form-check-label" htmlFor="ws">
                <FormattedMessage id="pluginManager.localForm.websocketType" />
              </label>
            </div>
          </div>
          <h6>
            <FormattedMessage id="pluginManager.localForm.locationInRemix" />
            &nbsp;
            <small>
              (<FormattedMessage id="pluginManager.localForm.required" />)
            </small>
          </h6>
          <div className="form-check mb-3">
            <div className="radio">
              <input
                className="form-check-input"
                type="radio"
                name="location"
                value="sidePanel"
                id="localPluginRadioButtonsidePanelSidePanel"
                data-id="localPluginRadioButtonsidePanel"
                checked={location === 'sidePanel'}
                onChange={(e) => setLocation(e.target.value as 'sidePanel' | 'mainPanel' | 'none')}
              />
              <label className="form-check-label" htmlFor="localPluginRadioButtonsidePanelSidePanel">
                <FormattedMessage id="pluginManager.localForm.sidePanel" />
              </label>
            </div>
            <div className="radio">
              <input
                className="form-check-input"
                type="radio"
                name="location"
                value="mainPanel"
                id="localPluginRadioButtonsidePanelMainPanel"
                data-id="localPluginRadioButtonmainPanel"
                checked={location === 'mainPanel'}
                onChange={(e) => setLocation(e.target.value as 'sidePanel' | 'mainPanel' | 'none')}
              />
              <label className="form-check-label" htmlFor="localPluginRadioButtonsidePanelMainPanel">
                <FormattedMessage id="pluginManager.localForm.mainPanel" />
              </label>
            </div>
            <div className="radio">
              <input
                className="form-check-input"
                type="radio"
                name="location"
                value="none"
                id="localPluginRadioButtonsidePanelNone"
                data-id="localPluginRadioButtonnone"
                checked={location === 'none'}
                onChange={(e) => setLocation(e.target.value as 'sidePanel' | 'mainPanel' | 'none')}
              />
              <label className="form-check-label" htmlFor="localPluginRadioButtonsidePanelNone">
                <FormattedMessage id="pluginManager.localForm.none" />
              </label>
            </div>
          </div>
        </form>
      </ModalDialog>
      {errorMsg ? <Toaster message={errorMsg} /> : null}
    </>
  )
}

export default LocalPluginForm
