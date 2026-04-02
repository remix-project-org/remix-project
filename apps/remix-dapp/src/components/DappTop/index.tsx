import React, { useContext, useEffect } from 'react';
import { AppContext } from '../../contexts';

const DappTop: React.FC = () => {
  const {
    appState: { instance },
  } = useContext(AppContext);
  const { shareTo, title, details } = instance;

  const getBoxPositionOnWindowCenter = (width: number, height: number) => ({
    left:
      window.outerWidth / 2 +
      (window.screenX || window.screenLeft || 0) -
      width / 2,
    top:
      window.outerHeight / 2 +
      (window.screenY || window.screenTop || 0) -
      height / 2,
  });
  let windowConfig: any = {
    width: 600,
    height: 400,
  };
  windowConfig = Object.assign(
    windowConfig,
    getBoxPositionOnWindowCenter(windowConfig.width, windowConfig.height)
  );

  const shareUrl = encodeURIComponent(window.origin);
  const shareTitle = encodeURIComponent('Hello everyone, this is my dapp!');

  return (
    <div className={`${instance.showLogo ? 'col-10' : 'col-12'} p-3 bg-light w-auto flex justify-between`}>
      <div>
        {title && <h1 data-id="dappTitle">{title}</h1>}
        {details && <span data-id="dappInstructions">{details}</span>}
      </div>
      {shareTo && (
        <div>
          {shareTo.includes('twitter') && (
            <i
              className="fab fa-twitter btn"
              onClick={() => {
                window.open(
                  `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}`,
                  '',
                  Object.keys(windowConfig)
                    .map((key) => `${key}=${windowConfig[key]}`)
                    .join(', ')
                );
              }}
            />
          )}
          {shareTo.includes('facebook') && (
            <i
              className="fab fa-facebook btn"
              onClick={() => {
                window.open(
                  `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`,
                  '',
                  Object.keys(windowConfig)
                    .map((key) => `${key}=${windowConfig[key]}`)
                    .join(', ')
                );
              }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default DappTop;
