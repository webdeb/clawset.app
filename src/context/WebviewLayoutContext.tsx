import { createContext, useContext, useRef, useState, useEffect, ReactNode, RefObject } from "react";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";

interface PhysicalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WebviewLayoutContextType {
  // The layout container where the Webview should be rendered
  containerRef: RefObject<HTMLDivElement | null>;
  // The actively running Webview instance, so the Layout can manipulate it during resizes
  activeWebviewRef: React.MutableRefObject<Webview | null>;
  // Centralised single-source-of-truth mathematical calculation for physics pixels
  getPhysicalBounds: () => PhysicalBounds | null;
  // Function to imperatively trigger a bounds update onto the active webview
  updateBounds: () => void;
  // Boolean indicating whether the OS coordinates mappings have loaded
  metricsReady: boolean;
}

const WebviewLayoutContext = createContext<WebviewLayoutContextType | null>(null);

export function WebviewLayoutProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeWebviewRef = useRef<Webview | null>(null);
  
  const [metricsReady, setMetricsReady] = useState(false);
  const screenMetrics = useRef({ scaleFactor: 1, offsetX: 0, offsetY: 0 });

  // Load Tauri OS metrics on mount since these are async
  useEffect(() => {
    let isMounted = true;
    async function initMetrics() {
      const appWindow = getCurrentWindow();
      
      // Calculate the exact height of the native macOS titlebar
      // by comparing the outer window screen position to the inner client area screen position.
      const scaleFactor = await appWindow.scaleFactor();
      const innerPos = await appWindow.innerPosition();
      const outerPos = await appWindow.outerPosition();
      
      if (!isMounted) return;

      // The difference between the inner screen Y and outer screen Y is the exact titlebar height in physical pixels.
      // We divide by scaleFactor to convert it back to CSS logical pixels.
      screenMetrics.current = {
        scaleFactor,
        offsetX: (innerPos.x - outerPos.x) / scaleFactor,
        offsetY: (innerPos.y - outerPos.y) / scaleFactor,
      };
      setMetricsReady(true);
    }
    initMetrics();
    return () => { isMounted = false; };
  }, []);

  // EXACTLY ONE PLACE for computation logic.
  // We use pure CSS logical pixels which Tauri's newer webview implementations map 1:1 automatically.
  // However, on macOS, the webview origin starts ABOVE the title bar, so we must add outer/inner offset!
  const getPhysicalBounds = (): PhysicalBounds | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const { offsetX, offsetY } = screenMetrics.current;
    
    console.log("getPhysicalBounds", { rect, offsetX, offsetY });

    return {
      x: Math.round(rect.left) + offsetX,
      y: Math.round(rect.top) + offsetY + 32,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };

  const updateBounds = () => {
    const wv = activeWebviewRef.current;
    if (!wv) return;
    
    const bounds = getPhysicalBounds();
    if (!bounds) return;

    wv.setPosition(new LogicalPosition(bounds.x, bounds.y)).catch(() => {});
    wv.setSize(new LogicalSize(bounds.width, bounds.height)).catch(() => {});
  };

  return (
    <WebviewLayoutContext.Provider
      value={{
        containerRef,
        activeWebviewRef,
        getPhysicalBounds,
        updateBounds,
        metricsReady,
      }}
    >
      {children}
    </WebviewLayoutContext.Provider>
  );
}

export function useWebviewLayout() {
  const context = useContext(WebviewLayoutContext);
  if (!context) {
    throw new Error("useWebviewLayout must be used within a WebviewLayoutProvider");
  }
  return context;
}
