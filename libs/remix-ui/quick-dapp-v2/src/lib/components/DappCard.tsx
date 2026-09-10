import React from 'react';
import { Dropdown } from 'react-bootstrap';
import { getPrimaryQuickDappContract, getQuickDappContracts } from '@remix-ui/helper';
import { DappConfig, GenerationProgress } from '../types';
import { getQuickDappPublishLabel, getQuickDappPublishState } from '../utils/publish-state';

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
  const publishState = getQuickDappPublishState(dapp);
  const publishLabel = getQuickDappPublishLabel(dapp);
  const isPublished = publishState !== 'created';
  const hasUnpublishedChanges = publishState === 'published-with-unpublished-changes';
  const statusColor = publishState === 'published' ? 'text-success' : 'text-warning';
  const statusIcon = hasUnpublishedChanges
    ? 'fa-exclamation-triangle'
    : isPublished
      ? 'fa-check-circle'
      : 'fa-pen-square';

  const contractBindings = dapp.appKind === 'graph-only' ? [] : getQuickDappContracts(dapp);
  const primaryContract = getPrimaryQuickDappContract(dapp);
  const contractSummary = contractBindings.map((contract) =>
    `${contract.alias}${contract.id === primaryContract?.id ? ' (primary)' : ''}`
  ).join(', ');
  const contractCountLabel = `${contractBindings.length} contract${contractBindings.length === 1 ? '' : 's'}`;
  const primaryContractLabel = primaryContract?.alias || primaryContract?.name;
  const progress = generationProgress;
  const generatedFiles = progress?.generatedFiles || [];
  const currentFile = progress?.filename;
  const networkLabel = dapp.appKind === 'graph-only'
    ? 'The Graph'
    : dapp.appKind === 'zk-circuit'
      ? 'ZK Circuit'
      : dapp?.contract?.networkName || 'Remix VM';
  const isCreating = dapp.status === 'creating' || (!progress && isProcessing && dapp.status !== 'updating');
  const loadingText = isCreating ? 'AI Creating...' : 'AI Updating...';

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
        className="card h-100 border-secondary shadow-sm"
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
          <div className="position-absolute w-100 h-100 d-flex flex-column align-items-center justify-content-center qd-progress-overlay qd-progress-overlay--card">
            <div className="spinner-border qd-progress-spinner mb-3" role="status"></div>
            <span className="qd-progress-status mb-2">{statusText}</span>
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
          className="card-img-top d-flex align-items-center justify-content-center position-relative"
          style={{
            height: '160px',
            background: dapp.thumbnailPath
              ? `url(${dapp.thumbnailPath}) center/cover`
              : 'linear-gradient(45deg, #2c3e50, #4ca1af)',
            borderBottom: '1px solid #444'
          }}
        >
          {!dapp.thumbnailPath && dapp?.config?.logo && (
            <img src={dapp?.config?.logo} alt={`${dapp.name} logo`} style={{ width: '50px', height: '50px', borderRadius: '50%' }} />
          )}

          <div className="position-absolute top-0 start-0 m-2 badge bg-primary opacity-75" data-id={`dapp-network-${dapp.slug}`}>
            {networkLabel}
          </div>

          {!isProcessing && (
            <Dropdown
              align="end"
              className="position-absolute top-0 end-0 m-2"
              onClick={(event) => event.stopPropagation()}
            >
              <Dropdown.Toggle
                variant="dark"
                size="sm"
                className="qd-card-menu-toggle rounded-circle d-flex align-items-center justify-content-center shadow-sm bg-opacity-75"
                aria-label={`Actions for ${dapp.name}`}
                title="DApp actions"
                data-id={`dapp-actions-btn-${dapp.slug}`}
              >
                <i className="fas fa-ellipsis-v" aria-hidden="true"></i>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item
                  as="button"
                  className="text-danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete();
                  }}
                  data-id={`delete-dapp-btn-${dapp.slug}`}
                >
                  <i className="fas fa-trash me-2" aria-hidden="true"></i>
                  Delete DApp
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          )}
        </div>

        <div className="card-body d-flex flex-column justify-content-between">
          <div>
            <h6 className="card-title fw-bold mb-1 text-truncate text-body" data-id={`dapp-card-name-${dapp.slug}`}>{dapp.name}</h6>
            <small className="text-muted d-block text-truncate" style={{ fontSize: '0.8rem' }}>
              {dapp.slug}
            </small>
            {dapp.workspaceName && (
              <small className="text-info d-block text-truncate mb-2" style={{ fontSize: '0.75rem' }}>
                <i className="fas fa-folder-open me-1" aria-hidden="true"></i>
                {dapp.workspaceName}
              </small>
            )}
            {contractBindings.length > 0 && (
              <small
                className="text-muted d-block text-truncate mb-2"
                style={{ fontSize: '0.75rem' }}
                title={contractSummary}
                data-id={`dapp-contracts-${dapp.slug}`}
              >
                <i className="fas fa-cubes me-1" aria-hidden="true"></i>
                {contractCountLabel}{primaryContractLabel ? ` · Primary: ${primaryContractLabel}` : ''}
              </small>
            )}
          </div>

          <div className={`d-flex align-items-end mt-2 border-top border-secondary pt-2 ${dapp.deployment?.ensDomain ? 'justify-content-between' : 'justify-content-end'}`}>
            {dapp.deployment?.ensDomain && (
              <small className="text-muted text-truncate me-2" style={{ fontSize: '0.75rem' }}>
                {dapp.deployment.ensDomain}
              </small>
            )}
            <div className={`d-flex align-items-center ${statusColor}`} data-id={`dapp-status-${dapp.slug}`}>
              <i className={`fas ${statusIcon} me-1 small`} aria-hidden="true"></i>
              <small className="fw-bold" style={{ fontSize: '0.75rem' }}>
                {publishLabel}
              </small>
            </div>
          </div>

          <div className="text-end mt-1">
            <small className="text-muted" style={{ fontSize: '0.7rem' }}>
              {isPublished ? 'Published' : 'Created'} {timeAgo(isPublished ? dapp.lastDeployedAt || dapp.createdAt : dapp.createdAt)}
            </small>
          </div>

          {!isProcessing && (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary w-100 mt-2"
              onClick={(event) => {
                event.stopPropagation();
                onClick();
              }}
              data-id={`open-dapp-btn-${dapp.slug}`}
            >
              Open DApp <i className="fas fa-arrow-right ms-1" aria-hidden="true"></i>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DappCard;
