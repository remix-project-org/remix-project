/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import { Topbar } from 'apps/remix-ide/src/app/components/top-bar'
import { createContext, SyntheticEvent } from 'react'

export const TopbarContext = createContext<{
  fs: any,
  plugin: Topbar,
  modal:(title: string | JSX.Element, message: string | JSX.Element, okLabel: string, okFn: () => void, cancelLabel?: string, cancelFn?: () => void) => void,
  recentFolders: string[],
  fetchRecentFolders: () => Promise<void>,
  openRecentFolder: (path: string) => Promise<void>,
  openRecentFolderInNewWindow: (path: string) => Promise<void>,
  removeRecentFolder: (path: string) => Promise<void>,
  revealRecentFolderInExplorer: (path: string) => Promise<void>,
  desktopClientMode?: boolean
    }>(null)

