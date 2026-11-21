/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { Fragment, useState } from 'react' // eslint-disable-line no-use-before-define
import { FormattedMessage, useIntl } from 'react-intl'
/* eslint-disable-line */
import { ModalDialog } from '@remix-ui/modal-dialog'
import useLocalStorage from '../custom-hooks/useLocalStorage'
import { PluginPermissions } from '../../types'
import { CustomTooltip } from '@remix-ui/helper'

function PermisssionsSettings() {
  const [modalVisibility, setModalVisibility] = useState<boolean>(true)
  const [, persistPermissions] = useLocalStorage<PluginPermissions>('plugins/permissions', {} as PluginPermissions)
  const [permissions, setPermissions] = useState<PluginPermissions>({} as PluginPermissions)
  const intl = useIntl()
  const closeModal = () => setModalVisibility(true)
  const openModal = () => {
    const currentValue = JSON.parse(window.localStorage.getItem('plugins/permissions') || '{}')
    setPermissions(currentValue)
    setModalVisibility(false)
  }

  const save = () => {
    persistPermissions(permissions)
  }

  const getState = (targetPlugin: string, funcName: string, pluginName: string) => {
    return permissions[targetPlugin][funcName][pluginName].allow
  }

  const handleCheckboxClick = (targetPlugin: string, funcName: string, pluginName: string) => {
    setPermissions((previous) => ({
      ...previous,
      [targetPlugin]: {
        ...previous[targetPlugin],
        [funcName]: {
          ...previous[targetPlugin][funcName],
          [pluginName]: {
            ...previous[targetPlugin][funcName][pluginName],
            allow: !previous[targetPlugin][funcName][pluginName].allow
          }
        }
      }
    }))
  }

  function clearFunctionPermission(targetPlugin: string, funcName: string, pluginName: string) {
    setPermissions((previous) => {
      const next = JSON.parse(JSON.stringify(previous)) as PluginPermissions
      delete next[targetPlugin][funcName][pluginName]
      if (Object.keys(next[targetPlugin][funcName]).length === 0) delete next[targetPlugin][funcName]
      if (Object.keys(next[targetPlugin]).length === 0) delete next[targetPlugin]
      return next
    })
  }

  function clearTargetPermission(targetPlugin: string) {
    setPermissions((previous) => {
      const next = { ...previous }
      delete next[targetPlugin]
      return next
    })
  }

  function RenderPluginHeader({ headingName }) {
    return (
      <div className="pb-2 remixui_permissionKey">
        <h3>
          {headingName} <FormattedMessage id="pluginManager.permissions" />:
        </h3>
        <i
          onClick={() => {
            clearTargetPermission(headingName)
          }}
          className="far fa-trash-alt"
          data-id={`pluginManagerSettingsClearAllPermission-${headingName}`}
        ></i>
      </div>
    )
  }

  function RenderPermissions({ targetPlugin }) {
    return (
      <>
        {Object.keys(permissions[targetPlugin]).map((funcName) => {
          return Object.keys(permissions[targetPlugin][funcName]).map((pluginName, index) => (
            <div className="mb-3 remixui_permissionKey" key={pluginName}>
              {permissions && Object.keys(permissions).length > 0 ? (
                <>
                  <div className="remixui_checkbox">
                    <span className="me-2">
                      <input
                        type="checkbox"
                        onChange={() => handleCheckboxClick(targetPlugin, funcName, pluginName)}
                        checked={getState(targetPlugin, funcName, pluginName)}
                        id={`permission-checkbox-${targetPlugin}-${funcName}-${pluginName}`}
                        aria-describedby={`module ${pluginName} asks permission for ${funcName}`}
                      />
                      <label
                        className="ms-4"
                        htmlFor={`permission-checkbox-${targetPlugin}-${funcName}-${targetPlugin}`}
                        data-id={`permission-label-${targetPlugin}-${funcName}-${targetPlugin}`}
                      >
                        <FormattedMessage id="pluginManager.allow" /><u>{pluginName}</u> <FormattedMessage id="pluginManager.toCall" /> <u>{funcName}</u>
                      </label>
                    </span>
                  </div>
                  <i
                    onClick={() => {
                      clearFunctionPermission(targetPlugin, funcName, pluginName)
                    }}
                    className="fa fa-trash-alt"
                    data-id={`pluginManagerSettingsRemovePermission-${targetPlugin}-${funcName}-${targetPlugin}`}
                  />
                </>
              ) : null}
            </div>
          ))
        })}
      </>
    )
  }

  return (
    <Fragment>
      <ModalDialog
        id="permissionsSettings"
        handleHide={closeModal}
        okFn={save}
        hide={modalVisibility}
        title={intl.formatMessage({
          id: 'pluginManager.pluginManagerPermissions'
        })}
        okLabel={intl.formatMessage({ id: 'pluginManager.ok' })}
        cancelLabel={intl.formatMessage({ id: 'pluginManager.cancel' })}
      >
        {permissions && Object.keys(permissions).length > 0 ? (
          <h4 className="text-center">
            <FormattedMessage id="pluginManager.currentPermissionSettings" />
          </h4>
        ) : (
          <h4 className="text-center">
            <FormattedMessage id="pluginManager.noPermissionRequestedYet" />
          </h4>
        )}
        <form className="remixui_permissionForm" data-id="pluginManagerSettingsPermissionForm">
          <div className="p-2">
            {Object.keys(permissions).map((targetPlugin) => (
              <div key={`container-${targetPlugin}`}>
                <RenderPluginHeader key={`header-${targetPlugin}`} headingName={targetPlugin} />
                <RenderPermissions key={`permissions-${targetPlugin}`} targetPlugin={targetPlugin} />
              </div>
            ))}
          </div>
        </form>
      </ModalDialog>
      <footer className="bg-light remixui_permissions remix-bg-opacity">
        <CustomTooltip
          placement={'top'}
          tooltipId="pmPermissions"
          tooltipClasses="text-nowrap"
          tooltipText={<FormattedMessage id="pluginManager.managePluginsPermissions" />}
          key={'keypmPermissions'}
        >
          <button onClick={openModal} className="btn btn-primary settings-button" data-id="pluginManagerPermissionsButton">
            <FormattedMessage id="pluginManager.Permissions" />
          </button>
        </CustomTooltip>
      </footer>
    </Fragment>
  )
}
export default PermisssionsSettings
