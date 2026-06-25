import React, { useState, useCallback, useRef, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────

type ServiceKey = "alchemy" | "etherscan" | "thegraph" | "ethskills";

interface ServiceConfig {
  key: ServiceKey;
  name: string;
  color: string;
  desc: string;
  example: string;
  prompt: string;
  mockReply: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface McpHelpModalProps {
  /** Whether the modal is currently visible. */
  open: boolean;
  /** Called when the user closes the modal. */
  onClose: () => void;
  /** Called when the user wants to go back to the feature reel. */
  onShowReel?: () => void;
  /**
   * Called when the user clicks "Try this" — receives the prompt string.
   * Wire this to your AI assistant's sendPrompt to execute for real.
   * If omitted, the modal shows a simulated chat response instead.
   */
  onSendPrompt?: (prompt: string) => void;
  /**
   * If true, clicking "Try this" will also close the modal
   * (useful when onSendPrompt is wired to the real AI panel).
   */
  closeOnTry?: boolean;
}

interface NavArrowProps {
  direction: "left" | "right";
  onClick: () => void;
}

// ─── Service data ────────────────────────────────────────────────

const SERVICES: ServiceConfig[] = [
  {
    key: "alchemy",
    name: "Alchemy",
    color: "#5b9cf5",
    desc: "Query balances, transactions, token metadata, and gas prices from any EVM chain.",
    example: '"What\'s the ETH balance of my deploy wallet?"',
    prompt: "Use Alchemy to check the ETH balance and recent transactions of 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
    mockReply:
      'Querying Alchemy for <span class="hlc">0x742d...bD18</span>...\n\n' +
      'Balance: <span class="hlc">4.82 ETH</span> ($12,450)\n\n' +
      "Last 3 transactions:\n" +
      "  1. Contract deploy 0xa1f3...9c2e (2h ago)\n" +
      "  2. Sent 0.5 ETH to 0x3a2f...8c1d (1d ago)\n" +
      "  3. Received 5 ETH from 0x7b1c...4e2a (3d ago)",
  },
  {
    key: "etherscan",
    name: "Etherscan",
    color: "#f0a030",
    desc: "Verify contracts, pull ABIs, check source code, and inspect on-chain events.",
    example: '"Verify my contract at 0x1234...abcd on Sepolia"',
    prompt:
      "Use Etherscan to verify the contract I just deployed on Sepolia and show me the verification status",
    mockReply:
      'Connecting to Etherscan API for <span class="hlc">Sepolia</span>...\n\n' +
      'Contract <span class="hlc">0x1234...abcd</span> found.\n' +
      "Source: MyToken.sol (Solidity 0.8.20)\n" +
      'Compiler match: <span class="hlc">verified</span>\n' +
      "License: MIT\n\n" +
      "The contract is now verified and publicly readable on Sepolia Etherscan.",
  },
  {
    key: "thegraph",
    name: "The Graph",
    color: "#9b7dff",
    desc: "Search and query subgraphs for indexed protocol data — Uniswap, Aave, ENS, and more.",
    example: '"Show me the top 5 Uniswap V3 pools by TVL"',
    prompt:
      "Use The Graph to query the top 5 Uniswap V3 pools by total value locked and show their token pairs",
    mockReply:
      'Querying <span class="hlc">Uniswap V3 subgraph</span>...\n\n' +
      "Top pools by TVL:\n" +
      '  1. USDC/ETH (0.05%) — <span class="hlc">$412M</span>\n' +
      '  2. WBTC/ETH (0.3%) — <span class="hlc">$287M</span>\n' +
      '  3. USDC/USDT (0.01%) — <span class="hlc">$198M</span>\n' +
      '  4. DAI/USDC (0.01%) — <span class="hlc">$145M</span>\n' +
      '  5. ETH/USDT (0.3%) — <span class="hlc">$112M</span>',
  },
  {
    key: "ethskills",
    name: "ethSkills",
    color: "#6bdb8a",
    desc: "Interactive Solidity lessons — learn by deploying and calling real contracts step by step.",
    example: '"Start a lesson on ERC-721 basics"',
    prompt:
      "Start an ethSkills lesson on ERC-721 NFT basics. Walk me through creating and minting my first NFT contract",
    mockReply:
      'Loading <span class="hlc">ERC-721 lesson</span> from ethSkills...\n\n' +
      "Lesson 1: Your first NFT contract\n\n" +
      'I\'ve created <span class="hlc">MyNFT.sol</span> in your workspace with a basic ERC-721 template. Let\'s start by:\n\n' +
      "  1. Understanding the mint function\n" +
      "  2. Deploying to the Remix VM\n" +
      "  3. Minting your first token\n\n" +
      "Ready? Open the file and hit Compile.",
  },
];

// ─── Keyframes ───────────────────────────────────────────────────

const KEYFRAMES = `
  @keyframes mcpModalIn {
    from { opacity: 0; transform: scale(0.92) translateY(20px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes mcpParticle {
    0%   { left: 0; opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { left: calc(100% - 6px); opacity: 0; }
  }
  @keyframes mcpDotPulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.4; }
  }
  @keyframes mcpMsgIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes mcpTyping {
    0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
    30%           { opacity: 1;   transform: translateY(-4px); }
  }
  @keyframes mcpOverlayIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

// ─── Color helpers ───────────────────────────────────────────────

const c = {
  bg: "#1a1a2e",
  s1: "#222240",
  s2: "#2a2a4a",
  cy: "#2fbfb1",
  cyd: "rgba(47,191,177,0.12)",
  tx: "#e0e0ec",
  tm: "#8888aa",
  td: "#5c5c7a",
  pu: "#9b7dff",
  gn: "#6bdb8a",
};

// ─── Sub-components ──────────────────────────────────────────────

const FlowParticle: React.FC<{ delay: string }> = ({ delay }) => (
  <div
    style={{
      position: "absolute",
      top: -2,
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: c.cy,
      opacity: 0,
      animation: `mcpParticle 2.5s ease-in-out infinite`,
      animationDelay: delay,
    }}
  />
);

const FlowConnector: React.FC<{ delay: string }> = ({ delay }) => (
  <div style={{ width: 48, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
    <div style={{ height: 1.5, width: "100%", position: "relative", overflow: "visible" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.06)", borderRadius: 1 }} />
      <FlowParticle delay={delay} />
    </div>
  </div>
);

interface FlowNodeProps {
  label: string;
  iconColor: string;
  bgAlpha?: string;
  borderAlpha?: string;
  icon: React.ReactNode;
}

const FlowNode: React.FC<FlowNodeProps> = ({ label, iconColor, bgAlpha = "1a", borderAlpha = "40", icon }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative", zIndex: 2 }}>
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `${iconColor}${bgAlpha}`,
        border: `0.5px solid ${iconColor}${borderAlpha}`,
        transition: "all 0.3s",
      }}
    >
      {icon}
    </div>
    <span style={{ fontSize: 11, color: c.tm, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>
      {label}
    </span>
  </div>
);

const TypingIndicator: React.FC = () => (
  <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
    {[0, 0.2, 0.4].map((d, i) => (
      <span
        key={i}
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: c.tm,
          animation: "mcpTyping 1.4s infinite",
          animationDelay: `${d}s`,
        }}
      />
    ))}
  </div>
);

interface ChatBubbleProps {
  msg: ChatMessage;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ msg }) => (
  <div style={{ display: "flex", gap: 8, animation: "mcpMsgIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 500,
        background: msg.role === "user" ? "rgba(155,125,255,0.15)" : c.cyd,
        color: msg.role === "user" ? c.pu : c.cy,
      }}
    >
      {msg.role === "user" ? (
        "You"
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={c.cy} strokeWidth="1.5">
          <rect x="2" y="2" width="12" height="12" rx="3" />
          <path d="M5 8h6" />
        </svg>
      )}
    </div>
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.6,
        color: msg.role === "user" ? c.tx : c.tm,
        maxWidth: "85%",
      }}
      dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, "<br>") }}
    />
  </div>
);

// ─── Service card ────────────────────────────────────────────────

interface ServiceCardProps {
  service: ServiceConfig;
  active: boolean;
  onSelect: () => void;
  onTry: () => void;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ service, active, onSelect, onTry }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? "rgba(47,191,177,0.06)" : hovered ? c.s2 : c.s1,
        border: `0.5px solid ${active ? "rgba(47,191,177,0.4)" : hovered ? "rgba(47,191,177,0.3)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 12,
        padding: 14,
        cursor: "pointer",
        transition: "all 0.3s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: service.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: c.tx }}>{service.name}</span>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: active ? c.cy : c.td,
            marginLeft: "auto",
            transition: "background 0.3s",
          }}
        />
      </div>

      {/* Description */}
      <div style={{ fontSize: 11, color: c.tm, lineHeight: 1.5, marginBottom: 10 }}>{service.desc}</div>

      {/* Example prompt */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: c.td,
          background: "rgba(255,255,255,0.03)",
          borderRadius: 6,
          padding: "6px 8px",
          lineHeight: 1.5,
          marginBottom: 10,
          border: "0.5px solid rgba(255,255,255,0.04)",
        }}
      >
        {service.example}
      </div>

      {/* Try button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTry();
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 11,
          fontWeight: 500,
          color: c.cy,
          background: c.cyd,
          border: "0.5px solid rgba(47,191,177,0.2)",
          borderRadius: 6,
          padding: "5px 12px",
          cursor: "pointer",
          transition: "all 0.2s",
          fontFamily: "'DM Sans', sans-serif",
        }}
        onMouseEnter={(e) => {
          const btn = e.currentTarget;
          btn.style.background = "rgba(47,191,177,0.2)";
          btn.style.borderColor = "rgba(47,191,177,0.4)";
        }}
        onMouseLeave={(e) => {
          const btn = e.currentTarget;
          btn.style.background = c.cyd;
          btn.style.borderColor = "rgba(47,191,177,0.2)";
        }}
      >
        Demo
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </button>
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

// ─── Main component ──────────────────────────────────────────────

const McpHelpModal: React.FC<McpHelpModalProps> = ({
  open,
  onClose,
  onShowReel,
  onSendPrompt,
  closeOnTry = false,
}) => {
  const [activeService, setActiveService] = useState<ServiceKey | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      if (replyTimeout.current) clearTimeout(replyTimeout.current);
    };
  }, []);

  const handleTry = useCallback(
    (service: ServiceConfig) => {
      // If real sendPrompt is wired, use it
      if (onSendPrompt) {
        onSendPrompt(service.prompt);
        if (closeOnTry) onClose();
        return;
      }

      // Otherwise simulate in the preview chat
      setActiveService(service.key);
      setChatMessages([{ role: "user", content: service.prompt }]);
      setIsTyping(true);

      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      if (replyTimeout.current) clearTimeout(replyTimeout.current);

      replyTimeout.current = setTimeout(() => {
        setIsTyping(false);
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: service.mockReply },
        ]);
      }, 2000);
    },
    [onSendPrompt, closeOnTry, onClose]
  );

  const handleSelect = useCallback((key: ServiceKey) => {
    setActiveService(key);
  }, []);

  if (!open) return null;

  const activeConfig = SERVICES.find((s) => s.key === activeService);
  const serviceIconColor = activeConfig?.color ?? "#5b9cf5";

  return (
    <>
      <style>{KEYFRAMES}</style>
      <style>{`.hlc{color:${c.cy};font-family:'JetBrains Mono',monospace;font-size:11px}`}</style>

      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 9998,
          animation: "mcpOverlayIn 0.3s ease",
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
            maxWidth: 580,
            maxHeight: "90vh",
            overflowY: "auto",
            animation: "mcpModalIn 0.5s cubic-bezier(0.34,1.56,0.64,1)",
            pointerEvents: "auto",
          }}
        >
          {/* ── Header ── */}
          <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, color: c.tx, display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={c.cy} strokeWidth="1.5" strokeLinecap="round">
                <circle cx="10" cy="10" r="8" />
                <path d="M10 6v4l2.5 2.5" />
              </svg>
              MCP Integrations
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  letterSpacing: 1.5,
                  textTransform: "uppercase" as const,
                  color: c.cy,
                  background: c.cyd,
                  padding: "3px 10px",
                  borderRadius: 5,
                  border: "0.5px solid rgba(47,191,177,0.25)",
                }}
              >
                Connected
              </span>
            </h2>
            <div
              onClick={onClose}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: c.s1,
                border: "0.5px solid rgba(255,255,255,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: c.tm,
                fontSize: 16,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = c.s2;
                el.style.color = c.tx;
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = c.s1;
                el.style.color = c.tm;
              }}
            >
              &times;
            </div>
          </div>

          {/* ── Subtitle ── */}
          <div style={{ padding: "8px 24px 0", fontSize: 13, color: c.tm, lineHeight: 1.6 }}>
            The RemixAI Assistant can now query on-chain data, verify contracts, and search subgraphs in real time. Click any service below to try it.
          </div>

          {/* ── Flow diagram ── */}
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FlowNode
                label="You"
                iconColor={c.pu}
                icon={
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={c.pu} strokeWidth="1.5">
                    <circle cx="10" cy="7" r="4" />
                    <path d="M3 18c0-4 3.5-7 7-7s7 3 7 7" />
                  </svg>
                }
              />
              <FlowConnector delay="0s" />
              <FlowNode
                label="RemixAI"
                iconColor={c.cy}
                icon={
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={c.cy} strokeWidth="1.5">
                    <rect x="3" y="3" width="14" height="14" rx="3" />
                    <path d="M7 10h6M10 7v6" />
                  </svg>
                }
              />
              <FlowConnector delay="0.8s" />
              <FlowNode
                label={activeConfig?.name ?? "MCP service"}
                iconColor={serviceIconColor}
                icon={
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={serviceIconColor} strokeWidth="1.5">
                    <path d="M4 10c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6" />
                    <circle cx="10" cy="10" r="2" />
                  </svg>
                }
              />
            </div>
          </div>

          {/* ── Service cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 24px 20px" }}>
            {SERVICES.map((svc) => (
              <ServiceCard
                key={svc.key}
                service={svc}
                active={activeService === svc.key}
                onSelect={() => handleSelect(svc.key)}
                onTry={() => handleTry(svc)}
              />
            ))}
          </div>

          {/* ── Simulated chat (only when no real onSendPrompt) ── */}
          {!onSendPrompt && (
            <div
              style={{
                margin: "0 24px 20px",
                borderRadius: 12,
                background: c.s1,
                border: "0.5px solid rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              {/* Chat header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                  fontSize: 12,
                  fontWeight: 500,
                  color: c.tm,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: c.gn,
                    animation: "mcpDotPulse 2s ease-in-out infinite",
                  }}
                />
                RemixAI Assistant
              </div>

              {/* Chat body */}
              <div style={{ padding: 14, minHeight: 120, display: "flex", flexDirection: "column", gap: 10 }}>
                {chatMessages.length === 0 && !isTyping ? (
                  <div style={{ fontSize: 12, color: c.td, textAlign: "center", padding: "28px 0", fontStyle: "italic" }}>
                    Click &ldquo;Try this&rdquo; on any service above to see it in action
                  </div>
                ) : (
                  <>
                    {chatMessages.map((msg, i) => (
                      <ChatBubble key={i} msg={msg} />
                    ))}
                    {isTyping && (
                      <div style={{ display: "flex", gap: 8, animation: "mcpMsgIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
                        <div
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: c.cyd,
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={c.cy} strokeWidth="1.5">
                            <rect x="2" y="2" width="12" height="12" rx="3" />
                            <path d="M5 8h6" />
                          </svg>
                        </div>
                        <TypingIndicator />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div
            style={{
              padding: "14px 24px",
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
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 5.5V8l2 1.5" />
                </svg>
                MCP runs queries in real time
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: c.tm,
                background: c.s1,
                border: "0.5px solid rgba(255,255,255,0.08)",
                padding: "6px 16px",
                borderRadius: 6,
                cursor: "pointer",
                transition: "all 0.2s",
                fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget;
                btn.style.background = c.s2;
                btn.style.color = c.tx;
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget;
                btn.style.background = c.s1;
                btn.style.color = c.tm;
              }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default McpHelpModal;
export type { McpHelpModalProps, ServiceKey, ServiceConfig };

// ─── Usage examples ──────────────────────────────────────────────
//
//  import McpHelpModal from './McpHelpModal'
//
//  // ── Demo mode (simulated chat, no real AI) ──
//  const [showMcp, setShowMcp] = useState(false)
//  <McpHelpModal open={showMcp} onClose={() => setShowMcp(false)} />
//
//  // ── Real integration (sends prompt to AI panel) ──
//  <McpHelpModal
//    open={showMcp}
//    onClose={() => setShowMcp(false)}
//    closeOnTry
//    onSendPrompt={(prompt) => {
//      remixAI.sendPrompt(prompt)
//    }}
//  />
