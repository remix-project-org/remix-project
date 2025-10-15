import { MatomoEvent } from '@remix-api'
import React, { createContext, useContext, ReactNode } from 'react'

export interface TrackingContextType {
  trackMatomoEvent?: <T extends MatomoEvent>(event: T) => void
}

const TrackingContext = createContext<TrackingContextType>({})

interface TrackingProviderProps {
  children: ReactNode
  trackingFunction?: <T extends MatomoEvent>(event: T) => void
}

export const TrackingProvider: React.FC<TrackingProviderProps> = ({
  children,
  trackingFunction
}) => {
  return (
    <TrackingContext.Provider value={{ trackMatomoEvent: trackingFunction }}>
      {children}
    </TrackingContext.Provider>
  )
}

export const useTracking = () => {
  return useContext(TrackingContext)
}

// Unified tracking hook that provides consistent access to tracking throughout the app
export const useAppTracking = () => {
  return useTracking()
}

export { TrackingContext }
export default TrackingContext