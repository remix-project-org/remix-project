import { appPlatformTypes } from '@remix-ui/app'
import React from 'react'
import { Dropdown } from 'react-bootstrap'
import { HamburgerMenuItem, HamburgerSubMenuItem } from './workspace-hamburger-item'
import { WorkspaceMetadata } from '../types'

export interface HamburgerMenuProps {
  selectedWorkspace: WorkspaceMetadata
  createWorkspace: () => void
  createBlankWorkspace: () => Promise<void>
  renameCurrentWorkspace: () => void
  downloadCurrentWorkspace: () => void
  deleteCurrentWorkspace: () => void
  deleteAllWorkspaces: () => void
  pushChangesToGist: () => void
  cloneGitRepository: () => void
  downloadWorkspaces: () => void
  restoreBackup: () => void
  migrateToCloud?: () => void
  downloadCloudSnapshots?: () => void
  hideIconsMenu: (showMenu: boolean) => void
  handleRemixdWorkspace: () => void
  showIconsMenu: boolean
  hideWorkspaceOptions: boolean
  hideLocalhostOptions: boolean
  hideFileOperations: boolean
  isCloudMode?: boolean
}

export function HamburgerMenu(props: HamburgerMenuProps) {
  const { showIconsMenu, hideWorkspaceOptions, hideLocalhostOptions, hideFileOperations, selectedWorkspace } = props
  return (
    <>
      <HamburgerMenuItem
        kind="createBlank"
        fa="far fa-plus"
        hideOption={hideWorkspaceOptions}
        actionOnClick={() => {
          props.createBlankWorkspace()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web]}
      ></HamburgerMenuItem>
      <HamburgerMenuItem
        kind="create"
        fa="far fa-plus"
        hideOption={hideWorkspaceOptions}
        actionOnClick={() => {
          props.createWorkspace()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web]}
      ></HamburgerMenuItem>
      <HamburgerMenuItem
        kind="create.desktop"
        fa="far fa-plus"
        hideOption={hideWorkspaceOptions}
        actionOnClick={() => {
          props.createWorkspace()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.desktop]}
      ></HamburgerMenuItem>
      <HamburgerMenuItem
        kind="clone"
        fa="fa-brands fa-github-alt"
        hideOption={hideWorkspaceOptions}
        actionOnClick={() => {
          props.cloneGitRepository()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web, appPlatformTypes.desktop]}
      ></HamburgerMenuItem>
      <HamburgerMenuItem
        kind="rename"
        fa="far fa-edit"
        hideOption={hideWorkspaceOptions || hideLocalhostOptions}
        actionOnClick={() => {
          props.renameCurrentWorkspace()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web]}
      ></HamburgerMenuItem>
      <HamburgerMenuItem
        kind="download"
        fa="far fa-arrow-alt-down"
        hideOption={hideWorkspaceOptions || hideLocalhostOptions}
        actionOnClick={() => {
          props.downloadCurrentWorkspace()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web]}
      ></HamburgerMenuItem>
      <HamburgerMenuItem
        kind="delete"
        fa="far fa-trash"
        hideOption={hideWorkspaceOptions || hideLocalhostOptions}
        actionOnClick={() => {
          props.deleteCurrentWorkspace()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web]}
      ></HamburgerMenuItem>
      <Dropdown.Divider className="border mb-0 mt-0 remixui_menuhr" style={{ pointerEvents: 'none' }} />
      <HamburgerMenuItem
        kind="localFileSystem"
        fa="far fa-desktop"
        hideOption={hideWorkspaceOptions}
        actionOnClick={() => {
          props.handleRemixdWorkspace()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web]}
      ></HamburgerMenuItem>
      <Dropdown.Divider className="border mb-0 mt-0 remixui_menuhr" style={{ pointerEvents: 'none' }} />
      <HamburgerMenuItem
        kind={selectedWorkspace.isGist ? "updateGist" : "publishToGist"}
        fa="fab fa-github"
        hideOption={hideWorkspaceOptions || hideLocalhostOptions}
        actionOnClick={() => {
          props.pushChangesToGist()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web]}
      ></HamburgerMenuItem>
      <Dropdown.Divider className="border mb-0 mt-0 remixui_menuhr" style={{ pointerEvents: 'none' }} />
      <HamburgerMenuItem
        kind="deleteAll"
        fa="far fa-trash-alt"
        hideOption={hideWorkspaceOptions || hideLocalhostOptions}
        actionOnClick={() => {
          props.deleteAllWorkspaces()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web]}
      ></HamburgerMenuItem>
      <HamburgerMenuItem
        kind="backup"
        fa="far fa-download"
        hideOption={hideWorkspaceOptions || hideLocalhostOptions}
        actionOnClick={() => {
          props.downloadWorkspaces()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web]}
      ></HamburgerMenuItem>
      <HamburgerMenuItem
        kind="restore"
        fa="far fa-upload"
        hideOption={hideWorkspaceOptions}
        actionOnClick={() => {
          props.restoreBackup()
          props.hideIconsMenu(!showIconsMenu)
        }}
        platforms={[appPlatformTypes.web]}
      ></HamburgerMenuItem>
      {props.isCloudMode && (
        <>
          <Dropdown.Divider className="border mb-0 mt-0 remixui_menuhr" style={{ pointerEvents: 'none' }} />
          <HamburgerMenuItem
            kind="migrateToCloud"
            fa="fas fa-cloud-upload-alt"
            hideOption={hideWorkspaceOptions}
            actionOnClick={() => {
              props.migrateToCloud?.()
              props.hideIconsMenu(!showIconsMenu)
            }}
            platforms={[appPlatformTypes.web]}
          ></HamburgerMenuItem>
          <HamburgerMenuItem
            kind="downloadCloudSnapshots"
            fa="fas fa-history"
            hideOption={hideWorkspaceOptions}
            actionOnClick={() => {
              props.downloadCloudSnapshots?.()
              props.hideIconsMenu(!showIconsMenu)
            }}
            platforms={[appPlatformTypes.web]}
          ></HamburgerMenuItem>
        </>
      )}
    </>
  )
}

// keep for later use
/*<HamburgerSubMenuItem
          id="web3-script-menu"
          title="Web3 Scripts"
          subMenus={[
            {
              kind:'etherscan-script',
              fa: 'fa-kit fa-ts-logo',
              hideOption: hideWorkspaceOptions,
              actionOnClick: () => {
                alert('etherscan')
                props.addHelperScripts()
                props.hideIconsMenu(!showIconsMenu)
              }
            },
            {
              kind:'contract-deployer-factory-script',
              fa: 'fa-kit fa-ts-logo',
              hideOption: hideWorkspaceOptions,
              actionOnClick: () => {
                alert('deloyer')
                props.addHelperScripts()
                props.hideIconsMenu(!showIconsMenu)
              }
            }
          ]}
        ></HamburgerSubMenuItem>
        */
