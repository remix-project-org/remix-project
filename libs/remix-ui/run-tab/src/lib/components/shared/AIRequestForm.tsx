import React, { useState, useRef, useEffect } from 'react'

export const AIRequestForm = ({
  onMount
}: {
  onMount: (getValues: () => Promise<any>) => void
}) => {
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
        setFileError("File is too large (>10MB).");
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
            <i className="fas fa-magic me-2"></i>Text / Image
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${mode === 'figma' ? 'active' : ''}`}
            onClick={() => setMode('figma')}
          >
            <i className="fab fa-figma me-2"></i>Figma Import
          </button>
        </li>
      </ul>

      {/* TEXT MODE UI */}
      {mode === 'text' && (
        <div className="fade-in">
          <div className="mb-3">
            <span>Please describe how you would want the design to look like.</span>
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
                {previewUrl ? "Change Image" : "Upload Reference Image"}
              </button>

              <span className="text-muted small ms-2">Optional</span>
            </div>

            {fileError && <div className="text-danger small mt-1">{fileError}</div>}

            {previewUrl && (
              <div className="mt-2 position-relative d-inline-block border rounded overflow-hidden">
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{ height: '80px', width: 'auto', display: 'block' }}
                />
                <button
                  onClick={handleRemoveImage}
                  className="position-absolute top-0 end-0 btn btn-danger btn-sm p-0 d-flex align-items-center justify-content-center"
                  style={{ width: '20px', height: '20px', borderRadius: '0 0 0 4px' }}
                  title="Remove image"
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
              Create as Base Mini App (Farcaster Frame)
            </label>
          </div>
        </div>
      )}

      {/* FIGMA MODE UI */}
      {mode === 'figma' && (
        <div className="fade-in">
          <div className="alert alert-info py-2 small">
            <i className="fas fa-info-circle me-1"></i>
            Paste a link to a specific Figma layer
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold">Figma File URL</label>
            <input
              type="text"
              className="form-control"
              placeholder="https://www.figma.com/design/.../?node-id=1:2"
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
            />
            <div className="form-text text-muted" style={{ fontSize: '0.75rem' }}>
              Must contain <code>?node-id=...</code>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold">Personal Access Token</label>
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
                    title="Edit Token"
                  >
                    <i className="fas fa-pen"></i>
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={handleDeleteToken}
                    title="Delete Token"
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
                    title="Save & Lock"
                  >
                    <i className="fas fa-check"></i>
                  </button>
                )
              )}
            </div>
            <div className="form-text text-muted" style={{ fontSize: '0.75rem' }}>
              Saved locally in your browser.
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold">Additional Instructions (Optional)</label>
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
              Create as Base Mini App (Farcaster Frame)
            </label>
            <div className="form-text text-muted" style={{ fontSize: '0.75rem' }}>
              Includes Farcaster SDK and Meta tags automatically.
            </div>
          </div>
        </div>
      )}

      <div className="mt-2 text-muted small">This might take up to 2 minutes.</div>
    </div>
  );
};
