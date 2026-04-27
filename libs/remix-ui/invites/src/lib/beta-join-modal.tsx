import React, { useState } from "react";
import { InviteValidateResponse, InviteRedeemResponse } from '@remix-api'
import { LoginModal } from '@remix-ui/login'

// ─── Types ───────────────────────────────────────────────────────

interface BetaJoinModalProps {
  /** Whether the modal is currently visible. */
  open: boolean;
  /** Called when the user closes the modal. */
  onClose: () => void;
  /** Invite token string. */
  token: string;
  /** Server-side validation result for the invite. */
  validation: InviteValidateResponse;
  /** Whether the current user is authenticated. */
  isAuthenticated: boolean;
  /** True while the redeem request is in flight. */
  redeeming: boolean;
  /** Error message from a failed redeem attempt. */
  error: string | null;
  /** Called when the user clicks "Join the Beta". */
  onRedeem: (token: string) => Promise<InviteRedeemResponse>;
  /** Optional action to defer for this session only. */
  onDoLater?: () => void;
  /** Optional action to permanently dismiss related nudges. */
  onDismissPermanent?: () => void;
  /** Plugin reference passed to LoginButton. */
  plugin?: any;
}

// ─── Keyframes ───────────────────────────────────────────────────

const KEYFRAMES = `
  @keyframes bjModalIn {
    from { opacity: 0; transform: scale(0.9) translateY(30px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes bjOverlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes bjShimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @keyframes bjGridPan {
    0%   { transform: translate(0, 0); }
    100% { transform: translate(24px, 24px); }
  }
  @keyframes bjFadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes bjDotPulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50%      { opacity: 1; transform: scale(1.3); }
  }
  @keyframes bjLockGlow {
    0%, 100% { opacity: 0.5; }
    50%      { opacity: 1; }
  }
`;

// ─── Colors ──────────────────────────────────────────────────────

const c = {
  bg: "#1a1a2e",
  s1: "#222240",
  s2: "#2a2a4a",
  cy: "#2fbfb1",
  tx: "#e0e0ec",
  tm: "#9a9ab8",
  td: "#7a7a9a",
  bl: "#5b9cf5",
  gn: "#6bdb8a",
  am: "#f0a030",
  pu: "#9b7dff",
};

// ─── Feature data ────────────────────────────────────────────────

interface FeatureChip {
  name: string;
  desc: string;
  iconColor: string;
  iconBg: string;
  icon: React.ReactNode;
}

const FEATURES: FeatureChip[] = [
  {
    name: "Advanced AI Models",
    desc: "Sonnet 4.6, Opus, Codestral — free",
    iconColor: c.pu,
    iconBg: "rgba(155,125,255,0.1)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#9b7dff" strokeWidth="1.5">
        <circle cx="7" cy="7" r="5" />
        <path d="M5 7.5l1.5 1.5L9 6" />
      </svg>
    ),
  },
  {
    name: "MCP Integrations",
    desc: "Alchemy, Etherscan, The Graph",
    iconColor: c.bl,
    iconBg: "rgba(91,156,245,0.1)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#5b9cf5" strokeWidth="1.5">
        <circle cx="7" cy="7" r="5" />
        <circle cx="7" cy="7" r="2" />
      </svg>
    ),
  },
  {
    name: "QuickDApp Builder",
    desc: "AI frontend + IPFS hosting",
    iconColor: c.gn,
    iconBg: "rgba(107,219,138,0.1)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#6bdb8a" strokeWidth="1.5">
        <rect x="2.5" y="2.5" width="9" height="9" rx="2" />
        <path d="M6 6l3 2-3 2" />
      </svg>
    ),
  },
  {
    name: "Cloud Workspaces",
    desc: "Sync and access from any device",
    iconColor: c.cy,
    iconBg: "rgba(47,191,177,0.1)",
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#2fbfb1" strokeWidth="1.5">
        <path d="M4.5 10c-1.5 0-3-1-3-2.5 0-1.2.8-2.2 2-2.5C4 3 5.5 1.5 7.5 1.5c2 0 3.5 1.2 4 3 .7.2 1.2.8 1.2 1.6 0 1.2-1 2-2.2 2" />
        <path d="M7 7v4M5.5 9.5l1.5 1.5 1.5-1.5" />
      </svg>
    ),
  },
];

// ─── Why join data ───────────────────────────────────────────────

interface WhyCard {
  title: string;
  desc: string;
  iconColor: string;
  iconBg: string;
  icon: React.ReactNode;
}

