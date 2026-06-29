import React, { useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────

type FeatureKey = "models" | "mcp" | "quickdapp" | "cloud";
type LinkKey = "discord" | "docs" | "blog";

interface BetaWelcomeModalProps {
  /** Whether the modal is currently visible. */
  open: boolean;
  /** Called when the user closes the modal. */
  onClose: () => void;
  /** Called when the user clicks a feature card. Opens the corresponding help modal. */
  onFeature?: (feature: FeatureKey) => void;
  /** Called when the user clicks the feedback button. */
  onFeedback?: () => void;
  /** Called when the user clicks a link chip (discord, docs, blog). */
  onLink?: (link: LinkKey) => void;
}

// ─── Keyframes ───────────────────────────────────────────────────

const KEYFRAMES = `
  @keyframes bwModalIn {
    from { opacity: 0; transform: scale(0.92) translateY(20px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes bwOverlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes bwShimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
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
  td: "#5c5c7a",
  bl: "#5b9cf5",
  gn: "#6bdb8a",
  am: "#f0a030",
  pu: "#9b7dff",
  pk: "#e86baf",
  discord: "#7289da",
};

// ─── Feature data ────────────────────────────────────────────────

interface FeatureConfig {
  key: FeatureKey;
  name: string;
  desc: string;
  iconColor: string;
  iconBg: string;
  icon: React.ReactNode;
}

const FEATURES: FeatureConfig[] = [
  {
    key: "models",
    name: "Advanced AI Models",
    desc: "Sonnet 4.6 (default), Opus, Codestral — free with rate limits",
    iconColor: c.pu,
    iconBg: "rgba(155,125,255,0.1)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9b7dff" strokeWidth="1.5">
        <circle cx="8" cy="8" r="5.5" />
        <path d="M6 8.5l1.5 1.5L10 7" />
      </svg>
    ),
  },
  {
    key: "mcp",
    name: "MCP Integrations",
    desc: "Alchemy, Etherscan, The Graph, ethSkills",
    iconColor: c.bl,
    iconBg: "rgba(91,156,245,0.1)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#5b9cf5" strokeWidth="1.5">
        <circle cx="8" cy="8" r="5.5" />
        <circle cx="8" cy="8" r="2" />
      </svg>
    ),
  },
  {
    key: "quickdapp",
    name: "QuickDApp Builder",
    desc: "Contract to frontend in minutes",
    iconColor: c.gn,
    iconBg: "rgba(107,219,138,0.1)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#6bdb8a" strokeWidth="1.5">
        <rect x="3" y="3" width="10" height="10" rx="2" />
        <path d="M7 7l3 2-3 2" />
      </svg>
    ),
  },
  {
    key: "cloud",
    name: "Cloud Workspaces",
    desc: "Sync, access anywhere, snapshots",
    iconColor: c.bl,
    iconBg: "rgba(91,156,245,0.1)",
    icon: (
      <i className="fas fa-cloud" style={{ fontSize: 14, color: '#5b9cf5' }}></i>
    ),
  },
];

// ─── Sub-components ──────────────────────────────────────────────

const CloseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        background: h ? c.s2 : "rgba(255,255,255,0.04)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: h ? c.tx : c.tm,
        fontSize: 16,
        transition: "all 0.2s",
      }}
    >
      &times;
    </div>
  );
};

interface FeatureCardProps {
  feature: FeatureConfig;
  onClick: () => void;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ feature, onClick }) => {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: 12,
        borderRadius: 10,
        background: h ? c.s2 : c.s1,
        border: `0.5px solid ${h ? "rgba(47,191,177,0.25)" : "rgba(255,255,255,0.04)"}`,
        cursor: "pointer",
        transition: "all 0.3s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: feature.iconBg,
        }}
      >
        {feature.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: c.tx, marginBottom: 2 }}>{feature.name}</div>
        <div
          style={{
            fontSize: 10,
            color: c.td,
            lineHeight: 1.3,
            whiteSpace: "normal",
            overflowWrap: "break-word",
          }}
        >
          {feature.desc}
        </div>
      </div>
      <span
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: `translateX(${h ? "0" : "4px"}) translateY(-50%)`,
          opacity: h ? 1 : 0,
          color: c.cy,
          fontSize: 14,
          transition: "all 0.2s",
        }}
      >
        &rsaquo;
      </span>
    </div>
  );
};

interface LinkChipProps {
  label: string;
  icon: React.ReactNode;
  accent?: string;
  onClick: () => void;
}

const LinkChip: React.FC<LinkChipProps> = ({ label, icon, accent, onClick }) => {
  const [h, setH] = useState(false);
  const color = accent ?? c.tm;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: 10,
        borderRadius: 8,
        background: h ? (accent ? `${accent}1a` : c.s2) : c.s1,
        border: `0.5px solid ${h ? (accent ? `${accent}40` : "rgba(255,255,255,0.1)") : "rgba(255,255,255,0.04)"}`,
        fontSize: 11,
        fontWeight: 500,
        color: h ? (accent ?? c.tx) : color,
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      {icon}
      {label}
    </div>
  );
};

// ─── Section label ───────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10,
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
      color: c.td,
      marginBottom: 10,
      display: "flex",
      alignItems: "center",
      gap: 6,
    }}
  >
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={c.td} strokeWidth="1.5">
      <path d="M6 1v10M1 6h10" />
    </svg>
    {children}
  </div>
);

// ─── Main component ──────────────────────────────────────────────

const BetaWelcomeModal: React.FC<BetaWelcomeModalProps> = ({
  open,
  onClose,
  onFeature,
  onFeedback,
  onLink,
}) => {
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
          animation: "bwOverlayIn 0.3s ease",
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
            border: "0.5px solid rgba(47,191,177,0.15)",
            width: "100%",
            maxWidth: 520,
            maxHeight: "90vh",
            overflowY: "auto",
            animation: "bwModalIn 0.5s cubic-bezier(0.34,1.56,0.64,1)",
            pointerEvents: "auto",
          }}
        >
          {/* ── Hero ── */}
          <div style={{ position: "relative", padding: "28px 24px 20px", overflow: "hidden" }}>
            {/* Background layers */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(135deg, rgba(47,191,177,0.06) 0%, rgba(155,125,255,0.04) 50%, rgba(91,156,245,0.06) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0.04,
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />

            {/* Top bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                position: "relative",
                zIndex: 2,
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(47,191,177,0.12)",
                    border: "0.5px solid rgba(47,191,177,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                    stroke={c.cy}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M6 14l-2 2V5a2 2 0 012-2h8a2 2 0 012 2v7a2 2 0 01-2 2H6z" />
                    <path d="M7 7h4M7 10h2" />
                  </svg>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 16, fontWeight: 500, color: c.tx }}>Remix Beta Program</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: c.cy,
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: 0.5,
                    }}
                  >
                    You&apos;re in
                  </div>
                </div>
              </div>
              <CloseButton onClick={onClose} />
            </div>

            {/* Hero text */}

            <div style={{ position: "relative", zIndex: 2, fontSize: 13, color: c.tm, lineHeight: 1.5 }}>
              These features are unlocked early for you. Explore them, break them, tell us what you think.
            </div>
          </div>

          {/* ── Features ── */}
          <div style={{ padding: "10px 24px 16px" }}>
            <SectionLabel>What&apos;s unlocked</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {FEATURES.map((feat) => (
                <FeatureCard
                  key={feat.key}
                  feature={feat}
                  onClick={() => onFeature?.(feat.key)}
                />
              ))}
            </div>
          </div>

          {/* ── Feedback ── */}
          <div style={{ padding: "0 24px 16px" }}>
            <SectionLabel>Your voice matters</SectionLabel>
            <div
              style={{
                borderRadius: 12,
                padding: 16,
                background: "rgba(155,125,255,0.04)",
                border: "0.5px solid rgba(155,125,255,0.15)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "rgba(155,125,255,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke={c.pu}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    <path d="M4 15l-2 3V6a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H4z" />
                    <path d="M7 8h6M7 11h3" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: c.tx, marginBottom: 3 }}>
                    Your feedback shapes what we build next
                  </div>
                  <div style={{ fontSize: 11, color: c.tm, lineHeight: 1.4 }}>
                    Found a bug? Have an idea? Use the feedback button in the bottom-left corner — it
                    goes straight to the core team.
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <FeedbackButton onClick={() => onFeedback?.()} />
              </div>
            </div>
          </div>

          {/* ── Links ── */}
          <div style={{ padding: "0 24px 16px" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <LinkChip
                label="Join Discord"
                accent={c.discord}
                onClick={() => onLink?.("discord")}
                icon={
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M6 11c-.5 0-1.5.5-2 1M10 11c.5 0 1.5.5 2 1M5.5 9a.5.5 0 100-1 .5.5 0 000 1zM10.5 9a.5.5 0 100-1 .5.5 0 000 1zM4 6s1-2 4-2 4 2 4 2" />
                  </svg>
                }
              />
              <LinkChip
                label="Docs"
                onClick={() => onLink?.("docs")}
                icon={
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="2" width="12" height="12" rx="2" />
                    <path d="M5 6h6M5 8h4M5 10h5" />
                  </svg>
                }
              />
              <LinkChip
                label="Blog"
                onClick={() => onLink?.("blog")}
                icon={
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 3h8M4 7h8M4 11h5" />
                    <circle cx="12" cy="11" r="2" />
                  </svg>
                }
              />
            </div>
          </div>

          {/* ── Footer ── */}
          <div
            style={{
              padding: "14px 24px",
              borderTop: "0.5px solid rgba(255,255,255,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ fontSize: 12, color: c.td, display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill={c.pk} stroke="none">
                <path d="M8 14s-5.5-3.5-5.5-7A3 3 0 018 5a3 3 0 015.5 2c0 3.5-5.5 7-5.5 7z" />
              </svg>
              Thank you for being a Beta Tester
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Feedback button sub-component ───────────────────────────────

const FeedbackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 18px",
        borderRadius: 8,
        background: h ? "rgba(155,125,255,0.2)" : "rgba(155,125,255,0.12)",
        border: `0.5px solid ${h ? "rgba(155,125,255,0.4)" : "rgba(155,125,255,0.25)"}`,
        color: c.pu,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.2s",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 12l-2 2V5a1.5 1.5 0 011.5-1.5h9A1.5 1.5 0 0114 5v5a1.5 1.5 0 01-1.5 1.5H4z" />
      </svg>
      Send feedback
    </div>
  );
};

export default BetaWelcomeModal;
export type { BetaWelcomeModalProps, FeatureKey, LinkKey };

// ─── Usage examples ──────────────────────────────────────────────
//
//  import BetaWelcomeModal from './BetaWelcomeModal'
//
//  const [showBeta, setShowBeta] = useState(false)
//  const [showMcp, setShowMcp] = useState(false)
//  const [showCloud, setShowCloud] = useState(false)
//  const [showQD, setShowQD] = useState(false)
//
//  <BetaWelcomeModal
//    open={showBeta}
//    onClose={() => setShowBeta(false)}
//    onFeature={(feature) => {
//      setShowBeta(false)
//      switch (feature) {
//        case 'models':    activatePanel('ai-assistant'); break // no modal, just open the panel
//        case 'mcp':       setShowMcp(true); break
//        case 'quickdapp': setShowQD(true); break
//        case 'cloud':     setShowCloud(true); break
//      }
//    }}
//    onFeedback={() => {
//      setShowBeta(false)
//      openFeedbackPanel()
//    }}
//    onLink={(link) => {
//      switch (link) {
//        case 'discord': window.open('https://discord.gg/remix'); break
//        case 'docs':    window.open('https://remix-ide.readthedocs.io'); break
//        case 'blog':    window.open('https://medium.com/remix-ide'); break
//      }
//    }}
//  />
