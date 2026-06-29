import React, { useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────

type StepIndex = 0 | 1 | 2 | 3;

interface QuickDAppHelpModalProps {
  /** Whether the modal is currently visible. */
  open: boolean;
  /** Called when the user closes the modal. */
  onClose: () => void;
  /** Called when the user clicks the "Got it" or "Start now" button. */
  onStart?: () => void;
  /** Called when the user wants to go back to the feature reel. */
  onShowReel?: () => void;
}

// ─── Keyframes ───────────────────────────────────────────────────

const KEYFRAMES = `
  @keyframes qdModalIn {
    from { opacity: 0; transform: scale(0.92) translateY(20px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes qdOverlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes qdPanelIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
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
  td: "#b2b2c3",
  bl: "#5b9cf5",
  gn: "#6bdb8a",
  am: "#f0a030",
  pu: "#9b7dff",
};

// ─── Step data ───────────────────────────────────────────────────

interface StepConfig {
  label: string;
  dotColor: string;
  title: string;
  tagText: string;
  tagColor: string;
}

const STEPS: StepConfig[] = [
  { label: "Deploy your contract", dotColor: c.cy, title: "Deploy your contract", tagText: "Required", tagColor: c.cy },
  { label: "Describe the UI", dotColor: c.pu, title: "Describe the UI you want", tagText: "Creative", tagColor: c.pu },
  { label: "AI generates", dotColor: c.bl, title: "AI generates your DApp", tagText: "Auto", tagColor: c.bl },
  { label: "Preview, edit, publish", dotColor: c.gn, title: "Preview, refine, publish", tagText: "Final", tagColor: c.gn },
];

// ─── Shared sub-components ───────────────────────────────────────

const CloseButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [h, setH] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: 28, height: 28, borderRadius: 6,
        background: h ? c.s2 : c.s1,
        border: "0.5px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", color: h ? c.tx : c.tm, fontSize: 16, transition: "all 0.2s",
      }}
    >
      &times;
    </div>
  );
};

const AllFeaturesButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        fontSize: 12, fontWeight: 500,
        color: h ? "#fff" : c.cy,
        background: h ? c.cy : "rgba(47,191,177,0.1)",
        border: `1px solid ${h ? c.cy : "rgba(47,191,177,0.3)"}`,
        padding: "6px 16px", borderRadius: 6,
        cursor: "pointer", transition: "all 0.2s",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex", alignItems: "center", gap: 6,
      }}
    >
      <i className="fas fa-chevron-left" style={{ fontSize: 9 }}></i>
      All features
    </button>
  );
};

const GotItButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        fontSize: 12, fontWeight: 500,
        color: h ? c.tx : c.tm,
        background: h ? c.s2 : c.s1,
        border: "0.5px solid rgba(255,255,255,0.08)",
        padding: "6px 16px", borderRadius: 6,
        cursor: "pointer", transition: "all 0.2s",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      Got it
    </button>
  );
};

const Separator: React.FC = () => (
  <div style={{ height: 0.5, background: "rgba(255,255,255,0.04)", margin: "8px 0" }} />
);

interface DetailRowProps {
  iconColor: string;
  iconBg: string;
  icon: React.ReactNode;
  name: string;
  desc: string;
}

const DetailRow: React.FC<DetailRowProps> = ({ iconColor, iconBg, icon, name, desc }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
    <div
      style={{
        width: 20, height: 20, borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginTop: 1, background: iconBg,
      }}
    >
      {icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: c.tx, marginBottom: 2 }}>{name}</div>
      <div style={{ fontSize: 11, color: c.td, lineHeight: 1.4 }}>{desc}</div>
    </div>
  </div>
);

interface PanelHeaderProps {
  dotColor: string;
  title: string;
  tagText: string;
  tagColor: string;
}

const PanelHeader: React.FC<PanelHeaderProps> = ({ dotColor, title, tagText, tagColor }) => (
  <div
    style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "12px 14px",
      borderBottom: "0.5px solid rgba(255,255,255,0.04)",
    }}
  >
    <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
    <div style={{ fontSize: 13, fontWeight: 500, color: c.tx, flex: 1 }}>{title}</div>
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9, padding: "2px 7px", borderRadius: 4,
        textTransform: "uppercase" as const, letterSpacing: 1,
        background: `${tagColor}1e`, color: tagColor,
        border: `0.5px solid ${tagColor}33`,
      }}
    >
      {tagText}
    </div>
  </div>
);

// ─── Small SVG icons ─────────────────────────────────────────────

const CheckSmall: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth="1.5">
    <path d="M2 5l2 2 4-4" />
  </svg>
);

const ClockSmall: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth="1.5">
    <circle cx="5" cy="5" r="3.5" />
    <path d="M5 3.5V5l1.5 1" />
  </svg>
);

const WarnSmall: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth="1.5">
    <circle cx="5" cy="5" r="3.5" />
    <path d="M5 3.5v2M5 7h.01" />
  </svg>
);

const PlusSmall: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth="1.5">
    <path d="M2.5 5h5" />
    <path d="M5 2.5v5" />
  </svg>
);

const ArrowSmall: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth="1.5">
    <path d="M2 7.5L7.5 2M6 2h2v2" />
  </svg>
);

const BoxSmall: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth="1.5">
    <rect x="1.5" y="1.5" width="7" height="7" rx="1.5" />
  </svg>
);

const DownSmall: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth="1.5">
    <path d="M5 2v6M2 5l3 3 3-3" />
  </svg>
);

const CircleSmall: React.FC<{ color: string }> = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={color} strokeWidth="1.5">
    <circle cx="5" cy="5" r="3.5" />
  </svg>
);

// ─── Step detail panels ──────────────────────────────────────────

const StepDeploy: React.FC = () => (
  <div style={{ padding: 14 }}>
    <DetailRow
      iconColor={c.cy} iconBg="rgba(47,191,177,0.1)"
      icon={<CheckSmall color={c.cy} />}
      name="Compile and deploy to any environment"
      desc="Remix VM, testnet, or mainnet. QuickDApp reads the ABI from the deployed contract."
    />
    <Separator />
    <DetailRow
      iconColor={c.bl} iconBg="rgba(91,156,245,0.1)"
      icon={<ClockSmall color={c.bl} />}
      name="Already deployed?"
      desc='Click "Create a dApp with your contracts" in the editor banner — it detects your deployed contracts automatically.'
    />
    <Separator />
    <DetailRow
      iconColor={c.am} iconBg="rgba(240,160,48,0.1)"
      icon={<WarnSmall color={c.am} />}
      name="Not deployed yet?"
      desc="No problem — Remix will compile your contract and take you to the Deploy & Run tab first."
    />
  </div>
);

const StepDescribe: React.FC = () => (
  <div style={{ padding: 14 }}>
    <DetailRow
      iconColor={c.pu} iconBg="rgba(155,125,255,0.1)"
      icon={<ArrowSmall color={c.pu} />}
      name="Two input modes"
      desc="Text/image: describe with words and upload a reference. Figma import: paste a Figma URL directly."
    />
    {/* Mini mockup of the generation dialog */}
    <div
      style={{
        marginTop: 10, borderRadius: 8, background: c.bg,
        border: "0.5px solid rgba(255,255,255,0.06)", overflow: "hidden",
      }}
    >
      {/* Window chrome */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "5px 8px",
          borderBottom: "0.5px solid rgba(255,255,255,0.04)",
        }}
      >
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#ff5f56" }} />
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#ffbd2e" }} />
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#27c93f" }} />
      </div>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          <span
            style={{
              padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: 500,
              background: "rgba(91,156,245,0.12)", color: c.bl,
              border: "0.5px solid rgba(91,156,245,0.2)",
            }}
          >
            Text / Image
          </span>
          <span
            style={{
              padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: 500,
              background: "rgba(255,255,255,0.03)", color: c.td,
              border: "0.5px solid rgba(255,255,255,0.04)",
            }}
          >
            Figma Import
          </span>
        </div>
        {/* Prompt input */}
        <div
          style={{
            height: 48, borderRadius: 6,
            background: "rgba(255,255,255,0.03)",
            border: "0.5px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "flex-start",
            padding: "6px 8px", fontSize: 10, color: c.td,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          &quot;Make it look very hip&quot;
        </div>
        {/* Upload + checkbox */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: c.td, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={c.tm} strokeWidth="1">
              <rect x="1" y="1" width="8" height="8" rx="1.5" />
              <path d="M3 6.5l2-2 1.5 1L8 3.5" />
            </svg>
            Upload image
          </span>
          <span style={{ fontSize: 9, color: c.td }}>optional</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            readOnly
            style={{ width: 10, height: 10, accentColor: c.bl, pointerEvents: "none" }}
          />
          <span style={{ fontSize: 9, color: c.td }}>Base Mini App (Farcaster Frame)</span>
        </div>
        {/* Generate button */}
        <div
          style={{
            height: 24, borderRadius: 5, width: 80, marginTop: 4,
            background: "rgba(107,219,138,0.12)",
            border: "0.5px solid rgba(107,219,138,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 500, color: c.gn,
          }}
        >
          Generate
        </div>
      </div>
    </div>
  </div>
);

const StepGenerate: React.FC = () => (
  <div style={{ padding: 14 }}>
    <DetailRow
      iconColor={c.bl} iconBg="rgba(91,156,245,0.1)"
      icon={<CircleSmall color={c.bl} />}
      name="Creates a new Workspace"
      desc="A dedicated Workspace is created for your dApp with all generated files — HTML, JS, CSS, everything."
    />
    <Separator />
    <DetailRow
      iconColor={c.bl} iconBg="rgba(91,156,245,0.1)"
      icon={<PlusSmall color={c.bl} />}
      name="Reads your contract's ABI"
      desc="Automatically wires up buttons, inputs, and displays for every public function in your contract."
    />
    <Separator />
    <DetailRow
      iconColor={c.am} iconBg="rgba(240,160,48,0.1)"
      icon={<WarnSmall color={c.am} />}
      name="Can take up to 2 minutes"
      desc='The AI model builds the full front-end. You&apos;ll see "Calling AI model..." while it works.'
    />
  </div>
);

const StepPreview: React.FC = () => (
  <div style={{ padding: 14 }}>
    <DetailRow
      iconColor={c.gn} iconBg="rgba(107,219,138,0.1)"
      icon={<BoxSmall color={c.gn} />}
      name="Live preview with wallet connection"
      desc="Interact with your dApp right inside Remix. Connect a wallet and test transactions."
    />
    <Separator />
    <DetailRow
      iconColor={c.pu} iconBg="rgba(155,125,255,0.1)"
      icon={<ArrowSmall color={c.pu} />}
      name="Iterate with AI"
      desc="Type instructions in the prompt bar to refine the design, change colors, add features — as many times as you want."
    />
    <Separator />
    <DetailRow
      iconColor={c.cy} iconBg="rgba(47,191,177,0.1)"
      icon={<DownSmall color={c.cy} />}
      name="Deploy to IPFS and register it under an ENS subdomain"
      desc="One click to publish your dApp permanently. Get a shareable link anyone can use, then register it under an ENS subdomain."
    />
    {/* Mini preview mockup */}
    <div
      style={{
        marginTop: 10, borderRadius: 8, background: c.bg,
        border: "0.5px solid rgba(255,255,255,0.06)", overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: "0.5px solid rgba(255,255,255,0.04)",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 500, color: c.tm }}>Your DApp</span>
        <div style={{ display: "flex", gap: 4 }}>
          <span
            style={{
              width: 16, height: 10, borderRadius: 2,
              background: "rgba(107,219,138,0.15)",
              border: "0.5px solid rgba(107,219,138,0.25)",
            }}
          />
          <span
            style={{
              width: 16, height: 10, borderRadius: 2,
              background: "rgba(255,255,255,0.04)",
              border: "0.5px solid rgba(255,255,255,0.06)",
            }}
          />
        </div>
      </div>
      <div
        style={{
          height: 80, display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 40 }}>
          {[20, 32, 24, 38, 16].map((h, i) => (
            <div
              key={i}
              style={{
                width: 12,
                height: h,
                borderRadius: "3px 3px 0 0",
                background: `rgba(107,219,138,${0.15 + i * 0.06})`,
              }}
            />
          ))}
        </div>
        <span
          style={{
            position: "absolute", bottom: 6, right: 10,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8, color: c.td,
          }}
        >
          connected to 0x5B38...ddC4
        </span>
      </div>
    </div>
  </div>
);

const STEP_PANELS: React.FC[] = [StepDeploy, StepDescribe, StepGenerate, StepPreview];

// ─── Pipeline step pill ──────────────────────────────────────────

interface PipeStepProps {
  index: number;
  label: string;
  active: boolean;
  onClick: () => void;
}

const PipeStep: React.FC<PipeStepProps> = ({ index, label, active, onClick }) => (
  <div
    onClick={onClick}
    style={{
      flex: 1, textAlign: "center", cursor: "pointer",
      position: "relative", padding: "12px 4px 14px",
      transition: "all 0.3s", borderRadius: 10,
      background: active ? "rgba(107,219,138,0.04)" : "transparent",
    }}
  >
    <div
      style={{
        width: 28, height: 28, borderRadius: 8,
        background: active ? "rgba(107,219,138,0.15)" : c.s1,
        border: `0.5px solid ${active ? "rgba(107,219,138,0.35)" : "rgba(255,255,255,0.08)"}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, fontWeight: 500,
        color: active ? c.gn : c.tm,
        transition: "all 0.3s", marginBottom: 6,
      }}
    >
      {index + 1}
    </div>
    <div
      style={{
        fontSize: 11,
        color: active ? c.tx : c.tm,
        transition: "color 0.3s", lineHeight: 1.3,
      }}
    >
      {label}
    </div>
  </div>
);

