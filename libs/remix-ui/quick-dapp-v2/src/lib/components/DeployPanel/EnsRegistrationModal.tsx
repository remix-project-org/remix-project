import React, { useState } from 'react';
import { Modal, Button, Alert, Spinner } from 'react-bootstrap';
import { ethers } from 'ethers';
import { parseEnsRegistrationError } from '../../utils/ens-utils';

const REMIX_ENDPOINT_ENS = 'https://quickdapp-ens.api.remix.live';

interface EnsRegistrationModalProps {
  show: boolean;
  onHide: () => void;
  ensName: string;
  contentHash: string;
  onSuccess: (result: { txHash: string; domain: string; owner: string }) => void;
}

const EnsRegistrationModal: React.FC<EnsRegistrationModalProps> = ({
  show,
  onHide,
  ensName,
  contentHash,
  onSuccess,
}) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [noWallet, setNoWallet] = useState(false);

  const handleRegister = async () => {
    setError('');
    setNoWallet(false);

    if (typeof window.ethereum === 'undefined') {
      setNoWallet(true);
      return;
    }

    setIsRegistering(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const accounts = await provider.send('eth_requestAccounts', []);
      const ownerAddress = accounts[0];

      const authToken = typeof localStorage !== 'undefined'
        ? localStorage.getItem('remix_access_token')
        : null;

      const response = await fetch(`${REMIX_ENDPOINT_ENS}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          label: ensName.toLowerCase(),
          owner: ownerAddress,
          contentHash,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw { message: data.error, details: data.details };
      }

      onSuccess({ txHash: data.txHash, domain: data.domain, owner: ownerAddress });
    } catch (e: any) {
      setError(parseEnsRegistrationError(e));
    } finally {
      setIsRegistering(false);
    }
  };

  const handleClose = () => {
    if (!isRegistering) {
      setError('');
      setNoWallet(false);
      onHide();
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered backdrop={isRegistering ? 'static' : true}>
      <Modal.Header closeButton={!isRegistering}>
        <Modal.Title className="d-flex align-items-center" style={{ fontSize: '1.1rem' }}>
          <i className="fas fa-link me-2"></i>
          Register ENS Subdomain
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ fontSize: '0.95rem' }}>
        {/* Domain name display */}
        <div className="text-center mb-3 py-2 bg-light border rounded">
          <code className="fw-bold" style={{ fontSize: '1.05rem' }}>
            {ensName}.remixdapp.eth
          </code>
        </div>

        {/* Info section */}
        <div className="mb-3 p-3 border rounded" style={{ backgroundColor: 'var(--secondary)', color: 'var(--text)' }}>
          <div className="fw-bold mb-2" style={{ fontSize: '1rem' }}>
            <i className="fas fa-info-circle me-1"></i> Before you register:
          </div>
          <ul className="mb-0 ps-3" style={{ lineHeight: '2' }}>
            <li>
              The subdomain owner will be your <strong>browser wallet</strong> address
              (MetaMask, Coinbase Wallet, etc.)
            </li>
            <li>
              A different wallet address <strong>cannot</strong> overwrite your registration.
            </li>
            <li>
              Gas is <strong>sponsored by Remix</strong> — no cost to you.
            </li>
          </ul>
        </div>

        {/* Overwrite warning — always visible, emphasized */}
        <Alert variant="warning" className="mb-3 d-flex align-items-start">
          <i className="fas fa-exclamation-triangle me-2 mt-1"></i>
          <div>
            If you already own this name, the previous content hash will be{' '}
            <strong>permanently replaced</strong>. The old link <strong>cannot be recovered</strong>.
          </div>
        </Alert>

        {/* No wallet error */}
        {noWallet && (
          <Alert variant="danger" className="mb-3">
            <i className="fas fa-exclamation-triangle me-2"></i>
            <strong>No Browser Wallet Detected</strong>
            <div className="mt-1">
              ENS registration requires a browser wallet extension such as MetaMask or Coinbase Wallet.
            </div>
          </Alert>
        )}

        {/* Registration error */}
        {error && (
          <Alert variant="danger" className="mb-3">
            <i className="fas fa-times-circle me-2"></i>
            <strong>Registration Failed</strong>
            <div className="mt-1">{error}</div>
          </Alert>
        )}

        {/* Registering state */}
        {isRegistering && (
          <div className="text-center py-2 text-muted">
            <Spinner animation="border" size="sm" className="me-2" />
            Registering on Arbitrum...
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={isRegistering}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleRegister} disabled={isRegistering || noWallet}>
          {isRegistering ? (
            <>
              <Spinner as="span" animation="border" size="sm" className="me-1" />
              Registering...
            </>
          ) : (
            'Register'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default EnsRegistrationModal;
