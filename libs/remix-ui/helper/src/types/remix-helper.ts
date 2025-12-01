import { MatomoEvent, WorkspaceEvent } from "@remix-api"

export interface ProcessLoadingParams {
  type: string
  importUrl: string // Full URL including prefix
  contentImport: any // contentImport plugin instance
  workspaceProvider: any // workspace provider from fileManager
  plugin: any // Main plugin instance for calling other plugins

  // Optional callbacks
  onLoading?: (loadingMsg: string) => void
  onSuccess?: () => void
  onError?: (error: string | Error) => void
  trackEvent?: (event: MatomoEvent) => void
}
