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
      className={`text-decoration-none d-flex px-1 py-1 flex-column justify-content-center ${isActive ? 'bg-light text-dark border-top border-start border-end' : 'bg-transparent border-0'}`}
    >
      <span>
        <span style={{ marginLeft: "0.15rem"}}>{icon}</span>
        <span style={{ marginLeft: "0.35rem"}}>{title}</span>
      </span>
    </NavLink>
  )
}

export const NavMenu = () => {
  return (
    <nav className="d-flex medium flex-row w-100 bg-body">
      <NavItem to="/" icon={<i className="fas fa-home"></i>} title={ <FormattedMessage id="contract-verification.verifyNavTitle" defaultMessage={'Verify'} /> } />
      <NavItem to="/receipts" icon={<i className="fas fa-receipt"></i>} title={ <FormattedMessage id="contract-verification.receiptsNavTitle" defaultMessage={'Receipts'} /> } />
      <NavItem to="/lookup" icon={<i className="fas fa-search"></i>} title={ <FormattedMessage id="contract-verification.lookupNavTitle" defaultMessage={'Lookup'} /> } />
      <NavItem to="/settings" icon={<i className="fas fa-cog"></i>} title={ <FormattedMessage id="contract-verification.settingsNavTitle" defaultMessage={'Settings'} /> } />
    </nav>
  )
}
