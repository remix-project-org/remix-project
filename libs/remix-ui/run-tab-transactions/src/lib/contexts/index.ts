import { createContext } from 'react'
import { TransactionsAppContextType } from '../types'

export const TransactionsAppContext = createContext<TransactionsAppContextType>({} as TransactionsAppContextType)
