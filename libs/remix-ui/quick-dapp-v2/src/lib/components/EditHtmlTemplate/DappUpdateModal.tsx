import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import {
  getPrimaryQuickDappContract,
  getQuickDappContracts,
  isQuickDappRemixVMIdentifier,
  normalizeQuickDappEnvironment,
  shortenAddress
} from '@remix-ui/helper';
import type { DappConfig } from '../../types';

interface DeployedContractCandidate {
  address: string;
  name?: string;
}

export interface DappBindingChangeRequest {
  type: 'add' | 'replace';
  contractAddress: string;
  contractName: string;
  replaceContractId?: string;
}

export interface DappUpdateRequest {
  description: string;
  bindingChange?: DappBindingChangeRequest;
}

interface DappUpdateModalProps {
  show: boolean;
  dapp: DappConfig;
  plugin: any;
  onCancel: () => void;
  onConfirm: (request: DappUpdateRequest) => void;
}

type UpdateKind = 'source' | 'add' | 'replace';

const candidateKey = (candidate: DeployedContractCandidate): string => candidate.address.toLowerCase();

export default function DappUpdateModal({
  show,
  dapp,
  plugin,
  onCancel,
  onConfirm
}: DappUpdateModalProps): JSX.Element {
  const [description, setDescription] = useState('');
  const [updateKind, setUpdateKind] = useState<UpdateKind>('source');
  const [replaceContractId, setReplaceContractId] = useState('');
  const [candidateAddress, setCandidateAddress] = useState('');
  const [candidates, setCandidates] = useState<DeployedContractCandidate[]>([]);
  const [currentEnvironment, setCurrentEnvironment] = useState('');
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState('');

  const bindings = useMemo(() => getQuickDappContracts(dapp), [dapp]);
  const primary = useMemo(() => getPrimaryQuickDappContract(dapp), [dapp]);
  const isContractDapp = dapp.appKind !== 'graph-only' && dapp.appKind !== 'zk-circuit' && !!primary;
  const isRemixVmDapp = isQuickDappRemixVMIdentifier(primary?.chainId);
  const environmentMatches = !!primary && !!currentEnvironment &&
    normalizeQuickDappEnvironment(primary.chainId) === normalizeQuickDappEnvironment(currentEnvironment);
  const canChangeBindings = isContractDapp && !isRemixVmDapp && environmentMatches;

  const availableCandidates = useMemo(() => {
    const boundAddresses = new Set(bindings.map((binding) => binding.address.toLowerCase()));
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      if (!candidate.address) return false;
      const key = candidateKey(candidate);
      if (boundAddresses.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [bindings, candidates]);

  useEffect(() => {
    if (!show) return;

    setDescription('');
    setUpdateKind('source');
    setReplaceContractId(bindings[0]?.id || '');
    setCandidateAddress('');
    setCandidateError('');
    setLoadingCandidates(true);

    let active = true;
    Promise.all([
      plugin.call('udappDeployedContracts', 'getDeployedContracts'),
      plugin.call('blockchain', 'getProvider').then(async (provider: string) => {
        if (isQuickDappRemixVMIdentifier(provider)) return provider;
        return plugin.call('blockchain', 'sendRpc', 'eth_chainId');
      })
    ]).then(([deployedContracts, environment]) => {
      if (!active) return;
      setCandidates(Array.isArray(deployedContracts) ? deployedContracts : []);
      setCurrentEnvironment(String(environment || ''));
    }).catch((error: any) => {
      if (!active) return;
      setCandidates([]);
      setCurrentEnvironment('');
      setCandidateError(error?.message || 'Could not read deployed contracts from the current environment.');
    }).finally(() => {
      if (active) setLoadingCandidates(false);
    });

    return () => {
      active = false;
    };
  }, [show, dapp.slug]);

  useEffect(() => {
    if (updateKind !== 'source' && !canChangeBindings) setUpdateKind('source');
  }, [canChangeBindings, updateKind]);

  const selectedCandidate = availableCandidates.find((candidate) => candidateKey(candidate) === candidateAddress);
  const bindingSelectionValid = updateKind === 'source' || (
    !!selectedCandidate && (updateKind === 'add' || !!replaceContractId)
  );
  const canSubmit = !!description.trim() && bindingSelectionValid && !loadingCandidates;

  const handleConfirm = () => {
    if (!canSubmit) return;

    if (updateKind === 'source') {
      onConfirm({ description: description.trim() });
      return;
    }
    if (!selectedCandidate) return;

    onConfirm({
      description: description.trim(),
      bindingChange: {
        type: updateKind,
        contractAddress: selectedCandidate.address,
        contractName: selectedCandidate.name || 'Contract',
        ...(updateKind === 'replace' ? { replaceContractId } : {})
      }
    });
  };

  const bindingUnavailableMessage = !isContractDapp
    ? 'Contract changes are only available for contract-backed DApps.'
    : isRemixVmDapp
      ? 'Contract changes for Remix VM DApps are not included in this version.'
      : currentEnvironment && !environmentMatches
        ? `Switch Deploy & Run to the DApp network (chain ${primary?.chainId}) to add or replace a contract.`
        : candidateError || '';

  return (
    <Modal show={show} onHide={onCancel} centered data-id="quickDappUpdateModal">
      <Modal.Header closeButton>
        <Modal.Title>Update DApp</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>What would you like to change?</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the UI or contract feature to update."
            data-id="quickDappUpdateDescription"
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Contract change</Form.Label>
          <Form.Select
            value={updateKind}
            onChange={(event) => {
              setUpdateKind(event.target.value as UpdateKind);
              setCandidateAddress('');
            }}
            data-id="quickDappUpdateKind"
          >
            <option value="source">No contract changes</option>
            <option value="add" disabled={!canChangeBindings || bindings.length >= 8}>Add a deployed contract</option>
            <option value="replace" disabled={!canChangeBindings}>Replace a contract</option>
          </Form.Select>
        </Form.Group>

        {bindingUnavailableMessage && (
          <Alert variant="info" className="small py-2">
            {bindingUnavailableMessage}
          </Alert>
        )}

        {bindings.length >= 8 && isContractDapp && (
          <Alert variant="warning" className="small py-2">
            This DApp already uses the maximum of 8 contracts. You can replace a contract, but cannot add another.
          </Alert>
        )}

        {updateKind === 'replace' && (
          <Form.Group className="mb-3">
            <Form.Label>Contract to replace</Form.Label>
            <Form.Select
              value={replaceContractId}
              onChange={(event) => setReplaceContractId(event.target.value)}
              data-id="quickDappReplaceContract"
            >
              {bindings.map((binding) => (
                <option key={binding.id} value={binding.id}>
                  {binding.alias} · {shortenAddress(binding.address)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        )}

        {updateKind !== 'source' && (
          <Form.Group>
            <Form.Label>{updateKind === 'add' ? 'Contract to add' : 'Replacement contract'}</Form.Label>
            {loadingCandidates ? (
              <div className="d-flex align-items-center gap-2 text-secondary small py-2">
                <Spinner animation="border" size="sm" /> Loading deployed contracts...
              </div>
            ) : (
              <Form.Select
                value={candidateAddress}
                onChange={(event) => setCandidateAddress(event.target.value)}
                data-id="quickDappUpdateCandidate"
              >
                <option value="">Select a deployed contract</option>
                {availableCandidates.map((candidate) => (
                  <option key={candidateKey(candidate)} value={candidateKey(candidate)}>
                    {candidate.name || 'Contract'} · {shortenAddress(candidate.address)}
                  </option>
                ))}
              </Form.Select>
            )}
            {!loadingCandidates && availableCandidates.length === 0 && (
              <div className="small text-secondary mt-2">
                No other deployed contracts are available in the current environment.
              </div>
            )}
            <div className="small text-secondary mt-2">
              The selected contract must be deployed on chain {primary?.chainId || 'unknown'} with a valid ABI and bytecode.
            </div>
          </Form.Group>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!canSubmit} data-id="quickDappUpdateContinue">
          Continue with AI
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
