import React from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { FormattedMessage } from 'react-intl'

interface NavItemProps {
  to: string
  icon: JSX.Element
  title: string | any
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, title }) => {
  const location = useLocation()
  const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <NavLink
      data-id={`${title}Tab`}
      to={to}
      className={`no-underline flex items-center px-4 py-3 gap-2 transition-colors ${isActive ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-t border-l border-r border-gray-300 dark:border-gray-600' : 'bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 border-0'}`}
    >
      <span className="text-sm">{icon}</span>
      <span className="text-sm font-medium">{title}</span>
    </NavLink>
  )
}

export const NavMenu = () => {
  return (
    <nav className="flex flex-row w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      <NavItem to="/" icon={<i className="fas fa-home"></i>} title={ <FormattedMessage id="contract-verification.verifyNavTitle" defaultMessage={'Verify'} /> } />
      <NavItem to="/receipts" icon={<i className="fas fa-receipt"></i>} title={ <FormattedMessage id="contract-verification.receiptsNavTitle" defaultMessage={'Receipts'} /> } />
      <NavItem to="/lookup" icon={<i className="fas fa-search"></i>} title={ <FormattedMessage id="contract-verification.lookupNavTitle" defaultMessage={'Lookup'} /> } />
      <NavItem to="/settings" icon={<i className="fas fa-cog"></i>} title={ <FormattedMessage id="contract-verification.settingsNavTitle" defaultMessage={'Settings'} /> } />
    </nav>
  )
}