const WHY_CARDS: WhyCard[] = [
  {
    title: "First Access",
    desc: "Try features before anyone else",
    iconColor: c.cy,
    iconBg: "rgba(47,191,177,0.1)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#2fbfb1" strokeWidth="1.5">
        <path d="M8 2v12M3 7l5-5 5 5" />
      </svg>
    ),
  },
  {
    title: "Direct Line",
    desc: "Feedback goes to the core team",
    iconColor: c.pu,
    iconBg: "rgba(155,125,255,0.1)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9b7dff" strokeWidth="1.5">
        <path d="M4 12l-2 2V5.5A1.5 1.5 0 013.5 4h9A1.5 1.5 0 0114 5.5v5a1.5 1.5 0 01-1.5 1.5H4z" />
      </svg>
    ),
  },
  {
    title: "Shape Remix",
    desc: "Your input drives what ships",
    iconColor: c.bl,
    iconBg: "rgba(91,156,245,0.1)",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#5b9cf5" strokeWidth="1.5">
        <path d="M14 2L2 8l4.5 2L14 2zM6.5 10v4l2.5-2" />
      </svg>
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
        width: 28, height: 28, borderRadius: 6,
        background: h ? c.s2 : "rgba(255,255,255,0.04)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: h ? c.tx : c.tm, fontSize: 16, transition: "all 0.2s",
      }}
    >
      &times;
    </div>
  );
};

const FeatureChipCard: React.FC<{ feature: FeatureChip; delay: string }> = ({ feature, delay }) => (
  <div
    style={{
      flex: 1,
      padding: 12,
      borderRadius: 10,
      background: c.s1,
      border: "0.5px solid rgba(255,255,255,0.04)",
      display: "flex",
      alignItems: "center",
      gap: 10,
      animation: `bjFadeUp 0.5s ease ${delay} both`,
    }}
  >
    <div
      style={{
        width: 28, height: 28, borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, background: feature.iconBg,
      }}
    >
      {feature.icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: c.tx, marginBottom: 1 }}>{feature.name}</div>
      <div style={{ fontSize: 10, color: c.tm, lineHeight: 1.3 }}>{feature.desc}</div>
    </div>
  </div>
);

const WhyJoinCard: React.FC<{ card: WhyCard; delay: string }> = ({ card, delay }) => (
  <div
    style={{
      flex: 1,
      padding: 12,
      borderRadius: 10,
      background: c.s1,
      border: "0.5px solid rgba(255,255,255,0.04)",
      textAlign: "center",
      animation: `bjFadeUp 0.5s ease ${delay} both`,
    }}
  >
    <div
      style={{
        width: 32, height: 32, borderRadius: 8,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        marginBottom: 8, background: card.iconBg,
      }}
    >
      {card.icon}
    </div>
    <div style={{ fontSize: 12, fontWeight: 500, color: c.tx, marginBottom: 2 }}>{card.title}</div>
    <div style={{ fontSize: 10, color: c.tm, lineHeight: 1.3 }}>{card.desc}</div>
  </div>
);

// ─── Helpers ─────────────────────────────────────────────────────

function formatExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  const diff = date.getTime() - Date.now();
  if (diff < 0) return "Expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d remaining`;
  if (hours > 0) return `${hours}h remaining`;
  return "Expires soon";
}

// ─── Main component ──────────────────────────────────────────────

