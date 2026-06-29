import { createContext } from 'react'
import { EnvironmentAppContext } from '../types'

export const EnvAppContext = createContext<EnvironmentAppContext>({} as EnvironmentAppContext)
