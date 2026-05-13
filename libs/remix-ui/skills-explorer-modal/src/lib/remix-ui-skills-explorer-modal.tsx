import React, { useState, useEffect, useRef } from 'react'
import JSZip from 'jszip'
import './remix-ui-skills-explorer-modal.css'

type ModalTab = 'browse' | 'upload'
type UploadStep = 'select' | 'preview' | 'uploading'

interface ParsedSkillFile {
  folderName: string
  files: Record<string, string>
  hasSkillMd: boolean
  sourceFileName: string
}

/**
 * Parse the `name` field from a SKILL.md YAML frontmatter block.
 * Convention: SKILL.md starts with ---\nname: <skill-name>\ndescription: ...\n---
 * The name value is used as the parent directory name under .skills/
 */
function parseSkillNameFromContent(content: string): string | null {
  const match = content.match(/^---[\s\S]*?^name:\s*([^\n]+)/m)
  if (!match) return null
  return match[1].trim()
}

/**
 * Validate file extension
 */
function getFileType(filename: string): 'md' | 'zip' | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.md')) return 'md'
  if (lower.endsWith('.zip') || lower.endsWith('.skill')) return 'zip'
  return null
}

// Resolve the skills endpoint — works in both local dev and production
function getSkillsBaseUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { endpointUrls } = require('@remix-endpoints-helper')
    const proxy = endpointUrls?.mcpCorsProxy
    // In local dev, mcpCorsProxy is 'mcp' (relative), which won't work for
    // an external skills server. Fall back to the direct endpoint.
    if (proxy && proxy.startsWith('http')) {
      return proxy + '/ethskills'
    }
  } catch (_) { /* ignore */ }
  // Fallback: direct ethskills server
  return 'https://mcp.api.remix.live/ethskills'
}

export interface SkillInfo {
  id: string
  name: string
  description: string
}

export interface SkillData {
  id: string
  name: string
  description: string
  content: string
  resources: Record<string, string>
}

export interface RemixUiSkillsExplorerModalProps {
  isOpen: boolean
  onClose: () => void
  plugin?: any // Plugin instance to access fileManager
}

