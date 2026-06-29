import React, { useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────

type WorkspaceType = "local" | "cloud";

type CloudAction = "migrate" | "snapshot" | "create";

interface CloudHelpModalProps {
    /** Whether the modal is currently visible. */
    open: boolean;
    /** Called when the user closes the modal. */
    onClose: () => void;
    /** Called when the user clicks an action row. Receives the action key. */
    onAction?: (action: CloudAction) => void;
    /** If true, clicking an action will also close the modal. */
    closeOnAction?: boolean;
    /** Called when the user wants to go back to the feature reel. */
    onShowReel?: () => void;
}

// ─── Keyframes ───────────────────────────────────────────────────

const KEYFRAMES = `
  @keyframes cloudModalIn {
    from { opacity: 0; transform: scale(0.92) translateY(20px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes cloudOverlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes cloudPanelIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes cloudPointerBounce {
    0%, 100% { transform: translateX(0); }
    50% { transform: translateX(3px); }
  }
`;

// ─── Colors ──────────────────────────────────────────────────────

const c = {
  bg: "#1a1a2e",
  s1: "#222240",
  s2: "#2a2a4a",
  cy: "#2fbfb1",
  tx: "#e0e0ec",
  tm: "#8888aa",
  td: "#bfbfcd",
  bl: "#5b9cf5",
  gn: "#6bdb8a",
  am: "#f0a030",
};

// ─── Shared small components ─────────────────────────────────────

const CheckIcon: React.FC = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 5l2 2 4-4" />
  </svg>
);

const CrossIcon: React.FC = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 2l6 6M8 2L2 8" />
  </svg>
);

interface TraitProps {
    positive: boolean;
    color?: string;
    children: React.ReactNode;
}

const Trait: React.FC<TraitProps> = ({ positive, color, children }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11,
      color: positive ? (color ?? c.gn) : c.td,
    }}
  >
    <div style={{ width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {positive ? <CheckIcon /> : <CrossIcon />}
    </div>
    {children}
  </div>
);

interface ActionRowProps {
    icon: React.ReactNode;
    iconBg: string;
    name: string;
    desc: string;
    right?: React.ReactNode;
    onClick?: () => void;
}

const ActionRow: React.FC<ActionRowProps> = ({ icon, iconBg, name, desc, right, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.2s",
        background: hovered ? c.s2 : "transparent",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: iconBg,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: c.tx }}>{name}</div>
        <div style={{ fontSize: 10, color: c.td, lineHeight: 1.4 }}>{desc}</div>
      </div>
      {right ?? (
        <span style={{ color: hovered ? c.tx : c.td, fontSize: 12, transition: "color 0.2s" }}>&rsaquo;</span>
      )}
    </div>
  );
};

const Separator: React.FC = () => (
  <div style={{ height: 0.5, background: "rgba(255,255,255,0.04)", margin: "6px 10px" }} />
);

// ─── Workspace card ──────────────────────────────────────────────

interface WsCardProps {
    type: WorkspaceType;
    picked: boolean;
    onClick: () => void;
}

const WsCard: React.FC<WsCardProps> = ({ type, picked, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const isCloud = type === "cloud";

  const borderColor = picked
    ? isCloud
      ? "rgba(91,156,245,0.4)"
      : "rgba(136,136,170,0.4)"
    : hovered
      ? isCloud
        ? "rgba(91,156,245,0.3)"
        : "rgba(255,255,255,0.15)"
      : isCloud
        ? "rgba(91,156,245,0.15)"
        : "rgba(255,255,255,0.06)";

  const bg = picked
    ? isCloud
      ? "rgba(91,156,245,0.08)"
      : "rgba(136,136,170,0.06)"
    : isCloud
      ? "rgba(91,156,245,0.04)"
      : c.s1;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 12,
        padding: 14,
        cursor: "pointer",
        transition: "all 0.3s",
        background: bg,
        border: `0.5px solid ${borderColor}`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isCloud ? "rgba(91,156,245,0.12)" : "rgba(136,136,170,0.12)",
          }}
        >
          {isCloud ? (
            <i className="fas fa-cloud" style={{ fontSize: 12, color: c.bl }}></i>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={c.tm} strokeWidth="1.5">
              <rect x="2" y="3" width="10" height="8" rx="1.5" />
              <path d="M5 3V2a1 1 0 011-1h2a1 1 0 011 1v1" />
            </svg>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: c.tx }}>{isCloud ? "Cloud" : "Local"}</div>
      </div>

      {/* Description */}
      <div style={{ fontSize: 11, color: c.tm, lineHeight: 1.5, marginBottom: 10 }}>
        {isCloud
          ? "Syncs automatically to the cloud. Access from any device when logged in."
          : "Stored in your browser. Works like Remix always has. Private to this device."}
      </div>

      {/* Traits */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {isCloud ? (
          <>
            <Trait positive color={c.bl}>Auto-syncs every change</Trait>
            <Trait positive color={c.bl}>Access from any device</Trait>
            <Trait positive color={c.bl}>Connected to your account</Trait>
            <Trait positive color={c.bl}>Download snapshots</Trait>
          </>
        ) : (
          <>
            <Trait positive>Works offline</Trait>
            <Trait positive={false}>No sync</Trait>
            <Trait positive={false}>This browser only</Trait>
          </>
        )}
      </div>
    </div>
  );
};

