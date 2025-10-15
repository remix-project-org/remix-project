import { CustomTooltip } from '@remix-ui/helper'
import React, {useState, useEffect, useContext, useRef, useReducer} from 'react' //eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { Placement } from 'react-bootstrap/esm/types'
import { FileExplorerMenuProps } from '../types'
import { FileSystemContext } from '../contexts'
import { appPlatformTypes, platformContext } from '@remix-ui/app'
import { TrackingContext } from '@remix-ide/tracking'
import { MatomoEvent, FileExplorerEvent } from '@remix-api'

export const FileExplorerMenu = (props: FileExplorerMenuProps) => {
  const global = useContext(FileSystemContext)
  const platform = useContext(platformContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = FileExplorerEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const [state, setState] = useState({
    menuItems: [
      {
        action: 'createNewFile',
        title: 'Create new file',
        icon: 'far fa-file',
        placement: 'top',
        platforms:[appPlatformTypes.web, appPlatformTypes.desktop]
      },
      {
        action: 'createNewFolder',
        title: 'Create new folder',
        icon: 'far fa-folder',
        placement: 'top',
        platforms:[appPlatformTypes.web, appPlatformTypes.desktop]
      },
      {
        action: 'uploadFile',
        title: 'Upload files into current workspace',
        icon: 'far fa-upload',
        placement: 'top',
        platforms:[appPlatformTypes.web]
      },
      {
        action: 'uploadFolder',
        title: 'Upload folder into current workspace',
        icon: 'far fa-folder-upload',
        placement: 'top',
        platforms:[appPlatformTypes.web]
      },
      {
        action: 'importFromIpfs',
        title: 'Import files from ipfs',
        icon: 'fa-regular fa-cube',
        placement: 'top',
        platforms: [appPlatformTypes.web, appPlatformTypes.desktop]
      },
      {
        action: 'importFromHttps',
        title: 'Import files with https',
        icon: 'fa-solid fa-link',
        placement: 'top',
        platforms: [appPlatformTypes.web, appPlatformTypes.desktop]
      },
      {
        action: 'initializeWorkspaceAsGitRepo',
        title: 'Initialize workspace as a git repository',
        icon: 'fa-brands fa-git-alt',
        placement: 'top',
        platforms: [appPlatformTypes.web, appPlatformTypes.desktop]
      }
    ].filter(
      (item) =>
        props.menuItems &&
        props.menuItems.find((name) => {
          return name === item.action
        })
    ),
    actions: {}
  })

  const enableDirUpload = { directory: '', webkitdirectory: '' }

  return (
    (!global.fs.browser.isSuccessfulWorkspace ? null :
      <>

        <span data-id="spanContaining" className="ps-0 pb-1 w-50">
          {state.menuItems.map(({ action, title, icon, placement, platforms }, index) => {
            if (platforms && !platforms.includes(platform)) return null
            if (action === 'uploadFile') {
              return (
                <CustomTooltip
                  placement={placement as Placement}
                  tooltipId="uploadFileTooltip"
                  tooltipClasses="text-nowrap"
                  tooltipText={<FormattedMessage id={`filePanel.${action}`} defaultMessage={title} />}
                  key={`index-${action}-${placement}-${icon}`}
                >
                  <label
                    id={action}
                    style={{ fontSize: '1.1rem', cursor: 'pointer' }}
                    data-id={'fileExplorerUploadFile' + action}
                    className={icon + ' mx-1 remixui_menuItem'}
                    key={`index-${action}-${placement}-${icon}`}
                  >
                    <input
                      id="fileUpload"
                      data-id="fileExplorerFileUpload"
                      type="file"
                      onChange={(e) => {
                        e.stopPropagation()
                        trackMatomoEvent({ category: 'fileExplorer', action: 'fileAction', name: action, isClick: true })
                        props.uploadFile(e.target)
                        e.target.value = null
                      }}
                      multiple
                    />
                  </label>
                </CustomTooltip>
              )
            } else if (action === 'uploadFolder') {
              return (
                <CustomTooltip
                  placement={placement as Placement}
                  tooltipId="uploadFolderTooltip"
                  tooltipClasses="text-nowrap"
                  tooltipText={<FormattedMessage id={`filePanel.${action}`} defaultMessage={title} />}
                  key={`index-${action}-${placement}-${icon}`}
                >
                  <label
                    id={action}
                    style={{ fontSize: '1.1rem', cursor: 'pointer' }}
                    data-id={'fileExplorerUploadFolder' + action}
                    className={icon + ' mx-1 remixui_menuItem'}
                    key={`index-${action}-${placement}-${icon}`}
                  >
                    <input
                      id="folderUpload"
                      data-id="fileExplorerFolderUpload"
                      type="file"
                      onChange={(e) => {
                        e.stopPropagation()
                        trackMatomoEvent({ category: 'fileExplorer', action: 'fileAction', name: action, isClick: true })
                        props.uploadFolder(e.target)
                        e.target.value = null
                      }}
                      {...enableDirUpload}
                      multiple
                    />
                  </label>
                </CustomTooltip>
              )
            } else if (action === 'initializeWorkspaceAsGitRepo') {
              return (
                <CustomTooltip
                  placement={placement as Placement}
                  tooltipId="initializeWorkspaceAsGitRepoTooltip"
                  tooltipClasses="text-nowrap"
                  tooltipText={<FormattedMessage id={`filePanel.${action}`} defaultMessage={title} />}
                  key={`index-${action}-${placement}-${icon}`}
                >
                  <label
                    id={action}
                    style={{ fontSize: '1.1rem', cursor: 'pointer' }}
                    data-id={'fileExplorerInitializeWorkspaceAsGitRepo' + action}
                    className={icon + ' mx-1 remixui_menuItem'}
                    key={`index-${action}-${placement}-${icon}`}
                    onClick={() => {
                      trackMatomoEvent({ category: 'fileExplorer', action: 'fileAction', name: action, isClick: true })
                      props.handleGitInit()
                    }}
                  >
                  </label>
                </CustomTooltip>
              )
            } else {
              return (
                <CustomTooltip
                  placement={placement as Placement}
                  tooltipId={`${action}-${title}-${icon}-${index}`}
                  tooltipClasses="text-nowrap"
                  tooltipText={<FormattedMessage id={`filePanel.${action}`} defaultMessage={title} />}
                  key={`${action}-${title}-${index}`}
                >
                  <label
                    id={action}
                    style={{ fontSize: '1.1rem', cursor: 'pointer' }}
                    data-id={'fileExplorerNewFile' + action}
                    onClick={(e) => {
                      e.stopPropagation()
                      trackMatomoEvent({ category: 'fileExplorer', action: 'fileAction', name: action, isClick: true })
                      if (action === 'createNewFile') {
                        props.createNewFile()
                      } else if (action === 'createNewFolder') {
                        props.createNewFolder()
                      } else if (action === 'publishToGist' || action == 'updateGist') {
                        props.publishToGist()
                      } else if (action === 'importFromIpfs') {
                        trackMatomoEvent({ category: 'fileExplorer', action: 'fileAction', name: action, isClick: true })
                        props.importFromIpfs('Ipfs', 'ipfs hash', ['ipfs://QmQQfBMkpDgmxKzYaoAtqfaybzfgGm9b2LWYyT56Chv6xH'], 'ipfs://')
                      } else if (action === 'importFromHttps') {
                        trackMatomoEvent({ category: 'fileExplorer', action: 'fileAction', name: action, isClick: true })
                        props.importFromHttps('Https', 'http/https raw content', ['https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/master/contracts/token/ERC20/ERC20.sol'])
                      } else {
                        state.actions[action]()
                      }
                    }}
                    className={icon + ' mx-1 remixui_menuItem'}
                    key={`${action}-${title}-${index}`}
                  ></label>
                </CustomTooltip>
              )
            }
          })}
        </span>
      </>)
  )
}

export default FileExplorerMenu