export function RemixUiSkillsExplorerModal(props: RemixUiSkillsExplorerModalProps) {
  const { isOpen, onClose, plugin } = props
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [wizardStep, setWizardStep] = useState<'skills' | 'confirm' | 'downloading'>('skills')
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<boolean>(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Upload feature state
  const [activeTab, setActiveTab] = useState<ModalTab>('browse')
  const [uploadStep, setUploadStep] = useState<UploadStep>('select')
  const [isDragOver, setIsDragOver] = useState<boolean>(false)
  const [parsedSkill, setParsedSkill] = useState<ParsedSkillFile | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchSkillsList = async (url: string): Promise<SkillInfo[]> => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    if (!Array.isArray(data.skills)) {
      throw new Error('Invalid skills list format - expected array of skills')
    }
    const skills: SkillInfo[] = []
    for (const skill of data.skills) {
      if (!skill.id || !skill.name) {
        console.warn(`[SkillsExplorer] Skipping invalid skill:`, skill)
        continue
      }
      const description = skill.description?.startsWith('>') ? skill.description.slice(1) : skill.description || ''
      skills.push({ id: skill.id, name: skill.name, description })
    }
    return skills
  }

  const fetchSkillData = async (url: string): Promise<SkillData> => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    if (!data.id || !data.name || !data.content || !data.resources) {
      throw new Error('Invalid skill data format - missing required fields')
    }
    return {
      id: data.id,
      name: data.name,
      description: data.description || '',
      content: data.content,
      resources: data.resources || {}
    }
  }

  const ensureDirectoryExists = async (dirPath: string) => {
    try {
      await plugin.call('fileManager', 'mkdir', dirPath)
    } catch (e) {
      // Directory may already exist
    }
  }

  // Parse uploaded file (either .md or .zip/.skill)
  const parseUploadedFile = async (file: File): Promise<ParsedSkillFile> => {
    const fileType = getFileType(file.name)
    if (!fileType) {
      throw new Error('Invalid file type. Please upload a .md, .zip, or .skill file.')
    }
    const files: Record<string, string> = {}

    if (fileType === 'md') {
      // Single .md file - treat it as SKILL.md
      const content = await file.text()
      const nameFromFrontmatter = parseSkillNameFromContent(content)
      if (!nameFromFrontmatter) {
        throw new Error(
          `"${file.name}" is not a valid SKILL.md — missing required frontmatter.\n` +
          `Expected format:\n---\nname: skill-name\ndescription: skill description\n---`
        )
      }
      files['SKILL.md'] = content
      return {
        folderName: nameFromFrontmatter,
        files,
        hasSkillMd: true,
        sourceFileName: file.name
      }
    }

    // Handle .zip or .skill file
    const zip = await JSZip.loadAsync(file)
    let hasSkillMd = false
    let skillMdContent = ''

    for (const [path, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue

      // Get the filename without directory prefix
      const filename = path.split('/').pop() || path

      // Skip hidden files and system files
      if (filename.startsWith('.') || filename.startsWith('__')) continue

      const content = await zipEntry.async('string')
      files[filename] = content

      if (filename.toUpperCase() === 'SKILL.MD') {
        hasSkillMd = true
        skillMdContent = content
      }
    }

    if (!hasSkillMd) {
      throw new Error('The uploaded archive must contain a SKILL.md file.')
    }

    const nameFromFrontmatter = parseSkillNameFromContent(skillMdContent)
    if (!nameFromFrontmatter) {
      throw new Error(
        `The SKILL.md inside "${file.name}" is missing required frontmatter.\n` +
        `Expected format:\n---\nname: skill-name\ndescription: skill description\n---`
      )
    }

    return {
      folderName: nameFromFrontmatter,
      files,
      hasSkillMd,
      sourceFileName: file.name
    }
  }

  // Handle file selection
  const handleFileSelect = async (file: File) => {
    setUploadError(null)
    setParsedSkill(null)

    try {
      const parsed = await parseUploadedFile(file)
      setParsedSkill(parsed)
      setUploadStep('preview')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to parse file')
    }
  }

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      await handleFileSelect(files[0])
    }
  }

  // Handle file input change
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      await handleFileSelect(files[0])
    }
    // Reset input value so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Save uploaded skill to workspace
  const handleUploadConfirm = async () => {
    if (!plugin || !parsedSkill) {
      setUploadError('Plugin not available or no skill data')
      return
    }

    setUploadStep('uploading')
    setUploading(true)

    try {
      const skillDir = `.skills/${parsedSkill.folderName}`
      await ensureDirectoryExists('.skills')
      await ensureDirectoryExists(skillDir)

      for (const [filename, content] of Object.entries(parsedSkill.files)) {
        await plugin.call('fileManager', 'writeFile', `${skillDir}/${filename}`, content)
      }

      setUploading(false)
      onClose()
    } catch (err) {
      setUploading(false)
      setUploadError(err instanceof Error ? err.message : 'Failed to save skill')
      setUploadStep('preview')
    }
  }

  // Reset upload state
  const resetUpload = () => {
    setUploadStep('select')
    setParsedSkill(null)
    setUploadError(null)
    setUploading(false)
  }

  useEffect(() => {
    if (isOpen) {
      // Reset browse state
      setWizardStep('skills')
      setSelectedSkills(new Set())
      setSearchTerm('')
      setError(null)
      // Reset upload state
      setActiveTab('browse')
      resetUpload()

      const load = async () => {
        setLoading(true)
        try {
          const url = getSkillsBaseUrl() + '/skills'
          const list = await fetchSkillsList(url)
          setSkills(list)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load skills')
        } finally {
          setLoading(false)
        }
      }
      load()
    }
  }, [isOpen])

  const filteredSkills = skills.filter(skill =>
    skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleSkill = (id: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleLoadSelected = () => {
    if (selectedSkills.size === 0) return
    setWizardStep('confirm')
  }

  const handleConfirmSkills = async () => {
    if (!plugin) {
      setError('Plugin not available')
      return
    }
    setWizardStep('downloading')
    setDownloading(true)
    const errors: string[] = []

    for (const skillId of selectedSkills) {
      try {
        const url = getSkillsBaseUrl() + `/skills/${skillId}`
        const skillData = await fetchSkillData(url)
        // Use the name from SKILL.md frontmatter as the directory name per convention.
        // e.g. "---\nname: my-skill\n---" → .skills/my-skill/
        const dirName = parseSkillNameFromContent(skillData.content)
        if (!dirName) {
          errors.push(`${skillId}: SKILL.md is not in the correct format. Expected YAML frontmatter with a 'name' field (---\nname: skill-name\ndescription: ...\n---)`)
          continue
        }
        const skillDir = `.skills/${dirName}`
        await ensureDirectoryExists(skillDir)
        await plugin.call('fileManager', 'writeFile', `${skillDir}/SKILL.md`, skillData.content)
        for (const [filename, content] of Object.entries(skillData.resources)) {
          await plugin.call('fileManager', 'writeFile', `${skillDir}/${filename}`, content)
        }
      } catch (err) {
        errors.push(`${skillId}: ${err instanceof Error ? err.message : 'Failed'}`)
      }
    }

    setDownloading(false)
    if (errors.length > 0) {
      setError(errors.join('\n'))
      setWizardStep('confirm')
    } else {
      onClose()
    }
  }

  const handleBack = () => {
    setWizardStep('skills')
    setError(null)
  }

  if (!isOpen) return null

  const selectedSkillInfos = skills.filter(s => selectedSkills.has(s.id))

  // Determine if we're in a sub-step that needs a back button
  const showBackButton = (activeTab === 'browse' && wizardStep !== 'skills') ||
                         (activeTab === 'upload' && uploadStep !== 'select')

  const handleBackClick = () => {
    if (activeTab === 'browse') {
      handleBack()
    } else {
      resetUpload()
    }
  }

  const isProcessing = downloading || uploading

  return (
    <section data-id="skills-explorer-modal-react" className="skills-explorer-modal-background" style={{ zIndex: 8888 }}>
      <div ref={containerRef} className="skills-explorer-modal-container border bg-dark p-2">

        {/* Header */}
        <div className="skills-explorer-modal-close-container bg-dark mb-3 w-100 d-flex flex-row justify-content-between align-items-center">
          {showBackButton ? (
            <div className="d-flex flex-row gap-2 w-100 mx-1 my-2">
              <button className="btn" onClick={handleBackClick} disabled={isProcessing}>
                <i className="fa-solid fa-arrow-left"></i>
              </button>
              {activeTab === 'browse' && wizardStep === 'confirm' && (
                <span className="text-light align-self-center">
                  Add {selectedSkills.size} Skill{selectedSkills.size !== 1 ? 's' : ''}
                </span>
              )}
              {activeTab === 'browse' && wizardStep === 'downloading' && (
                <span className="text-light align-self-center">Adding Skills...</span>
              )}
              {activeTab === 'upload' && uploadStep === 'preview' && (
                <span className="text-light align-self-center">Review Skill</span>
              )}
              {activeTab === 'upload' && uploadStep === 'uploading' && (
                <span className="text-light align-self-center">Adding Skill...</span>
              )}
            </div>
          ) : (
            <div className="d-flex flex-row gap-2 w-100 mx-3 my-2">
              {activeTab === 'browse' && (
                <input
                  type="text"
                  data-id="skills-explorer-search-input"
                  placeholder="Search skills..."
                  className="form-control skills-explorer-modal-search-input ps-5 fw-light"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              )}
            </div>
          )}
          <button
            data-id="skills-explorer-modal-close-button"
            className="skills-explorer-modal-close-button"
            onClick={onClose}
            disabled={isProcessing}
          >
            <i className="fa-solid fa-xmark text-dark"></i>
          </button>
        </div>

        {/* Tab Navigation - only show when not in a sub-step */}
        {!showBackButton && (
          <div className="skills-explorer-tabs mx-3 mb-3">
            <button
              className={`skills-explorer-tab ${activeTab === 'browse' ? 'active' : ''}`}
              onClick={() => setActiveTab('browse')}
            >
              <i className="fa-solid fa-compass me-2"></i>
              Browse Skills
            </button>
            <button
              className={`skills-explorer-tab ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <i className="fa-solid fa-upload me-2"></i>
              Upload Skill
            </button>
          </div>
        )}

        <div className="skills-explorer-container">

          {/* ===== BROWSE TAB ===== */}
          {activeTab === 'browse' && (
            <>
              {/* Step 1: Select skills */}
              {wizardStep === 'skills' && (
                <>
                  {loading && (
                    <div className="d-flex justify-content-center align-items-center py-5">
                      <div className="spinner-border text-primary" role="status">
                        <span className="visually-hidden">Loading skills...</span>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="alert alert-danger" role="alert">
                      <i className="fa-solid fa-exclamation-triangle me-2"></i>
                      {error}
                    </div>
                  )}

                  {!loading && !error && (
                    <>
                      <div className="category-title">Available Skills ({filteredSkills.length})</div>
                      <div className="category-description mb-4">
                        Select one or more Ethereum development skills to add to your workspace
                      </div>

                      {filteredSkills.length === 0 ? (
                        <div className="text-center py-5 text-muted">
                          <i className="fa-solid fa-search fa-3x mb-3"></i>
                          <div>No skills found matching your search</div>
                        </div>
                      ) : (
                        <div className="d-flex flex-wrap gap-3">
                          {filteredSkills.map((skill) => {
                            const isSelected = selectedSkills.has(skill.id)
                            return (
                              <div
                                key={skill.id}
                                className={`skill-card bg-light border p-3 ${isSelected ? 'border-primary' : ''}`}
                                style={isSelected ? { boxShadow: '0 0 0 2px var(--bs-primary)' } : {}}
                                onClick={() => toggleSkill(skill.id)}
                                data-id={`skill-card-${skill.id}`}
                              >
                                <div className="card-body">
                                  <div className="d-flex justify-content-between align-items-start mb-2">
                                    <h6 className="card-title text-dark mb-0">{skill.name}</h6>
                                    {isSelected && (
                                      <i className="fa-solid fa-circle-check text-primary ms-2 flex-shrink-0"></i>
                                    )}
                                  </div>
                                  <p className="card-description text-muted mb-0">
                                    {skill.description || 'No description available'}
                                  </p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Step 2: Confirm */}
              {wizardStep === 'confirm' && (
                <div className="confirm-skill-step">
                  <div className="d-flex flex-column align-items-center py-5">
                    <i className="fa-solid fa-download fa-3x mb-4 text-primary"></i>
                    <h3 className="mb-3">Add Skills to Workspace</h3>
                    <div className="skill-details mb-4 text-center">
                      {selectedSkillInfos.map(s => (
                        <div key={s.id} className="mb-1">
                          <strong className="text-light">{s.name}</strong>
                          <span className="text-muted ms-2 small">→ .skills/{s.name}/</span>
                        </div>
                      ))}
                    </div>
                    <div className="alert alert-info mb-4">
                      <i className="fa-solid fa-info-circle me-2"></i>
                      {selectedSkills.size === 1
                        ? <span>This will create files in <code>.skills/{selectedSkillInfos[0]?.name || [...selectedSkills][0]}/</code> using the skill's SKILL.md name.</span>
                        : <span>This will create files in <code>.skills/</code> for each selected skill.</span>}
                    </div>
                    {error && (
                      <div className="alert alert-danger mb-3" role="alert">
                        <i className="fa-solid fa-exclamation-triangle me-2"></i>
                        <pre className="mb-0 small">{error}</pre>
                      </div>
                    )}
                    <div className="d-flex gap-3">
                      <button className="btn btn-secondary" onClick={handleBack}>Cancel</button>
                      <button
                        data-id="skills-explorer-confirm-add"
                        className="btn btn-primary"
                        onClick={handleConfirmSkills}
                      >
                        Add Skill{selectedSkills.size !== 1 ? 's' : ''}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Downloading */}
              {wizardStep === 'downloading' && (
                <div className="downloading-skill-step">
                  <div className="d-flex flex-column align-items-center py-5">
                    <div className="spinner-border text-primary fa-3x mb-4" role="status">
                      <span className="visually-hidden">Downloading skills...</span>
                    </div>
                    <h3 className="text-light mb-3">Adding Skills</h3>
                    <p className="text-muted">
                      Downloading and setting up {selectedSkills.size} skill{selectedSkills.size !== 1 ? 's' : ''}...
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ===== UPLOAD TAB ===== */}
          {activeTab === 'upload' && (
            <>
              {/* Upload Step 1: Select file */}
              {uploadStep === 'select' && (
                <div className="upload-skill-step">
                  <div className="category-title">Upload a Skill</div>
                  <div className="category-description mb-4">
                    Add a custom skill to your workspace by uploading a skill file
                  </div>

                  {/* Drag and drop area */}
                  <div
                    className={`upload-dropzone ${isDragOver ? 'drag-over' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    data-id="skills-upload-dropzone"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".md,.zip,.skill"
                      onChange={handleFileInputChange}
                      style={{ display: 'none' }}
                      data-id="skills-upload-input"
                    />
                    <i className="fa-solid fa-cloud-arrow-up fa-3x mb-3 text-muted"></i>
                    <div className="upload-dropzone-text">
                      <span className="text-primary">Click to upload</span> or drag and drop
                    </div>
                    <div className="upload-dropzone-hint text-muted small mt-2">
                      .md, .zip, or .skill files
                    </div>
                  </div>

                  {uploadError && (
                    <div className="alert alert-danger mt-3" role="alert">
                      <i className="fa-solid fa-exclamation-triangle me-2"></i>
                      <pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap' }}>{uploadError}</pre>
                    </div>
                  )}

                  {/* File requirements info */}
                  <div className="upload-requirements mt-4">
                    <div className="requirements-title text-muted mb-2">
                      <i className="fa-solid fa-info-circle me-2"></i>
                      File Requirements
                    </div>
                    <ul className="requirements-list small text-muted">
                      <li><strong>.md file:</strong> A markdown file containing the skill instructions (will be saved as SKILL.md)</li>
                      <li><strong>.zip or .skill file:</strong> An archive that must include a SKILL.md file</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Upload Step 2: Preview */}
              {uploadStep === 'preview' && parsedSkill && (
                <div className="upload-preview-step">
                  <div className="d-flex flex-column align-items-center py-4">
                    <i className="fa-solid fa-file-circle-check fa-3x mb-4 text-success"></i>
                    <h3 className="mb-3">Skill Ready to Add</h3>

                    <div className="upload-preview-details mb-4 w-100">
                      <div className="preview-item d-flex justify-content-between py-2 border-bottom">
                        <span className="text-muted">Source File:</span>
                        <span className="text-info">{parsedSkill.sourceFileName}</span>
                      </div>
                      <div className="preview-item d-flex justify-content-between py-2 border-bottom">
                        <span className="text-muted">Skill Folder:</span>
                        <code>.skills/{parsedSkill.folderName}</code>
                      </div>
                      <div className="preview-item d-flex justify-content-between py-2 border-bottom">
                        <span className="text-muted">Files:</span>
                        <span className="text-info">{Object.keys(parsedSkill.files).length} file(s)</span>
                      </div>
                      <div className="preview-files mt-3">
                        <span className="text-muted small">Files to be created:</span>
                        <ul className="files-list small mt-2">
                          {Object.keys(parsedSkill.files).map((filename) => (
                            <li key={filename}>
                              <code>{parsedSkill.folderName}/{filename}</code>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {uploadError && (
                      <div className="alert alert-danger mb-3 w-100" role="alert">
                        <i className="fa-solid fa-exclamation-triangle me-2"></i>
                        <pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap' }}>{uploadError}</pre>
                      </div>
                    )}

                    <div className="d-flex gap-3">
                      <button className="btn btn-secondary" onClick={resetUpload}>Cancel</button>
                      <button
                        data-id="skills-upload-confirm"
                        className="btn btn-primary"
                        onClick={handleUploadConfirm}
                      >
                        <i className="fa-solid fa-plus me-2"></i>
                        Add Skill
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Step 3: Uploading */}
              {uploadStep === 'uploading' && (
                <div className="uploading-skill-step">
                  <div className="d-flex flex-column align-items-center py-5">
                    <div className="spinner-border text-primary fa-3x mb-4" role="status">
                      <span className="visually-hidden">Adding skill...</span>
                    </div>
                    <h3 className="text-light mb-3">Adding Skill</h3>
                    <p className="text-muted">
                      Saving skill files to your workspace...
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Fixed footer - outside scrollable area */}
        {activeTab === 'browse' && wizardStep === 'skills' && !loading && !error && selectedSkills.size > 0 && (
          <div className="skills-explorer-modal-footer">
            <button
              data-id="skills-explorer-load-selected"
              className="btn btn-primary"
              onClick={handleLoadSelected}
            >
              <i className="fa-solid fa-download me-2"></i>
              Load {selectedSkills.size} Selected Skill{selectedSkills.size !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
