// src/LogViewer.tsx
import React, { useContext } from 'react';
import { gitPluginContext } from '../gitui';
import { FormattedMessage } from 'react-intl';

const LogViewer = () => {
  const context = useContext(gitPluginContext);

  const typeToCssClass = (type: string) => {
    switch (type) {
    case 'error':
      return 'text-danger';
    case 'warning':
      return 'text-warning';
    case 'info':
      return 'text-info';
    case 'debug':
      return 'text-secondary';
    default:
      return 'text-success';
    }
  };

  if (context.log && context.log.length > 0) {

    return (
      <div className="p-1">
        {context.log && context.log.reverse().map((log, index) => (
          <div key={index} className={`log-entry ${typeToCssClass(log.type)}`}>
            [{log.type.toUpperCase()}] {log.message}
          </div>
        ))}
      </div>
    );
  } else {
    return <div className="p-1"><FormattedMessage id="gitui.noLogs" /></div>
  }
};

export default LogViewer;