// ─── SVG icons for actions ───────────────────────────────────────

const UploadIcon: React.FC<{ color: string }> = ({ color }) => (
  <i className="fas fa-cloud-upload-alt me-2" style={{ color: 'var(--bs-info)', margin: '9px' }}></i>
);

const DownloadIcon: React.FC<{ color: string }> = ({ color }) => (
  <i className="fas fa-history me-2" style={{ color: color, margin: '9px' }}></i>
);

const CheckCircleIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={color} strokeWidth="1.5">
    <path d="M11 4L5.5 9.5 3 7" />
  </svg>
);

const PlusBoxIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={color} strokeWidth="1.5">
    <rect x="2" y="2" width="10" height="10" rx="2" />
    <path d="M7 5v4M5 7h4" />
  </svg>
);

const SquareIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={color} strokeWidth="1.5">
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
  </svg>
);

const AllFeaturesButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: hovered ? "#fff" : c.cy,
        background: hovered ? c.cy : "rgba(47,191,177,0.1)",
        border: `1px solid ${hovered ? c.cy : "rgba(47,191,177,0.3)"}`,
        padding: "6px 16px",
        borderRadius: 6,
        cursor: "pointer",
        transition: "all 0.2s",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <i className="fas fa-chevron-left" style={{ fontSize: 9 }}></i>
            All features
    </button>
  );
};

// ─── Main component ──────────────────────────────────────────────

