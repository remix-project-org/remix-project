import React, { forwardRef } from 'react';
import { Handle } from '../Item';
import { Remove } from './Remove'

export interface Props {
  children: React.ReactNode;
  columns?: number;
  label?: string;
  style?: React.CSSProperties;
  hover?: boolean;
  handleProps?: React.HTMLAttributes<any>;
  placeholder?: boolean;
  onClick?(): void;
  onRemove?(): void;
}

export const Container = forwardRef<HTMLDivElement, Props>(
  (
    {
      children,
      columns = 1,
      handleProps,
      hover,
      onClick,
      onRemove,
      label,
      placeholder,
      style,
      ...props
    }: Props,
    ref
  ) => {
    return (
      <div
        {...props}
        ref={ref}
        style={
          {
            ...style,
            '--columns': columns,
          } as React.CSSProperties
        }
        className={`col pe-0 d-flex rounded container ${hover && 'hover'} ${
          placeholder && 'placeholder'
        }`}
        onClick={onClick}
        tabIndex={onClick ? 0 : undefined}
      >
        {label ? (
          <div
            className={`px-2 py-1 d-flex align-items-center justify-content-between container-header`}
          >
            {label}
            <div className={`d-flex container-actions`}>
              <Remove onClick={onRemove} data-id={`remove${label.replace(/\s*/g,"")}`} />
              <Handle {...handleProps} data-id={`handle${label.replace(/\s*/g,"")}`} />
            </div>
          </div>
        ) : null}
        {placeholder ? (
          children
        ) : (
          <ul className="p-0 m-0 list-unstyled" style={{ overflowY: 'auto' }} data-id={`container${label.replace(/\s*/g,"")}`}>
            {children}
          </ul>
        )}
      </div>
    );
  }
);
