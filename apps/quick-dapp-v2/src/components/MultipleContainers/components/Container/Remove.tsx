import React from 'react';

import { Action, Props as ActionProps } from '../Item/Action';

export function Remove(props: ActionProps) {
  return (
    <Action
      {...props}
    >
      <i className="fas fa-times"></i>
    </Action>
  );
}
