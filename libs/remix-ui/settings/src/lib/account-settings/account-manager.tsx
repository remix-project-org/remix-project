import React from 'react'
import { ConnectedAccounts } from './connected-accounts'
import { CreditsBalance } from './credits-balance'

interface AccountManagerProps {
  plugin: any
}

export const AccountManager: React.FC<AccountManagerProps> = ({ plugin }) => {
  return (
    <div className="account-manager p-3">
      <CreditsBalance plugin={plugin} />
      <ConnectedAccounts plugin={plugin} />
    </div>
  )
}
