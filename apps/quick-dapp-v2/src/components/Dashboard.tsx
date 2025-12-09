import React, { useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { DappConfig } from '../types/dapp';
import DappCard from './DappCard';

interface DashboardProps {
  dapps: DappConfig[];
  onOpen: (dapp: DappConfig) => void;
  onCreateNew: () => void;
  onDeleteAll?: () => void;
  onDeleteOne?: (slug: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  dapps, 
  onOpen, 
  onCreateNew, 
  onDeleteAll,
  onDeleteOne 
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  return (
    <div className="container-fluid p-4" style={{ minHeight: '100vh' }}>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4">
        <div>
          <h3 className="fw-bold mb-1">Quick Dapp</h3>
          <p className="text-muted mb-0">Edit and deploy your dapps.</p>
        </div>
        <div className="d-flex gap-2 mt-3 mt-md-0">
          <Button variant="primary" onClick={onCreateNew}>
            <i className="fas fa-plus me-2"></i> Create a new dapp
          </Button>
          {dapps.length > 0 && (
            <Button variant="outline-danger" onClick={() => setShowDeleteModal(true)}>
              <i className="fas fa-trash me-2"></i> Delete all dapps
            </Button>
          )}
        </div>
      </div>

      <div className="bg-dark rounded p-3 mb-4 d-flex flex-column flex-sm-row justify-content-between align-items-center border border-secondary">
        <h5 className="mb-2 mb-sm-0 text-white">
          Your dapps <span className="badge bg-secondary ms-2">{dapps.length}</span>
        </h5>
        
        <div className="d-flex gap-2">
          <Form.Select size="sm" className="bg-dark text-light border-secondary" style={{ width: 'auto' }}>
            <option>All Chains</option>
            <option>Remix VM</option>
            <option>Sepolia</option>
          </Form.Select>
          <Form.Select size="sm" className="bg-dark text-light border-secondary" style={{ width: 'auto' }}>
            <option>Newest first</option>
            <option>Oldest first</option>
          </Form.Select>
        </div>
      </div>

      <div className="row">
        {dapps.length === 0 ? (
          <div className="col-12 text-center py-5">
            <div className="text-muted">
              <i className="fas fa-box-open fa-3x mb-3"></i>
              <h5>No dapps found</h5>
              <p>Create your first dapp to get started!</p>
            </div>
          </div>
        ) : (
          dapps.map((dapp) => (
            <DappCard 
              key={dapp.id} 
              dapp={dapp} 
              onClick={() => onOpen(dapp)}
              onDelete={() => onDeleteOne && onDeleteOne(dapp.slug)}
            />
          ))
        )}
      </div>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton className="bg-dark text-light border-secondary">
          <Modal.Title>Delete All Dapps?</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          Are you sure you want to delete all your dapps? This action cannot be undone.
        </Modal.Body>
        <Modal.Footer className="bg-dark border-secondary">
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => {
            if (onDeleteAll) onDeleteAll();
            setShowDeleteModal(false);
          }}>
            Yes, Delete All
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Dashboard;