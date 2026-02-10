import React from 'react';
import { Card } from 'react-bootstrap';

interface CreateInstanceProps {
  isAiLoading: boolean;
}

const CreateInstance: React.FC<CreateInstanceProps> = ({ isAiLoading }) => {

  if (isAiLoading) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center py-5">
        <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}></div>
        <h5 className="text-primary">Creating Your DApp...</h5>
        <p className="text-muted">RemixAI Assistant is generating your DApp code.</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      <div className="text-center mb-4">
        <h3 className="mb-2">Welcome to Quick DApp</h3>
        <p className="text-muted mb-0">
          Transform your smart contracts into interactive DApps with AI.
        </p>
      </div>

      <Card className="border-info">
        <Card.Header className="bg-info bg-opacity-10 border-info">
          <h5 className="mb-0 text-info">
            <i className="fas fa-rocket me-2"></i>
            Getting Started
          </h5>
        </Card.Header>
        <Card.Body>
          <p className="mb-4">After deploying your contract, create a DApp using one of these options:</p>

          <div className="row g-4">
            <div className="col-12 col-md-6 qd-grid-col">
              <div className="border rounded p-3 h-100">
                <h6 className="text-primary mb-3">
                  <i className="fas fa-flag me-2"></i>
                  Option 1: Start Now Banner
                </h6>
                <p className="small text-muted mb-3">
                  Click the <span className="badge bg-primary">Start now</span> button in the banner above the editor.
                </p>
                <img
                  src='assets/img/start-now-guide.png'
                  alt="Start now guide"
                  className="img-fluid rounded shadow-sm w-100"
                  style={{
                    border: '1px solid var(--secondary)',
                    objectFit: 'contain'
                  }}
                />
              </div>
            </div>

            <div className="col-12 col-md-6 qd-grid-col">
              <div className="border rounded p-3 h-100">
                <h6 className="text-primary mb-3">
                  <i className="fas fa-magic me-2"></i>
                  Option 2: Sparkle Button
                </h6>
                <p className="small text-muted mb-3">
                  Click the Sparkle button on your deployed contract instance.
                </p>
                <img
                  src='assets/img/sparkling.png'
                  alt="Sparkle button guide"
                  className="img-fluid rounded shadow-sm w-100"
                  style={{
                    border: '1px solid var(--secondary)',
                    objectFit: 'contain'
                  }}
                />
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default CreateInstance;