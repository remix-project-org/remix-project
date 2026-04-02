import { Ref, useContext, useEffect } from 'react';
import { FormattedMessage } from 'react-intl';
import { AppContext } from '../../contexts';
import { selectTheme } from '../../actions';
import { Dropdown } from 'react-bootstrap';
import React from 'react';

export const themeMap: Record<string, any> = {
  Dark: { quality: 'dark', url: 'assets/css/themes/remix-dark_tvx1s2.css' },
  Light: { quality: 'light', url: 'assets/css/themes/remix-light_powaqg.css' },
};

const CustomToggle = React.forwardRef(
  (
    {
      children,
      onClick,
      icon,
      className = '',
    }: {
      children: React.ReactNode;
      onClick: (e: any) => void;
      icon: string;
      className: string;
    },
    ref: Ref<HTMLButtonElement>
  ) => (
    <button
      ref={ref}
      onClick={(e) => {
        e.preventDefault();
        onClick(e);
      }}
      id="dropdown-custom-components"
      data-id="selectThemesOptions"
      className={className.replace('dropdown-toggle', '')}
    >
      <div className="flex">
        <div className="me-auto whitespace-nowrap overflow-hidden">{children}</div>
        {icon && (
          <div className="pr-1">
            <i className={`${icon} pr-1`}></i>
          </div>
        )}
        <div>
          <i className="fad fa-sort-circle"></i>
        </div>
      </div>
    </button>
  )
);

const CustomMenu = React.forwardRef(
  (
    {
      children,
      style,
      'data-id': dataId,
      className,
      'aria-labelledby': labeledBy,
    }: {
      children: React.ReactNode;
      style?: React.CSSProperties;
      'data-id'?: string;
      className: string;
      'aria-labelledby'?: string;
    },
    ref: Ref<HTMLDivElement>
  ) => {
    const height = window.innerHeight * 0.6;
    return (
      <div
        ref={ref}
        style={style}
        className={className}
        aria-labelledby={labeledBy}
        data-id={dataId}
      >
        <ul
          className="overflow-auto list-unstyled mb-0"
          style={{ maxHeight: height + 'px' }}
        >
          {children}
        </ul>
      </div>
    );
  }
);

export function ThemeUI() {
  const { appState } = useContext(AppContext);
  const { theme } = appState.instance;

  const themeList = Object.keys(themeMap);

  useEffect(() => {
    selectTheme(theme);
  }, []);

  return (
    <div className="block">
      <label className="uppercase mb-0"><FormattedMessage id="quickDapp.themes" /></label>
      <Dropdown className="w-full">
        <Dropdown.Toggle
          as={CustomToggle}
          className="inline-flex items-center px-4 py-2 bg-light text-dark rounded-md hover:bg-light/90 transition-colors btn-block w-full inline-block border form-select"
          icon={''}
        >
          {theme} - {themeMap[theme].quality}
        </Dropdown.Toggle>
        <Dropdown.Menu
          as={CustomMenu}
          className="w-full form-select"
          data-id="custom-dropdown-items"
        >
          {themeList.map((item) => (
            <Dropdown.Item
              key={item}
              onClick={() => {
                selectTheme(item);
              }}
              data-id={`dropdown-item-${item}`}
            >
              {theme === item && (
                <span className="fas fa-check text-success mr-2"></span>
              )}
              {item} - {themeMap[item].quality}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>
    </div>
  );
}
