import React, { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { DappConfig } from '../types/dapp';

interface DappCardProps {
  dapp: DappConfig;
  onClick: () => void;
  onDelete: () => void;
}

const timeAgo = (date: number) => {
  const seconds = Math.floor((new Date().getTime() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " mins ago";
  return Math.floor(seconds) + " seconds ago";
};

const DappCard: React.FC<DappCardProps> = ({ dapp, onClick, onDelete }) => {
  const [isHovered, setIsHovered] = useState(false);
  const statusColor = dapp.status === 'deployed' ? 'text-success' : 'text-warning';
  const statusIcon = dapp.status === 'deployed' ? 'fa-check-circle' : 'fa-pen-square';

  return (
    <div className="col-12 col-md-6 col-xl-4 mb-4">
      <div 
        className="card h-100 border-secondary shadow-sm" 
        style={{ 
          cursor: 'pointer', 
          transition: 'transform 0.2s',
          overflow: 'visible' 
        }}
        onClick={onClick}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
      >
        <div 
          className="card-img-top d-flex align-items-center justify-content-center position-relative"
          style={{ 
            height: '160px', 
            background: dapp.thumbnailPath 
              ? `url(${dapp.thumbnailPath}) center/cover` 
              : 'linear-gradient(45deg, #2c3e50, #4ca1af)',
            borderBottom: '1px solid #444'
          }}
        >
          {!dapp.thumbnailPath && dapp.config.logo && (
             <img src={dapp.config.logo} alt="logo" style={{ width: '50px', height: '50px', borderRadius: '50%' }} />
          )}
          
          <div className="position-absolute top-0 start-0 m-2 badge bg-primary opacity-75">
            {dapp.contract.networkName || 'Remix VM'}
          </div>

          <div 
            className="position-absolute top-0 end-0 m-2" 
            onClick={(e) => {
              e.stopPropagation(); 
              onDelete(); 
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title="Delete Dapp"
          >
            <div 
              className={`rounded-circle d-flex align-items-center justify-content-center shadow-sm ${
                isHovered ? 'bg-danger' : 'bg-dark bg-opacity-75'
              }`}
              style={{ 
                width: '32px', 
                height: '32px',
                transition: 'background-color 0.2s ease-in-out'
              }}
            >
              <i className="fas fa-trash text-white" style={{ fontSize: '0.9rem' }}></i>
            </div>
          </div>
        </div>

        <div className="card-body d-flex flex-column justify-content-between">
          <div>
            <h6 className="card-title fw-bold mb-1 text-truncate text-body">{dapp.name}</h6>
            <small className="text-muted d-block text-truncate mb-3" style={{ fontSize: '0.8rem' }}>
              {dapp.id}
            </small>
          </div>

          <div className="d-flex justify-content-between align-items-end mt-2 border-top border-secondary pt-2">
            <small className="text-muted" style={{ fontSize: '0.75rem' }}>
              {dapp.deployment?.ensDomain || 'Not linked to ENS'}
            </small>
            <div className={`d-flex align-items-center ${statusColor}`}>
              <i className={`fas ${statusIcon} me-1 small`}></i>
              <small className="fw-bold text-uppercase" style={{ fontSize: '0.75rem' }}>
                {dapp.status}
              </small>
            </div>
          </div>
          
          <div className="text-end mt-1">
             <small className="text-muted" style={{ fontSize: '0.7rem' }}>
               {dapp.status === 'deployed' ? 'Deployed' : 'Created'} {timeAgo(dapp.createdAt)}
             </small>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DappCard;