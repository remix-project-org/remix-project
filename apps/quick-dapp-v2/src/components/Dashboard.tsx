import React, { useState, useMemo } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { DappConfig } from '../types/dapp';
import DappCard from './DappCard';

interface DashboardProps {
  dapps: DappConfig[];
  processingState?: Record<string, boolean>;
  onOpen: (dapp: DappConfig) => void | Promise<void>;
  onCreateNew: () => void;
  onDeleteAll?: () => void;
  onDeleteOne?: (slug: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  dapps,
  processingState = {},
  onOpen,
  onCreateNew,
  onDeleteAll,
  onDeleteOne
}) => {
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [dappToDelete, setDappToDelete] = useState<string | null>(null);

  const [selectedNetwork, setSelectedNetwork] = useState<string>('All Chains');
  const [sortOrder, setSortOrder] = useState<string>('newest');

  const validDapps = useMemo(() => {
    return dapps.filter((dapp: any) => dapp.config?.status !== 'creating');
  }, [dapps]);

  const availableNetworks = useMemo(() => {
    const networks = new Set<string>();
    validDapps.forEach(dapp => {
      if (dapp.contract.networkName) {
        networks.add(dapp.contract.networkName);
      } else {
        networks.add('Unknown Network');
      }
    });
    return Array.from(networks).sort();
  }, [validDapps]);

  const filteredAndSortedDapps = useMemo(() => {
    let result = [...validDapps];

    if (selectedNetwork !== 'All Chains') {
      result = result.filter(dapp =>
        (dapp.contract.networkName || 'Unknown Network') === selectedNetwork
      );
    }

    result.sort((a, b) => {
      const dateA = a.createdAt || 0;
      const dateB = b.createdAt || 0;

      if (sortOrder === 'newest') {
        return dateB - dateA;
      } else {
        return dateA - dateB;
      }
    });

    return result;
  }, [validDapps, selectedNetwork, sortOrder]);

  const confirmDeleteOne = () => {
    if (dappToDelete && onDeleteOne) {
      onDeleteOne(dappToDelete);
    }
    setDappToDelete(null);
  };

  return (
    <div className="container-fluid p-4" style={{ minHeight: '100vh' }}>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4">
        <div>
          <h3 className="fw-bold mb-1 text-body">Quick Dapp</h3>
          <p className="text-secondary mb-0">Edit and deploy your dapps.</p>
        </div>
        <div className="d-flex gap-2 mt-3 mt-md-0">
          <Button variant="primary" onClick={onCreateNew}>
            <i className="fas fa-plus me-2"></i> Create a new dapp
          </Button>
          {validDapps.length > 0 && (
            <Button variant="outline-danger" onClick={() => setShowDeleteAllModal(true)}>
              <i className="fas fa-trash me-2"></i> Delete all dapps
            </Button>
          )}
        </div>
      </div>

      <div className="rounded p-3 mb-4 d-flex flex-column flex-sm-row justify-content-between align-items-center border">
        <h5 className="mb-2 mb-sm-0 text-body">
          Your dapps <span className="badge bg-secondary ms-2">{filteredAndSortedDapps.length}</span>
          {filteredAndSortedDapps.length !== validDapps.length && (
            <small className="text-muted ms-2" style={{ fontSize: '0.8rem' }}>
              (filtered from {validDapps.length})
            </small>
          )}
        </h5>

        <div className="d-flex gap-2">
          <Form.Select
            size="sm"
            className="border-secondary"
            style={{ width: 'auto' }}
            value={selectedNetwork}
            onChange={(e) => setSelectedNetwork(e.target.value)}
          >
            <option value="All Chains">All Chains</option>
            {availableNetworks.map(network => (
              <option key={network} value={network}>{network}</option>
            ))}
          </Form.Select>

          <Form.Select
            size="sm"
            className="border-secondary"
            style={{ width: 'auto' }}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </Form.Select>
        </div>
      </div>

      <div className="row">
        {filteredAndSortedDapps.length === 0 ? (
          <div className="col-12 text-center py-5">
            <div className="text-muted">
              <i className="fas fa-box-open fa-3x mb-3"></i>
              <h5>No dapps found</h5>
              {validDapps.length > 0 ? (
                <p>Try changing the filters.</p>
              ) : (
                <p>Create your first dapp to get started!</p>
              )}
            </div>
          </div>
        ) : (
          filteredAndSortedDapps.map((dapp) => (
            <DappCard
              key={dapp.id}
              dapp={dapp}
              isProcessing={!!processingState[dapp.slug]}
              onClick={() => onOpen(dapp)}
              onDelete={() => setDappToDelete(dapp.slug)}
            />
          ))
        )}
      </div>

      <Modal show={!!dappToDelete} onHide={() => setDappToDelete(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete Dapp?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete this dapp? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setDappToDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDeleteOne}>
            Yes, Delete
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showDeleteAllModal} onHide={() => setShowDeleteAllModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete All Dapps?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete all your dapps? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteAllModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => {
            if (onDeleteAll) onDeleteAll();
            setShowDeleteAllModal(false);
          }}>
            Yes, Delete All
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Dashboard;