const CloudHelpModal: React.FC<CloudHelpModalProps> = ({
  open,
  onClose,
  onAction,
  closeOnAction = false,
  onShowReel,
}) => {
  const [picked, setPicked] = useState<WorkspaceType>("cloud");

  const handleAction = useCallback(
    (action: CloudAction) => {
      onAction?.(action);
      if (closeOnAction) onClose();
    },
    [onAction, closeOnAction, onClose]
  );

  if (!open) return null;

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 9998,
          animation: "cloudOverlayIn 0.3s ease",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          pointerEvents: "none",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            color: c.tx,
            background: c.bg,
            borderRadius: 20,
            border: "0.5px solid rgba(91,156,245,0.15)",
            width: "100%",
            maxWidth: 580,
            maxHeight: "90vh",
            overflowY: "auto",
            animation: "cloudModalIn 0.5s cubic-bezier(0.34,1.56,0.64,1)",
            pointerEvents: "auto",
          }}
        >
          {/* ── Header ── */}
          <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: c.tx, display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
              <i className="fas fa-cloud" style={{ fontSize: 18, color: c.bl }}></i>
                            Cloud Workspaces
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  letterSpacing: 1.5,
                  textTransform: "uppercase" as const,
                  color: c.bl,
                  background: "rgba(91,156,245,0.12)",
                  padding: "3px 10px",
                  borderRadius: 5,
                  border: "0.5px solid rgba(91,156,245,0.25)",
                }}
              >
                                Beta Perk
              </span>
            </h2>
            <CloseButton onClick={onClose} />
          </div>

          {/* ── Subtitle ── */}
          <div style={{ padding: "10px 24px 0", fontSize: 13, color: c.tm, lineHeight: 1.6 }}>
                        Remix now has two kinds of Workspaces. You can use both — they live side-by-side.
          </div>

          {/* ── Dual cards ── */}
          <div style={{ padding: "16px 24px 0" }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: 1.5,
                textTransform: "uppercase" as const,
                color: c.td,
                marginBottom: 10,
              }}
            >
                            Pick one to see what it does
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <WsCard type="local" picked={picked === "local"} onClick={() => setPicked("local")} />
              <WsCard type="cloud" picked={picked === "cloud"} onClick={() => setPicked("cloud")} />
            </div>
          </div>
          {/* ── How to enable ── */}
          <div
            style={{
              margin: "14px 24px 0",
              padding: "14px",
              borderRadius: 12,
              background: c.s1,
              border: "0.5px solid rgba(47,191,177,0.15)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: "rgba(47,191,177,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={c.cy} strokeWidth="1.5">
                  <path d="M5 2v6M2 5l3 3 3-3" />
                </svg>
              </div>
              <div style={{ fontSize: 12, fontWeight: 500, color: c.tx }}>How to enable cloud</div>
            </div>
            <div style={{ fontSize: 11, color: c.tm, lineHeight: 1.5, marginBottom: 12 }}>
                            Use the toggle in the top-left corner of the app, next to the Remix logo:
            </div>
            {/* Mini mockup of the top bar */}
            <div
              style={{
                borderRadius: 8,
                background: c.bg,
                border: "0.5px solid rgba(255,255,255,0.06)",
                padding: "8px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {/* Remix logo placeholder */}
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: "rgba(47,191,177,0.12)",
                  border: "0.5px solid rgba(47,191,177,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={c.cy} strokeWidth="1.5">
                  <path d="M6 2v8M3 5l3-3 3 3" />
                </svg>
              </div>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  fontWeight: 500,
                  color: c.tx,
                }}
              >
                                REMIX
              </span>
              {/* Cloud toggle — the star of the show */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginLeft: "auto",
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: `1.5px solid ${c.cy}`,
                  background: "rgba(47,191,177,0.06)",
                  animation: "cloudPanelIn 0.5s ease",
                }}
              >
                <i className="fas fa-cloud text-success"></i>
                {/* Toggle track */}
                <div
                  style={{
                    width: 26,
                    height: 14,
                    borderRadius: 7,
                    background: c.cy,
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "#fff",
                    }}
                  />
                </div>
              </div>
            </div>
            {/* Pointer label */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginTop: 6,
              }}
            >
              <span
                style={{
                  color: c.cy,
                  fontSize: 14,
                  animation: "cloudPointerBounce 1.5s ease-in-out infinite",
                }}
              >
                                &rarr;
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: c.cy,
                }}
              >
                                This toggle activates Cloud Workspaces
              </span>
            </div>
            <div style={{ fontSize: 10, color: c.td, marginTop: 8, lineHeight: 1.4 }}>
                            When the toggle is on, new Workspaces will be created in the cloud by default.
            </div>
          </div>
          {/* ── Detail panels ── */}
          {picked === "local" && (
            <div
              style={{
                margin: "16px 24px 0",
                borderRadius: 12,
                background: c.s1,
                border: "0.5px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
                animation: "cloudPanelIn 0.35s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              <PanelHeader dotColor={c.tm} title="Local workspaces" tagText="Browser" tagColor={c.tm} />
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <ActionRow
                  icon={<UploadIcon color={c.bl} />}
                  iconBg="rgba(91,156,245,0.1)"
                  name="Migrate to the cloud"
                  desc="To move this Workspace to the cloud, enable the cloud toggle and use the action in the Workspace dropdown to migrate. This moves the workspace to the cloud, it does not keep a local copy."
                  right={<></>
                  }
                />
                <ActionRow
                  icon={<SquareIcon color={c.tm} />}
                  iconBg="rgba(136,136,170,0.1)"
                  name="Keep as local"
                  desc="No changes. It stays in your browser like before."
                  right={
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: c.td }}>
                                            Default
                    </span>
                  }
                />
              </div>
            </div>
          )}

          {picked === "cloud" && (
            <div
              style={{
                margin: "16px 24px 0",
                borderRadius: 12,
                background: c.s1,
                border: "0.5px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
                animation: "cloudPanelIn 0.35s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              <PanelHeader dotColor={c.bl} title="Cloud Workspaces" tagText="Synced" tagColor={c.bl} />
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <ActionRow
                  icon={<CheckCircleIcon color={c.gn} />}
                  iconBg="rgba(107,219,138,0.1)"
                  name="Auto-sync"
                  desc="Every edit saves to the cloud instantly. No action needed."
                  right={<></>
                  }
                />
                <Separator />
                <ActionRow
                  icon={<PlusBoxIcon color={c.bl} />}
                  iconBg="rgba(91,156,245,0.1)"
                  name="Create new Cloud Workspaces"
                  desc="When cloud is enabled, you can create new Workspaces directly in the cloud."
                  right={<></>
                  }
                />
                <ActionRow
                  icon={<UploadIcon color={c.bl} />}
                  iconBg="rgba(91,156,245,0.1)"
                  name="Migrate local workspaces"
                  desc="Enable the cloud and use the option in the Workspace dropdown to migrate anytime."
                  right={<></>
                  }
                />
                <Separator />
                <ActionRow
                  icon={<DownloadIcon color={c.am} />}
                  iconBg="rgba(240,160,48,0.1)"
                  name="Download snapshots"
                  desc="Save a point-in-time backup of any Cloud Workspace as a zip. Use the Workspace dropdown to download."
                  right={<></>
                  }
                />
              </div>
            </div>
          )}

          {/* ── Mix and match note ── */}
          <div
            style={{
              margin: "14px 24px 0",
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(240,160,48,0.06)",
              border: "0.5px solid rgba(240,160,48,0.12)",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              fontSize: 11,
              color: c.tm,
              lineHeight: 1.5,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke={c.am}
              strokeWidth="1.5"
              style={{ flexShrink: 0, marginTop: 1 }}
            >
              <circle cx="7" cy="7" r="5.5" />
              <path d="M7 4.5v3M7 9.5h.01" />
            </svg>
            <span>
              <strong style={{ color: c.am, fontWeight: 500 }}>You can mix and match.</strong> Keep some
                            Workspaces local, make others cloud — it&apos;s up to you. Migration is always optional and can
                            be done anytime from the Workspace dropdown.
            </span>
          </div>

          {/* ── Footer ── */}
          <div
            style={{
              padding: "14px 24px",
              marginTop: 14,
              borderTop: "0.5px solid rgba(255,255,255,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {onShowReel && (
                <AllFeaturesButton onClick={onShowReel} />
              )}
              <span style={{ fontSize: 11, color: c.td, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={c.td} strokeWidth="1.5">
                  <path d="M8 3v5l3 2" />
                  <circle cx="8" cy="8" r="6" />
                </svg>
                                Cloud Workspaces sync in real time
              </span>
            </div>
            <GotItButton onClick={onClose} />
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Small button sub-components ─────────────────────────────────

const CloseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: hovered ? c.s2 : c.s1,
        border: "0.5px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: hovered ? c.tx : c.tm,
        fontSize: 16,
        transition: "all 0.2s",
      }}
    >
            &times;
    </div>
  );
};

const GotItButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: hovered ? c.tx : c.tm,
        background: hovered ? c.s2 : c.s1,
        border: "0.5px solid rgba(255,255,255,0.08)",
        padding: "6px 16px",
        borderRadius: 6,
        cursor: "pointer",
        transition: "all 0.2s",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
            Got it
    </button>
  );
};

