import React, { useContext } from 'react';
import BounceLoader from 'react-spinners/BounceLoader';
import { AppContext } from '../../contexts';

const LoadingScreen: React.FC = () => {
  const { appState } = useContext(AppContext);
  const loading = appState.loading.screen;

  return loading ? (
    <div
      className="w-full h-full fixed bg-dark z-3"
      style={{
        top: 0,
        opacity: 0.8
      }}
    >
      <BounceLoader
        color="#a7b0ae"
        size={100}
        className="absolute m-0"
        style={{
          top: '40%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
        }}
      />
    </div>
  ) : null;
};

export default LoadingScreen;
