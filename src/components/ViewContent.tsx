import { useRef, useEffect } from "react";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { Spinner } from "@heroui/react";
import { useClawset } from "../context/ClawsetContext";

interface ViewContentProps {
  url: string;
  viewId: string;
  navbarHeight: number;
}

/**
 * Generic webview component — renders any agent-registered view.
 * Replaces the hardcoded DashboardContent and AppHubContent.
 */
export function ViewContent({ url, viewId, navbarHeight }: ViewContentProps) {
  const webviewRef = useRef<Webview | null>(null);

  useEffect(() => {
    let resizeListener: () => void;

    const spawnWebview = async () => {
      try {
        const appWindow = getCurrentWindow();
        const physicalSize = await appWindow.innerSize();
        const scaleFactor = await appWindow.scaleFactor();
        const logicalSize = physicalSize.toLogical(scaleFactor);

        const wv = new Webview(appWindow, `clawset-view-${viewId}`, {
          url,
          x: 0,
          y: navbarHeight,
          width: logicalSize.width,
          height: logicalSize.height - navbarHeight,
          transparent: false,
        });

        await wv.once("tauri://created", () => {
          console.log(`View [${viewId}] webview created at`, url);
        });

        webviewRef.current = wv;

        resizeListener = async () => {
          if (!webviewRef.current) return;
          const currentPhys = await appWindow.innerSize();
          const currentLogical = currentPhys.toLogical(scaleFactor);
          webviewRef.current.setSize(
            new LogicalSize(currentLogical.width, currentLogical.height - navbarHeight)
          );
        };

        window.addEventListener("resize", resizeListener);
      } catch (e) {
        console.error(`Failed to spawn view [${viewId}] webview:`, e);
      }
    };

    spawnWebview();

    return () => {
      if (resizeListener) window.removeEventListener("resize", resizeListener);
      if (webviewRef.current) {
        webviewRef.current.close().catch(console.error);
        webviewRef.current = null;
      }
    };
  }, [url, viewId, navbarHeight]);

  return (
    <div className="w-full h-full bg-background flex flex-col items-center justify-center">
      <span className="text-default-400 text-sm animate-pulse">Loading view...</span>
    </div>
  );
}

/**
 * Route wrapper: resolves viewId from URL params → instance IP + view port → ViewContent.
 * Also gates on auth requirements.
 */
export function ViewRouteWrapper({ viewId }: { viewId: string }) {
  const { selectedInstance, isProviderAvailable, loading } = useClawset();

  if (loading || !selectedInstance) {
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

  if (selectedInstance.status !== "Running" || !selectedInstance.ip) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-default-500 gap-4">
        <div className="w-16 h-16 bg-default-100 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-default-400"><path d="M12 22v-4"/><path d="M12 6V2"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.9 4.9 2.9 2.9"/><path d="m16.2 16.2 2.9 2.9"/><path d="m4.9 19.1 2.9-2.9"/><path d="m16.2 7.8 2.9-2.9"/></svg>
        </div>
        <p>Instance <b>{selectedInstance.name}</b> is {selectedInstance.status.toLowerCase()}.</p>
      </div>
    );
  }

  // Find the view from the instance's registered views
  const view = selectedInstance.views?.find(v => v.id === viewId);

  if (!view) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-default-500 gap-4">
        <h2 className="text-lg font-bold">View not found</h2>
        <p className="text-sm">View <code className="bg-default-100 px-2 py-0.5 rounded">{viewId}</code> is not registered.</p>
      </div>
    );
  }

  const token = selectedInstance.openclawConfig?.gateway?.auth?.token;
  const url = `http://${selectedInstance.ip}:${view.port}${view.path || "/"}${token && view.id === "gateway" ? `#token=${token}` : ""}`;

  return <ViewContent url={url} viewId={viewId} navbarHeight={90} />;
}