const PipeArrow: React.FC = () => (
  <div
    style={{
      width: 20, display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, paddingBottom: 16,
    }}
  >
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5">
      <path d="M3 6h6M7 4l2 2-2 2" />
    </svg>
  </div>
);

// ─── Main component ──────────────────────────────────────────────

const QuickDAppHelpModal: React.FC<QuickDAppHelpModalProps> = ({
  open,
  onClose,
  onStart,
  onShowReel,
}) => {
  const [activeStep, setActiveStep] = useState<StepIndex>(0);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleGotIt = useCallback(() => {
    if (onStart) {
      onStart();
    }
    onClose();
  }, [onStart, onClose]);

  if (!open) return null;

  const step = STEPS[activeStep];
  const StepPanel = STEP_PANELS[activeStep];

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Overlay */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.55)", zIndex: 9998,
          animation: "qdOverlayIn 0.3s ease",
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
            border: "0.5px solid rgba(107,219,138,0.15)",
            width: "100%", maxWidth: 580,
            maxHeight: "90vh", overflowY: "auto",
            animation: "qdModalIn 0.5s cubic-bezier(0.34,1.56,0.64,1)",
            pointerEvents: "auto",
          }}
        >
          {/* ── Header ── */}
          <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: c.tx, display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={c.gn} strokeWidth="1.5" strokeLinecap="round">
                <rect x="3" y="3" width="14" height="14" rx="3" />
                <path d="M8 7l4 3-4 3" />
              </svg>
              QuickDApp
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9, letterSpacing: 1.5,
                  textTransform: "uppercase" as const,
                  color: c.gn,
                  background: "rgba(107,219,138,0.12)",
                  padding: "3px 10px", borderRadius: 5,
                  border: "0.5px solid rgba(107,219,138,0.25)",
                }}
              >
                Beta Perk
              </span>
            </h2>
            <CloseButton onClick={handleClose} />
          </div>

          {/* ── Subtitle ── */}
          <div style={{ padding: "10px 24px 0", fontSize: 13, color: c.tm, lineHeight: 1.6 }}>
            Turn any deployed contract into a full dApp UI. RemixAI generates the front-end — you just describe what you want.
          </div>

          {/* ── Pipeline ── */}
          <div style={{ padding: "20px 24px 0" }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10, letterSpacing: 1.5,
                textTransform: "uppercase" as const,
                color: c.td, marginBottom: 12,
              }}
            >
              How it works
            </div>
            <div style={{ display: "flex", alignItems: "stretch" }}>
              {STEPS.map((s, i) => (
                <React.Fragment key={i}>
                  <PipeStep
                    index={i}
                    label={s.label}
                    active={activeStep === i}
                    onClick={() => setActiveStep(i as StepIndex)}
                  />
                  {i < STEPS.length - 1 && <PipeArrow />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* ── Detail panel ── */}
          <div
            key={activeStep}
            style={{
              margin: "16px 24px 0", borderRadius: 12,
              background: c.s1,
              border: "0.5px solid rgba(255,255,255,0.06)",
              overflow: "hidden",
              animation: "qdPanelIn 0.3s ease",
            }}
          >
            <PanelHeader
              dotColor={step.dotColor}
              title={step.title}
              tagText={step.tagText}
              tagColor={step.tagColor}
            />
            <StepPanel />
          </div>

          {/* ── Tip box ── */}
          <div
            style={{
              margin: "14px 24px 0", padding: "10px 14px", borderRadius: 8,
              background: "rgba(107,219,138,0.06)",
              border: "0.5px solid rgba(107,219,138,0.12)",
              display: "flex", alignItems: "flex-start", gap: 10,
              fontSize: 11, color: c.tm, lineHeight: 1.5,
            }}
          >
            <svg
              width="14" height="14" viewBox="0 0 14 14" fill="none"
              stroke={c.gn} strokeWidth="1.5"
              style={{ flexShrink: 0, marginTop: 1 }}
            >
              <circle cx="7" cy="7" r="5.5" />
              <path d="M7 4.5v3M7 9.5h.01" />
            </svg>
            <span>
              <strong style={{ color: c.gn, fontWeight: 500 }}>Remix VM works great for testing.</strong>{" "}
              Deploy to Remix VM first to try QuickDApp without spending gas. When you&apos;re happy,
              redeploy to a testnet or mainnet and generate again.
            </span>
          </div>

          {/* ── Footer ── */}
          <div
            style={{
              padding: "14px 24px", marginTop: 14,
              borderTop: "0.5px solid rgba(255,255,255,0.04)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {onShowReel && (
                <AllFeaturesButton onClick={onShowReel} />
              )}
              <span style={{ fontSize: 11, color: c.td, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke={c.td} strokeWidth="1.5">
                  <rect x="3" y="3" width="10" height="10" rx="2" />
                  <path d="M7 7l3 2-3 2" />
                </svg>
                Contract to dApp in minutes
              </span>
            </div>
            <GotItButton onClick={handleGotIt} />
          </div>
        </div>
      </div>
    </>
  );
};

export default QuickDAppHelpModal;
export type { QuickDAppHelpModalProps, StepIndex };

// ─── Usage examples ──────────────────────────────────────────────
//
//  import QuickDAppHelpModal from './QuickDAppHelpModal'
//
//  // ── Basic usage ──
//  const [showQD, setShowQD] = useState(false)
//  <QuickDAppHelpModal open={showQD} onClose={() => setShowQD(false)} />
//
//  // ── With start action (opens QuickDApp plugin) ──
//  <QuickDAppHelpModal
//    open={showQD}
//    onClose={() => setShowQD(false)}
//    onStart={() => activatePanel('quick-dapp-v2')}
//  />
