import { useState, useCallback, useRef } from "react";
import { useNavigate, useLocation, matchPath } from "react-router-dom";
import { useClawset } from "../context/ClawsetContext";
import { useWebviewLayout } from "../context/WebviewLayoutContext";

const COLLAPSED_WIDTH = 48;
const EXPANDED_MIN_WIDTH = 280;
const EXPANDED_MAX_WIDTH = 600;

interface ContextChatProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** Derive active context from URL */
function useRouteContext() {
  const location = useLocation();
  const instanceMatch = matchPath("/instance/:instanceName/*", location.pathname);
  if (instanceMatch) {
    return { type: "instance" as const, instanceName: instanceMatch.params.instanceName! };
  }
  return { type: "system" as const, instanceName: null };
}

export function ContextChat({ collapsed, onToggle }: ContextChatProps) {
  const { instances } = useClawset();
  const { updateBounds } = useWebviewLayout();
  const navigate = useNavigate();
  const routeContext = useRouteContext();
  const [message, setMessage] = useState("");
  const [panelWidth, setPanelWidth] = useState(EXPANDED_MIN_WIDTH);
  const isDragging = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !panelRef.current) return;
      const newWidth = Math.min(EXPANDED_MAX_WIDTH, Math.max(EXPANDED_MIN_WIDTH, ev.clientX));
      // Direct DOM manipulation — getBoundingClientRect is instantly correct
      panelRef.current.style.width = `${newWidth}px`;
      updateBounds();
    };

    const onMouseUp = (ev: MouseEvent) => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Sync React state with final width
      const finalWidth = Math.min(EXPANDED_MAX_WIDTH, Math.max(EXPANDED_MIN_WIDTH, ev.clientX));
      setPanelWidth(finalWidth);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const isSystem = routeContext.type === "system";
  const activeContextName = isSystem ? "system" : routeContext.instanceName;

  const switchContext = (ctx: string) => {
    if (ctx === "system") {
      navigate("/system/plugins");
    } else {
      navigate(`/instance/${ctx}`);
    }
  };

  // ─── Collapsed: vertical icon strip ─────────────────────────
  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center gap-1 py-3 bg-default-50 border-r border-divider flex-shrink-0 select-none"
        style={{ width: COLLAPSED_WIDTH }}
      >
        {/* System icon */}
        <button
          onClick={() => switchContext("system")}
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
            isSystem
              ? "bg-primary text-primary-foreground"
              : "bg-default-100 text-default-500 hover:bg-default-200"
          }`}
          title="System"
        >
          ⚙
        </button>

        {/* Divider */}
        <div className="w-5 h-px bg-divider my-1" />

        {/* Instance icons */}
        {instances.map((inst) => (
          <button
            key={inst.name}
            onClick={() => switchContext(inst.name)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase transition-colors relative ${
              activeContextName === inst.name
                ? "bg-primary text-primary-foreground"
                : "bg-default-100 text-default-500 hover:bg-default-200"
            }`}
            title={inst.name}
          >
            {inst.name.slice(0, 2)}
            {/* Status dot */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-default-50 ${
                inst.status === "Running" ? "bg-success" : "bg-danger"
              }`}
            />
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Expand button */}
        <button
          onClick={onToggle}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-default-400 hover:text-default-600 hover:bg-default-100 transition-colors"
          title="Expand panel"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    );
  }

  // ─── Expanded: full chat panel ──────────────────────────────
  return (
    <div
      ref={panelRef}
      className="flex flex-col bg-default-50 border-r border-divider flex-shrink-0 select-none relative"
      style={{ width: panelWidth, minWidth: EXPANDED_MIN_WIDTH, maxWidth: EXPANDED_MAX_WIDTH }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-10"
      />
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-divider">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-default-600 uppercase tracking-wider">
            {isSystem ? "System" : activeContextName}
          </span>
          {!isSystem && (
            <span
              className={`w-2 h-2 rounded-full ${
                instances.find((i) => i.name === activeContextName)?.status === "Running"
                  ? "bg-success"
                  : "bg-danger"
              }`}
            />
          )}
        </div>
        <button
          onClick={onToggle}
          className="w-6 h-6 rounded flex items-center justify-center text-default-400 hover:text-default-600 hover:bg-default-100 transition-colors"
          title="Collapse panel"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Context selector (inline list) */}
      <div className="flex flex-col gap-0.5 px-2 py-2 border-b border-divider">
        <button
          onClick={() => switchContext("system")}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
            isSystem
              ? "bg-primary/10 text-primary font-semibold"
              : "text-default-500 hover:bg-default-100"
          }`}
        >
          <span className="w-5 h-5 rounded flex items-center justify-center bg-default-200 text-[10px]">⚙</span>
          System
        </button>
        {instances.map((inst) => (
          <button
            key={inst.name}
            onClick={() => switchContext(inst.name)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
              activeContextName === inst.name
                ? "bg-primary/10 text-primary font-semibold"
                : "text-default-500 hover:bg-default-100"
            }`}
          >
            <span className="w-5 h-5 rounded flex items-center justify-center bg-default-200 text-[10px] uppercase font-bold">
              {inst.name.slice(0, 2)}
            </span>
            <span className="flex-1 truncate">{inst.name}</span>
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                inst.status === "Running" ? "bg-success" : "bg-danger"
              }`}
            />
          </button>
        ))}
      </div>

      {/* Chat messages area (placeholder) */}
      <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-2">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
          <span className="text-default-300 text-2xl">
            {isSystem ? "⚙" : "💬"}
          </span>
          <p className="text-[11px] text-default-400 leading-relaxed">
            {isSystem
              ? "Ask the Clawset assistant to manage plugins, start instances, or prepare context."
              : `Chat with the agent on ${activeContextName}.`}
          </p>
        </div>
      </div>

      {/* Message input */}
      <div className="px-2 py-2 border-t border-divider">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && message.trim()) {
                // TODO: Send message via channel API
                setMessage("");
              }
            }}
            placeholder={isSystem ? "Ask Clawset..." : "Message agent..."}
            className="flex-1 bg-default-100 border border-default-200 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-default-400 outline-none focus:border-primary/50 transition-colors"
          />
          <button
            onClick={() => {
              if (message.trim()) {
                // TODO: Send message via channel API
                setMessage("");
              }
            }}
            disabled={!message.trim()}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-30 transition-opacity"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
