import React, { forwardRef, CSSProperties } from 'react';

export interface Props extends React.HTMLAttributes<HTMLButtonElement> {
  active?: {
    fill: string;
    background: string;
  };
  cursor?: CSSProperties['cursor'];
}

export const Action = forwardRef<HTMLButtonElement, Props>(
  ({ active, className, cursor, style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        {...props}
        className={`d-flex align-items-center justify-content-center border-0 rounded p-3 item-action`}
        tabIndex={0}
        style={
          {
            ...style,
            cursor,
            width: 12,
          } as CSSProperties
        }
      />
    );
  }
);