const BetaJoinModal: React.FC<BetaJoinModalProps> = ({
  open, onClose, token, validation, isAuthenticated, redeeming, error, onRedeem, onDoLater, onDismissPermanent, plugin,
}) => {
  const [ctaHovered, setCtaHovered] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  if (!open) return null;

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.55)", zIndex: 9998,
          animation: "bjOverlayIn 0.3s ease",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, pointerEvents: "none",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            color: c.tx, background: c.bg,
            borderRadius: 20,
            border: "0.5px solid rgba(47,191,177,0.15)",
            width: "100%", maxWidth: 500,
            maxHeight: "90vh", overflowY: "auto",
            animation: "bjModalIn 0.6s cubic-bezier(0.34,1.56,0.64,1)",
            pointerEvents: "auto",
          }}
        >
          {/* ── Hero ── */}
          <div style={{ position: "relative", padding: "32px 28px 24px", overflow: "hidden" }}>
            {/* Background */}
            <div
              style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(160deg, rgba(47,191,177,0.08) 0%, rgba(91,156,245,0.05) 40%, rgba(155,125,255,0.08) 100%)",
              }}
            />
            <div
              style={{
                position: "absolute", inset: -24, opacity: 0.03,
                backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
                animation: "bjGridPan 8s linear infinite",
              }}
            />

            {/* Top bar */}
            <div
              style={{
                position: "relative", zIndex: 2,
                display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 12px 4px 6px", borderRadius: 20,
                  background: "rgba(47,191,177,0.08)",
                  border: "0.5px solid rgba(47,191,177,0.2)",
                }}
              >
                <span
                  style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: c.cy,
                    animation: "bjDotPulse 2s ease-in-out infinite",
                  }}
                />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10, letterSpacing: 1,
                    textTransform: "uppercase" as const,
                    color: c.cy,
                  }}
                >
                  You&apos;re invited
                </span>
              </div>
              <CloseButton onClick={onClose} />
            </div>

            {/* Title */}
            <div
              style={{
                position: "relative", zIndex: 2,
                fontSize: 24, fontWeight: 500, color: c.tx, lineHeight: 1.25, marginBottom: 8,
              }}
            >
              Join the{" "}
              <span
                style={{
                  background: `linear-gradient(90deg, ${c.cy}, ${c.bl}, ${c.pu}, ${c.cy})`,
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "bjShimmer 4s linear infinite",
                }}
              >
                Remix Beta Program
              </span>
            </div>
            <div style={{ position: "relative", zIndex: 2, fontSize: 14, color: c.tm, lineHeight: 1.5 }}>
              Join the Remix v2 Private Beta. Be the first to test new features, break things, and tell us what to build next.
            </div>
          </div>

          {/* ── Features ── */}
          <div style={{ padding: "8px 28px 20px" }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, letterSpacing: 1.5,
                textTransform: "uppercase" as const,
                color: c.td, marginBottom: 12,
              }}
            >
              What you&apos;ll unlock
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <FeatureChipCard feature={FEATURES[0]} delay="0.1s" />
              <FeatureChipCard feature={FEATURES[1]} delay="0.15s" />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <FeatureChipCard feature={FEATURES[2]} delay="0.2s" />
              <FeatureChipCard feature={FEATURES[3]} delay="0.25s" />
            </div>
          </div>

          {/* ── Why join ── */}
          <div style={{ padding: "0 28px 20px" }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, letterSpacing: 1.5,
                textTransform: "uppercase" as const,
                color: c.td, marginBottom: 12,
              }}
            >
              Why join
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {WHY_CARDS.map((card, i) => (
                <WhyJoinCard key={card.title} card={card} delay={`${0.3 + i * 0.05}s`} />
              ))}
            </div>
          </div>

          {/* ── Meta badges ── */}
          {(validation.expires_at || validation.uses_remaining != null) && (
            <div style={{ padding: "0 28px 12px", display: "flex", gap: 8, animation: "bjFadeUp 0.5s ease 0.4s both" }}>
              {validation.expires_at && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 8, fontSize: 11,
                  background: c.s1, border: "0.5px solid rgba(255,255,255,0.06)", color: c.tm,
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={c.tm} strokeWidth="1.3">
                    <circle cx="6" cy="6" r="4.5" /><path d="M6 3.5V6l2 1.5" />
                  </svg>
                  {formatExpiry(validation.expires_at)}
                </span>
              )}
              {validation.uses_remaining != null && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 8, fontSize: 11,
                  background: c.s1, border: "0.5px solid rgba(255,255,255,0.06)", color: c.tm,
                }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={c.tm} strokeWidth="1.3">
                    <rect x="2" y="3" width="8" height="6" rx="1" /><path d="M5 3V2h2v1" />
                  </svg>
                  {validation.uses_remaining} left
                </span>
              )}
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div style={{
              margin: "0 28px 12px", padding: "10px 14px", borderRadius: 10,
              background: "rgba(239,68,68,0.08)", border: "0.5px solid rgba(239,68,68,0.2)",
              fontSize: 12, color: "#f87171", display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#f87171" strokeWidth="1.5">
                <path d="M7 1L1 13h12L7 1z" /><path d="M7 5.5v3M7 10.5v.5" />
              </svg>
              {error}
            </div>
          )}

          {/* ── CTA ── */}
          <div style={{ padding: "0 28px 20px", animation: "bjFadeUp 0.5s ease 0.45s both" }}>
            {isAuthenticated ? (
              <button
                onClick={() => onRedeem(token)}
                onMouseEnter={() => setCtaHovered(true)}
                onMouseLeave={() => setCtaHovered(false)}
                disabled={redeeming}
                data-id="invite-join-beta-btn"
                style={{
                  width: "100%", padding: 14, borderRadius: 12,
                  background: "linear-gradient(135deg, #8af7df 0%, #45d4cb 26%, #68b2ff 58%, #b08dff 100%)",
                  backgroundSize: "220% 220%",
                  border: "1px solid rgba(255,255,255,0.24)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14, fontWeight: 500, color: c.bg,
                  cursor: redeeming ? "wait" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  transition: "all 0.2s",
                  opacity: redeeming ? 0.7 : 1,
                  filter: ctaHovered && !redeeming ? "brightness(1.06) saturate(1.05)" : "none",
                  transform: ctaHovered && !redeeming ? "translateY(-1px)" : "none",
                  boxShadow: ctaHovered && !redeeming
                    ? "0 18px 36px rgba(69,212,203,0.28), 0 8px 18px rgba(104,178,255,0.22), inset 0 1px 0 rgba(255,255,255,0.35)"
                    : "0 14px 28px rgba(69,212,203,0.22), 0 6px 14px rgba(176,141,255,0.18), inset 0 1px 0 rgba(255,255,255,0.28)",
                  animation: redeeming ? "none" : "bjShimmer 5s linear infinite",
                }}
              >
                {redeeming ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                      style={{ animation: "bjDotPulse 1s ease-in-out infinite" }}>
                      <circle cx="8" cy="8" r="6" strokeDasharray="20 10" />
                    </svg>
                    Activating…
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 8l5 5L14 3" />
                    </svg>
                    Start Using the Beta
                  </>
                )}
              </button>
            ) : (
              <div>
                <button
                  onClick={() => setShowLogin(true)}
                  style={{
                    width: "100%", padding: 14, borderRadius: 12,
                    background: c.cy, border: "none",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 14, fontWeight: 500, color: c.bg,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "all 0.2s",
                  }}
                  data-id="invite-sign-in-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="7" width="10" height="7" rx="1.5" />
                    <path d="M5 7V5a3 3 0 016 0v2" />
                  </svg>
                  Sign in to activate your invite
                </button>
              </div>
            )}
            <div style={{ textAlign: "center", fontSize: 11, color: c.td, marginTop: 10, lineHeight: 1.4 }}>
              Free to join. Free to leave anytime. Around a month of testing.
            </div>
            {(onDoLater || onDismissPermanent) && (
              <div style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                flexWrap: "wrap"
              }}>
                {onDoLater && (
                  <button
                    onClick={onDoLater}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      background: c.s1,
                      border: "0.5px solid rgba(255,255,255,0.08)",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      color: c.tm,
                      cursor: "pointer"
                    }}
                  >
                    I will join later
                  </button>
                )}
                {onDismissPermanent && (
                  <button
                    onClick={onDismissPermanent}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      background: c.s1,
                      border: "0.5px solid rgba(255,255,255,0.08)",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      color: c.tm,
                      cursor: "pointer"
                    }}
                  >
                    Don&apos;t show again
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div
            style={{
              padding: "12px 28px",
              borderTop: "0.5px solid rgba(255,255,255,0.04)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              stroke={c.td} strokeWidth="1.5"
              style={{ animation: "bjLockGlow 3s ease-in-out infinite" }}
            >
              <rect x="2.5" y="5.5" width="7" height="5" rx="1" />
              <path d="M4 5.5V4a2 2 0 014 0v1.5" />
            </svg>
            <span style={{ fontSize: 11, color: c.td }}>Private beta — invite only</span>
          </div>
        </div>
      </div>

      {/* LoginModal rendered outside the animated card to avoid CSS containment */}
      {showLogin && (
        <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
          <LoginModal onClose={() => setShowLogin(false)} plugin={plugin} />
        </div>
      )}
    </>
  );
};

export default BetaJoinModal;
export type { BetaJoinModalProps };

// ─── Usage example ───────────────────────────────────────────────
//
//  import BetaJoinModal from './beta-join-modal'
//
//  <BetaJoinModal
//    open={showJoin}
//    onClose={() => setShowJoin(false)}
//    token={token}
//    validation={validation}
//    isAuthenticated={isAuthenticated}
//    redeeming={redeeming}
//    error={error}
//    onRedeem={handleRedeem}
//    plugin={plugin}
//  />
