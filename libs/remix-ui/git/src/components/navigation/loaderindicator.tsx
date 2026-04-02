import React, { useContext } from 'react'
import { gitPluginContext } from '../gitui'

interface LoaderIndicatorProps {
  type?: string;
  isLoadingCondition?: boolean; // Optional additional disabling condition
}

// This component extends a button, disabling it when loading is true
const LoaderIndicator = ({ type, isLoadingCondition }: LoaderIndicatorProps) => {
  const { loading } = React.useContext(gitPluginContext)

  const isLoading = loading || isLoadingCondition
  if (!isLoading) return null
  return (
    <i data-id='loader-indicator' style={{ fontSize: 'x-small' }} className="ml-1 fas fa-spinner fa-spin fa-4x"></i>
  );
};

export default LoaderIndicator;