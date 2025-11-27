import React, { forwardRef } from 'react';

import { Action, Props as ActionProps } from './Action';

export const Handle = forwardRef<HTMLButtonElement, ActionProps>(
  (props, ref) => {
    return (
      <Action
        ref={ref}
        cursor="grab"
        data-cypress="draggable-handle"
        {...props}
      >
        <i className="fas fa-grip-vertical"></i>
      </Action>
    );
  }
);
