import React from 'react'
import { ContractWizardAction, ModifyContractProps } from '../../types/template-explorer-types'

export function ModifyContract({ tokenName, updateTokenName, strategy, toggleContractOption, switchAccessControl, checkBoxDispatch }: ModifyContractProps) {
  const { contractOptions, contractUpgradability, contractAccessControl } = strategy
  return (
    <>
      <div className="col-12 col-lg-3">
        <div className="border rounded p-3 h-100">
          <div className="mb-3">
            <div className="fw-semibold mb-2">Contract settings</div>
            <label className="form-label text-uppercase small mb-1">Token name</label>
            <input className="form-control form-control-sm" placeholder="My Token" value={tokenName} onChange={(e) => updateTokenName(e.target.value)} />
          </div>

          <div className="mb-3">
            <div className="text-uppercase small fw-semibold mb-2">Features</div>
            <div className="form-check mb-1">
              <input className="form-check-input" type="checkbox" id="featMintable" checked={contractOptions.mintable} onChange={() => {
                toggleContractOption('mintable')}
              } />
              <label className="form-check-label" htmlFor="featMintable">Mintable</label>
            </div>
            <div className="form-check mb-1">
              <input className="form-check-input" type="checkbox" id="featBurnable" checked={contractOptions.burnable} onChange={() => toggleContractOption('burnable')} />
              <label className="form-check-label" htmlFor="featBurnable">Burnable</label>
            </div>
            <div className="form-check mb-1">
              <input className="form-check-input" type="checkbox" id="featPausable" checked={contractOptions.pausable} onChange={() => toggleContractOption('pausable')} />
              <label className="form-check-label" htmlFor="featPausable">Pausable</label>
            </div>
          </div>

          <div className="mb-3">
            <div className="text-uppercase small fw-semibold mb-2">Access control</div>
            <div className="form-check mb-1">
              <input className="form-check-input" type="radio" name="accessControl" id="accessOwnable" checked={contractAccessControl==='ownable'} onChange={() => switchAccessControl('ownable')} />
              <label className="form-check-label" htmlFor="accessOwnable">Ownable</label>
            </div>
            <div className="form-check mb-1">
              <input className="form-check-input" type="radio" name="accessControl" id="accessRoles" checked={contractAccessControl==='roles'} onChange={() => switchAccessControl('roles')} />
              <label className="form-check-label" htmlFor="accessRoles">Roles</label>
            </div>
            <div className="form-check">
              <input className="form-check-input" type="radio" name="accessControl" id="accessManaged" checked={contractAccessControl==='managed'} onChange={() => switchAccessControl('managed')} />
              <label className="form-check-label" htmlFor="accessManaged">Managed</label>
            </div>
          </div>

          <div className="mb-3">
            <div className="text-uppercase small fw-semibold mb-2">Upgradability</div>
            <div className="form-check mb-1">
              <input className="form-check-input" type="checkbox" id="featUups" checked={contractUpgradability.uups} onChange={() => checkBoxDispatch({ type: ContractWizardAction.CONTRACT_UPGRADABILITY_UPDATE, payload: { ...contractUpgradability, uups: !contractUpgradability.uups } })} />
              <label className="form-check-label" htmlFor="featUups">UUPS</label>
            </div>
            <div className="form-check">
              <input className="form-check-input" type="checkbox" id="featTransparent" checked={strategy.contractUpgradability.transparent} onChange={() => checkBoxDispatch({ type: ContractWizardAction.CONTRACT_UPGRADABILITY_UPDATE, payload: { ...strategy.contractUpgradability, transparent: !strategy.contractUpgradability.transparent } })} />
              <label className="form-check-label" htmlFor="featTransparent">Transparent</label>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