// ─── Panel header sub-component ──────────────────────────────────

interface PanelHeaderProps {
    dotColor: string;
    title: string;
    tagText: string;
    tagColor: string;
}

const PanelHeader: React.FC<PanelHeaderProps> = ({ dotColor, title, tagText, tagColor }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "12px 14px",
      borderBottom: "0.5px solid rgba(255,255,255,0.04)",
    }}
  >
    <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
    <div style={{ fontSize: 13, fontWeight: 500, color: c.tx, flex: 1 }}>{title}</div>
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        padding: "2px 7px",
        borderRadius: 4,
        textTransform: "uppercase" as const,
        letterSpacing: 1,
        background: `${tagColor}1e`,
        color: tagColor,
        border: `0.5px solid ${tagColor}33`,
      }}
    >
      {tagText}
    </div>
  </div>
);

export default CloudHelpModal;
export type { CloudHelpModalProps, CloudAction, WorkspaceType };

// ─── Usage examples ──────────────────────────────────────────────
//
//  import CloudHelpModal from './CloudHelpModal'
//
//  // ── Basic usage ──
//  const [showCloud, setShowCloud] = useState(false)
//  <CloudHelpModal open={showCloud} onClose={() => setShowCloud(false)} />
//
//  // ── With action handling ──
//  <CloudHelpModal
//    open={showCloud}
//    onClose={() => setShowCloud(false)}
//    closeOnAction
//    onAction={(action) => {
//      switch (action) {
//        case 'migrate':  openMigrateDialog(); break
//        case 'create':   openCreateCloudWorkspace(); break
//        case 'snapshot': openSnapshotDownload(); break
//      }
//    }}
//  />
