import React, { useEffect, useMemo, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';
import { getPrimaryQuickDappContract, getQuickDappContracts, shortenAddress } from '@remix-ui/helper';
import type { DappConfig } from '../../types';

interface DappSettingsDrawerProps {
  show: boolean;
  dapp: DappConfig;
  isUpdating: boolean;
  onClose: () => void;
  onUpdate: () => void | Promise<void>;
}

export default function DappSettingsDrawer({
  show,
  dapp,
  isUpdating,
  onClose,
  onUpdate
}: DappSettingsDrawerProps): JSX.Element {
  const [showAdditionalBindings, setShowAdditionalBindings] = useState(false);
  const bindings = useMemo(() => getQuickDappContracts(dapp), [dapp]);
  const primary = useMemo(() => getPrimaryQuickDappContract(dapp), [dapp]);
  const primaryBinding = primary || bindings[0];
  const additionalBindings = primaryBinding
    ? bindings.filter((binding) => binding.id !== primaryBinding.id)
    : [];
  const networkLabel = primary?.networkName || dapp.contract?.networkName || 'Unknown network';

  useEffect(() => {
    setShowAdditionalBindings(false);
  }, [show, dapp.slug]);

  return (
    <Modal
      show={show}
      onHide={onClose}
      dialogClassName="qd-settings-drawer"
      scrollable
      data-id="quickDappSettingsDrawer"
    >
      <Modal.Header closeButton>
        <Modal.Title>Contract bindings</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="small text-secondary mb-3">
          {bindings.length > 0
            ? `${bindings.length} contract${bindings.length > 1 ? 's' : ''} · ${networkLabel}`
            : 'No contract bindings'}
        </div>

        <div className="mb-3">
          {primaryBinding ? (
            <>
              <div className="border rounded p-2" data-id={`quickDappSettingsBinding-${primaryBinding.id}`}>
                <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
                  <span className="fw-semibold text-break">{primaryBinding.alias}</span>
                  <span className="badge bg-secondary">Primary</span>
                </div>
                <div className="small font-monospace text-break" title={primaryBinding.address}>{shortenAddress(primaryBinding.address)}</div>
              </div>

              {additionalBindings.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-decoration-none p-0 mt-2"
                    onClick={() => setShowAdditionalBindings((current) => !current)}
                    aria-expanded={showAdditionalBindings}
                    aria-controls="quickDappSettingsAdditionalBindings"
                    data-id="quickDappSettingsAdditionalBindingsToggle"
                  >
                    {showAdditionalBindings ? 'Hide additional contracts' : `+${additionalBindings.length} more`}
                  </button>

                  {showAdditionalBindings && (
                    <div id="quickDappSettingsAdditionalBindings" className="mt-2">
                      {additionalBindings.map((binding) => (
                        <div className="border rounded p-2 mb-2" key={binding.id} data-id={`quickDappSettingsBinding-${binding.id}`}>
                          <div className="fw-semibold text-break mb-1">{binding.alias}</div>
                          <div className="small font-monospace text-break" title={binding.address}>{shortenAddress(binding.address)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="border rounded p-3 text-secondary small" data-id="quickDappSettingsNoBindings">
              This DApp has no contract bindings.
            </div>
          )}
        </div>

        <div className="small text-secondary">
          Workspace, source, and deployment details remain in <strong>DApp info</strong>. Binding changes use the validated DApp update flow.
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={onUpdate} disabled={isUpdating} data-id="quickDappSettingsUpdateBtn">
          <i className="fas fa-robot me-1" aria-hidden="true"></i>
          Change bindings with AI
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
