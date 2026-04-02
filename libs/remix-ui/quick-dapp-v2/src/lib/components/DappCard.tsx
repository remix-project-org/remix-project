import React, { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { DappConfig, GenerationProgress } from '../types';

interface DappCardProps {
  dapp: DappConfig;
  isProcessing?: boolean;
  generationProgress?: GenerationProgress;
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

const DappCard: React.FC<DappCardProps> = ({ dapp, isProcessing, generationProgress, onClick, onDelete }) => {
  const [isHovered, setIsHovered] = useState(false);
  const statusColor = dapp.status === 'deployed' ? 'text-success' : 'text-warning';
  const statusIcon = dapp.status === 'deployed' ? 'fa-check-circle' : 'fa-pen-square';

  const loadingText = dapp.status === 'creating' ? 'AI Creating...' : 'AI Updating...';
  const progress = generationProgress;
  const generatedFiles = progress?.generatedFiles || [];
  const currentFile = progress?.filename;

  const statusText = progress?.status === 'generating_file' && currentFile
    ? `Generating ${currentFile}...`
    : progress?.status === 'validating'
      ? 'Validating...'
      : progress?.status === 'parsing'
        ? 'Parsing files...'
        : progress?.status === 'calling_llm'
          ? 'Calling AI model...'
          : progress?.status === 'preparing'
            ? 'Preparing...'
            : loadingText;

  return (
    <div className="col-12 col-md-6 col-xl-4 mb-4 qd-card-col">
      <div
        className="card h-full border-secondary shadow-sm"
        data-id={`dapp-card-${dapp.slug}`}
        style={{
          cursor: isProcessing ? 'wait' : 'pointer',
          transition: 'transform 0.2s',
          overflow: 'visible'
        }}
        onClick={isProcessing ? undefined : onClick}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
      >
        {isProcessing && (
          <div className="absolute w-full h-full flex flex-col items-center justify-center bg-white bg-opacity-75"
            style={{ zIndex: 10, backdropFilter: 'blur(1px)' }}>
            <div className="spinner-border text-primary mb-2" role="status"></div>
            <span className="text-primary font-bold small">{statusText}</span>
            {generatedFiles.length > 0 && (
              <div className="text-start mt-1 qd-progress-log">
                {generatedFiles.map((f) => (
                  <div key={f} className="qd-progress-log__done">{f}</div>
                ))}
                {progress?.status === 'generating_file' && currentFile && !generatedFiles.includes(currentFile) && (
                  <div className="qd-progress-log__write">{currentFile}</div>
                )}
              </div>
            )}
          </div>
        )}
        <div
          className="card-img-top flex items-center justify-center relative"
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

          <div className="absolute top-0 start-0 m-2 badge bg-primary opacity-75" data-id={`dapp-network-${dapp.slug}`}>
            {dapp.contract.networkName || 'Remix VM'}
          </div>

          {!isProcessing && (
            <div
              className="absolute top-0 end-0 m-2"
              data-id={`delete-dapp-btn-${dapp.slug}`}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              title="Delete DApp and workspace"
            >
              <div
                className={`rounded-full flex items-center justify-center shadow-sm ${isHovered ? 'bg-danger' : 'bg-dark bg-opacity-75'
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
          )}
        </div>

        <div className="card-body flex flex-col justify-between">
          <div>
            <h6 className="card-title font-bold mb-1 truncate text-body" data-id={`dapp-card-name-${dapp.slug}`}>{dapp.name}</h6>
            <small className="text-gray-500 dark:text-gray-400 block truncate" style={{ fontSize: '0.8rem' }}>
              {dapp.id}
            </small>
            {dapp.workspaceName && (
              <small className="text-info block truncate mb-2" style={{ fontSize: '0.75rem' }}>
                <i className="fas fa-folder-open mr-1"></i>
                {dapp.workspaceName}
              </small>
            )}
          </div>

          <div className="flex justify-between items-end mt-2 border-t border-secondary pt-2">
            <small className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.75rem' }}>
              {dapp.deployment?.ensDomain || 'Not linked to ENS'}
            </small>
            <div className={`flex items-center ${statusColor}`} data-id={`dapp-status-${dapp.slug}`}>
              <i className={`fas ${statusIcon} mr-1 small`}></i>
              <small className="font-bold uppercase" style={{ fontSize: '0.75rem' }}>
                {dapp.status}
              </small>
            </div>
          </div>

          <div className="text-right mt-1">
            <small className="text-gray-500 dark:text-gray-400" style={{ fontSize: '0.7rem' }}>
              {dapp.status === 'deployed' ? 'Deployed' : 'Created'} {timeAgo(dapp.createdAt)}
            </small>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DappCard;