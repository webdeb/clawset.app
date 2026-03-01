import { useEffect } from "react";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Spinner } from "@heroui/react";
import { useClawset } from "../context/ClawsetContext";
import { useWebviewLayout } from "../context/WebviewLayoutContext";

// ─── Webview cache ─────────────────────────────────────────
// Keeps webviews alive across navigations to avoid reloading.
// Key: viewId, Value: { webview, url }
const webviewCache = new Map<string, { wv: Webview; url: string }>();

const OFF_SCREEN = -9999;

function hideWebview(wv: Webview) {
  wv.setPosition(new LogicalPosition(OFF_SCREEN, OFF_SCREEN)).catch(() => {});
}


// Hide all cached webviews (called when navigating away from any view)
function hideAllCachedWebviews(activeWebviewRef: React.MutableRefObject<Webview | null>) {
  activeWebviewRef.current = null;
  for (const { wv } of webviewCache.values()) {
    hideWebview(wv);
  }
}

interface ViewContentProps {
  url: string;
  viewId: string;
}

/**
 * Generic webview component — renders any agent-registered view.
 * Uses a module-level cache to keep webviews alive across navigations.
 */
export function ViewContent({ url, viewId }: ViewContentProps) {
  const { containerRef, activeWebviewRef, getPhysicalBounds, updateBounds, metricsReady } = useWebviewLayout();

  useEffect(() => {
    if (!metricsReady) return;

    let resizeObserver: ResizeObserver | null = null;
    let currentWv: Webview | null = null;

    const setupWebview = async () => {
      if (!containerRef.current) return;

      const cached = webviewCache.get(viewId);
      
      // Hide all other cached webviews first
      hideAllCachedWebviews(activeWebviewRef);

      const bounds = getPhysicalBounds();
      if (!bounds) return;

      if (cached && cached.url === url) {
        // Reuse cached webview
        currentWv = cached.wv;
        activeWebviewRef.current = currentWv;
        // Trigger the central position update!
        updateBounds();
      } else {
        // Close stale cached webview if URL changed
        if (cached) {
          cached.wv.close().catch(() => {});
          webviewCache.delete(viewId);
        }

        const label = `clawset-view-${viewId}`;

        try {
          // Recovery: check if a webview with this label already exists (e.g. after HMR)
          const existing = await Webview.getByLabel(label);
          if (existing) {
            existing.close().catch(() => {});
            // Small delay to let Tauri clean up
            await new Promise(r => setTimeout(r, 100));
          }

          // Re-check after awaits
          if (!containerRef.current) return;
          const freshBounds = getPhysicalBounds();
          if (!freshBounds) return;

          const appWindow = getCurrentWindow();
          const wv = new Webview(appWindow, label, {
            url,
            x: freshBounds.x,
            y: freshBounds.y,
            width: freshBounds.width,
            height: freshBounds.height,
            transparent: false,
          });

          await wv.once("tauri://created", () => {
            console.log(`View [${viewId}] webview created at`, url);
          });

          currentWv = wv;
          webviewCache.set(viewId, { wv, url });
        } catch (e) {
          console.error(`Failed to spawn view [${viewId}] webview:`, e);
          return;
        }
      }

      // Store active webview for direct manipulation in AppLayout context
      activeWebviewRef.current = currentWv;

      resizeObserver = new ResizeObserver(updateBounds);
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      window.addEventListener("resize", updateBounds);
    };

    setupWebview();

    return () => {
      // On unmount: hide the webview (don't close it) for instant disappearance
      if (currentWv) {
        hideWebview(currentWv);
      }
      window.removeEventListener("resize", updateBounds);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [url, viewId, metricsReady]);

  if (!metricsReady) {
    return (
      <div className="w-full h-full bg-background flex flex-col items-center justify-center">
        <span className="text-default-400 text-sm animate-pulse">Calculating layout map...</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full bg-background flex flex-col items-center justify-center">
      <span className="text-default-400 text-sm animate-pulse">Loading view...</span>
    </div>
  );
}

/**
 * Route wrapper: resolves viewId from URL params → instance IP + view port → ViewContent.
 * Also gates on auth requirements.
 */
export function ViewRouteWrapper({ viewId }: { viewId: string }) {
  const { instances, isProviderAvailable, loading } = useClawset();

  // Get instanceName from URL: /instance/:instanceName/:viewId
  const pathname = window.location.hash.replace("#", "");
  const parts = pathname.split("/");
  const instanceName = parts[2]; // ["", "instance", "name", "viewId"]
  const instance = instances.find(i => i.name === instanceName) || null;

  if (loading || !instance) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-background">
        <Spinner size="lg" color="current" />
        <p className="text-primary font-medium">Initializing...</p>
      </div>
    );
  }

  if (!isProviderAvailable) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8 text-center flex-col gap-4">
        <h2 className="text-xl font-bold">No Instance Provider</h2>
        <p className="text-default-500">Install an instance provider plugin to get started.</p>
      </div>
    );
  }

  if (instance.status !== "Running" || !instance.ip) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-default-500 gap-4">
        <div className="w-16 h-16 bg-default-100 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-default-400"><path d="M12 22v-4"/><path d="M12 6V2"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.9 4.9 2.9 2.9"/><path d="m16.2 16.2 2.9 2.9"/><path d="m4.9 19.1 2.9-2.9"/><path d="m16.2 7.8 2.9-2.9"/></svg>
        </div>
        <p>Instance <b>{instance.name}</b> is {instance.status.toLowerCase()}.</p>
      </div>
    );
  }

  // Find the view from the instance's registered views
  const view = instance.views?.find(v => v.id === viewId);

  if (!view) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-default-500 gap-4">
        <h2 className="text-lg font-bold">View not found</h2>
        <p className="text-sm">View <code className="bg-default-100 px-2 py-0.5 rounded">{viewId}</code> is not registered.</p>
      </div>
    );
  }

  const token = instance.openclawConfig?.gateway?.auth?.token;
  const url = `http://${instance.ip}:${view.port}${view.path || "/"}${token && view.id === "gateway" ? `#token=${token}` : ""}`;

  return <ViewContent url={url} viewId={viewId} />;
}

