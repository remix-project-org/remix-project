import React, { useState, useRef, useEffect } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'

export const AIRequestForm = ({
  onMount
}: {
  onMount: (getValues: () => Promise<any>) => void
}) => {
  const intl = useIntl()
  const [mode, setMode] = useState<'text' | 'figma'>('text');

  // Text Mode State
  const [description, setDescription] = useState("");
  const [isBaseMiniApp, setIsBaseMiniApp] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Figma Mode State
  const [figmaUrl, setFigmaUrl] = useState("");
  const [figmaToken, setFigmaToken] = useState("");
  const [isTokenLocked, setIsTokenLocked] = useState(false);

  // Load Token from LocalStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('quickdapp-figma-token');
    if (storedToken) {
      setFigmaToken(storedToken);
      setIsTokenLocked(true);
    }
  }, []);

  // Save Token to LocalStorage on change
  const handleTokenChange = (val: string) => {
    setFigmaToken(val);
    localStorage.setItem('quickdapp-figma-token', val);
  };

  const handleDeleteToken = () => {
    setFigmaToken("");
    localStorage.removeItem('quickdapp-figma-token');
    setIsTokenLocked(false);
  };

  // Expose values to parent
  useEffect(() => {
    onMount(async () => {
      // Common return structure
      if (mode === 'figma') {
        return {
          mode: 'figma',
          figmaUrl,
          figmaToken,
          // Use user instructions as description for context
          text: description,
          isBaseMiniApp: isBaseMiniApp
        };
      } else {
        return {
          mode: 'text',
          text: description,
          isBaseMiniApp,
          image: previewUrl || undefined
        };
      }
    });
  }, [onMount, mode, description, isBaseMiniApp, previewUrl, figmaUrl, figmaToken]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError("");

    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setFileError(intl.formatMessage({ id: 'udapp.aiFileTooLarge' }));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="p-3">
      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            className={`nav-link ${mode === 'text' ? 'active' : ''}`}
            onClick={() => setMode('text')}
          >
            <i className="fas fa-magic me-2"></i><FormattedMessage id="udapp.aiTextImageTab" />
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${mode === 'figma' ? 'active' : ''}`}
            onClick={() => setMode('figma')}
          >
            <i className="fab fa-figma me-2"></i><FormattedMessage id="udapp.aiFigmaTab" />
          </button>
        </li>
      </ul>

      {/* TEXT MODE UI */}
      {mode === 'text' && (
        <div className="fade-in">
          <div className="mb-3">
            <span><FormattedMessage id="udapp.aiDescribeDesign" /></span>
          </div>

          <textarea
            className="form-control mb-3"
            rows={4}
            placeholder='E.g: "The website should have a dark theme..."'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          ></textarea>

          <div className="mb-3">
            <div className="d-flex align-items-center gap-2">
              <input
                type="file"
                id="ai-image-input"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              <button
                className="btn btn-secondary btn-sm d-flex align-items-center gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <i className="fas fa-image"></i>
                {previewUrl ? intl.formatMessage({ id: 'udapp.aiChangeImage' }) : intl.formatMessage({ id: 'udapp.aiUploadReferenceImage' })}
              </button>

              <span className="text-muted small ms-2"><FormattedMessage id="udapp.aiOptionalLabel" /></span>
            </div>

            {fileError && <div className="text-danger small mt-1">{fileError}</div>}

            {previewUrl && (
              <div className="mt-2 position-relative d-inline-block border rounded overflow-hidden">
                <img
                  src={previewUrl}
                  alt={intl.formatMessage({ id: 'udapp.aiImagePreviewAlt' })}
                  style={{ height: '80px', width: 'auto', display: 'block' }}
                />
                <button
                  onClick={handleRemoveImage}
                  className="position-absolute top-0 end-0 btn btn-danger btn-sm p-0 d-flex align-items-center justify-content-center"
                  style={{ width: '20px', height: '20px', borderRadius: '0 0 0 4px' }}
                  title={intl.formatMessage({ id: 'udapp.aiRemoveImage' })}
                >
                  &times;
                </button>
              </div>
            )}
          </div>

          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="base-miniapp-checkbox"
              checked={isBaseMiniApp}
              onChange={(e) => setIsBaseMiniApp(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="base-miniapp-checkbox">
              <FormattedMessage id="udapp.aiCreateBaseMiniApp" />
            </label>
          </div>
        </div>
      )}

      {/* FIGMA MODE UI */}
      {mode === 'figma' && (
        <div className="fade-in">
          <div className="alert alert-info py-2 small">
            <i className="fas fa-info-circle me-1"></i>
            <FormattedMessage id="udapp.aiFigmaPasteLink" />
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold"><FormattedMessage id="udapp.aiFigmaFileUrl" /></label>
            <input
              type="text"
              className="form-control"
              placeholder="https://www.figma.com/design/.../?node-id=1:2"
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
            />
            <div className="form-text text-muted" style={{ fontSize: '0.75rem' }}>
              <FormattedMessage id="udapp.aiFigmaMustContainNodeId" /> <code>?node-id=...</code>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold"><FormattedMessage id="udapp.aiFigmaPersonalAccessToken" /></label>
            <div className="input-group">
              <input
                type="password"
                className="form-control"
                placeholder="figd_..."
                value={figmaToken}
                onChange={(e) => handleTokenChange(e.target.value)}
                disabled={isTokenLocked}
              />
              {isTokenLocked && figmaToken ? (
                <>
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setIsTokenLocked(false)}
                    title={intl.formatMessage({ id: 'udapp.aiEditToken' })}
                  >
                    <i className="fas fa-pen"></i>
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={handleDeleteToken}
                    title={intl.formatMessage({ id: 'udapp.aiDeleteToken' })}
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </>
              ) : (
                figmaToken && (
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setIsTokenLocked(true)}
                    title={intl.formatMessage({ id: 'udapp.aiSaveAndLock' })}
                  >
                    <i className="fas fa-check"></i>
                  </button>
                )
              )}
            </div>
            <div className="form-text text-muted" style={{ fontSize: '0.75rem' }}>
              <FormattedMessage id="udapp.aiFigmaSavedLocally" />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold"><FormattedMessage id="udapp.aiFigmaAdditionalInstructions" /></label>
            <textarea
              className="form-control"
              rows={2}
              placeholder='E.g: "Make sure buttons are responsive..."'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            ></textarea>
          </div>
          <div className="form-check mt-3 border-top pt-3">
            <input
              className="form-check-input"
              type="checkbox"
              id="base-miniapp-checkbox-figma"
              checked={isBaseMiniApp}
              onChange={(e) => setIsBaseMiniApp(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="base-miniapp-checkbox-figma">
              <FormattedMessage id="udapp.aiCreateBaseMiniApp" />
            </label>
            <div className="form-text text-muted" style={{ fontSize: '0.75rem' }}>
              <FormattedMessage id="udapp.aiFigmaIncludesFarcaster" />
            </div>
          </div>
        </div>
      )}

      <div className="mt-2 text-muted small"><FormattedMessage id="udapp.aiMightTakeMinutes" /></div>
    </div>
  );
};
