import { useEffect, useRef } from "react";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { useMultipass } from "../context/MultipassContext";

interface DashboardContentProps {
  url: string;
  navbarHeight: number;
}

export function DashboardContent({ url, navbarHeight }: DashboardContentProps) {
  const webviewRef = useRef<Webview | null>(null);
  useEffect(() => {
    let resizeListener: () => void;

    const spawnWebview = async () => {
      try {
        const appWindow = getCurrentWindow();
        const physicalSize = await appWindow.innerSize();
        const scaleFactor = await appWindow.scaleFactor();
        const logicalSize = physicalSize.toLogical(scaleFactor);

        const wv = new Webview(appWindow, "content-webview", {
          url,
          x: 0,
          y: navbarHeight,
          width: logicalSize.width,
          height: logicalSize.height - navbarHeight,
          transparent: false,
        });

        await wv.once("tauri://created", () => {
          console.log("Dashboard Webview Created at", url);
        });

        webviewRef.current = wv;

        resizeListener = async () => {
          if (!webviewRef.current) return;
          const currentPhys = await appWindow.innerSize();
          const currentLogical = currentPhys.toLogical(scaleFactor);
          webviewRef.current.setSize(new LogicalSize(currentLogical.width, currentLogical.height - navbarHeight));
        };

        window.addEventListener("resize", resizeListener);
        console.log("Dashboard Webview Spawned at", url);
      } catch (e) {
        console.error("Failed to spawn external dashboard webview", e);
      }
    };

    spawnWebview();

    return () => {
      if (resizeListener) window.removeEventListener("resize", resizeListener);
      if (webviewRef.current) {
        console.log("Destroying Dashboard Webview");
        webviewRef.current.close().catch(console.error);
        webviewRef.current = null;
      }
    };
  }, [url, navbarHeight]);

  return (
    <div className="w-full h-full bg-background flex flex-col items-center justify-center">
      {/* Background placeholder while webview fully loads over it */}
      <span className="text-default-400 text-sm animate-pulse">Loading Remote Dashboard...</span>
    </div>
  );
}

export function DashboardContentRouteWrapper() {
  const { selectedInstance, isMultipassInstalled } = useMultipass();

  if (!isMultipassInstalled || !selectedInstance) return null;
  
  if (selectedInstance.status !== "Running" || !selectedInstance.ip) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-default-500">
        <p>Instance is not running or IP is unavailable.</p>
      </div>
    );
  }

  const token = selectedInstance.openclawConfig?.gateway?.auth?.token;
  const url = `http://${selectedInstance.ip}:18789${token ? `/#token=${token}` : ''}`;

  return <DashboardContent url={url} navbarHeight={90} />;
}
