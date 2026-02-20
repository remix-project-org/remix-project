import { createContext } from 'react'

// AppContext for backward compatibility with existing components
// Contains dispatch, appState, and dappManager
export const AppContext = createContext<any>({})

// QuickDappContext for ViewPlugin integration (plugin reference only)
export interface QuickDappContextValue {
  plugin: any
}
export const QuickDappContext = createContext<QuickDappContextValue | null>(null)

// Export both for different use cases
export default AppContext
