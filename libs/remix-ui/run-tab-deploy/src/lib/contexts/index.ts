import { createContext } from 'react'
import { DeployAppContextType } from '../types'

export const DeployAppContext = createContext<DeployAppContextType>({} as DeployAppContextType)

