import { useState, useRef, useEffect } from "react";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { Spinner, Button } from "@heroui/react";
import { useMultipass } from "../context/MultipassContext";

interface AppHubContentProps {
  url: string;
  navbarHeight: number;
}

export function AppHubContent({ url, navbarHeight }: AppHubContentProps) {
  const webviewRef = useRef<Webview | null>(null);
  
  useEffect(() => {
    let resizeListener: () => void;

    const spawnWebview = async () => {
      try {
        const appWindow = getCurrentWindow();
        const physicalSize = await appWindow.innerSize();
        const scaleFactor = await appWindow.scaleFactor();
        const logicalSize = physicalSize.toLogical(scaleFactor);

        const wv = new Webview(appWindow, "content-webview-apphub", {
          url,
          x: 0,
          y: navbarHeight,
          width: logicalSize.width,
          height: logicalSize.height - navbarHeight,
          transparent: false,
        });

        await wv.once("tauri://created", () => {
          console.log("AppHub Webview Created at", url);
        });

        webviewRef.current = wv;

        resizeListener = async () => {
          if (!webviewRef.current) return;
          const currentPhys = await appWindow.innerSize();
          const currentLogical = currentPhys.toLogical(scaleFactor);
          webviewRef.current.setSize(new LogicalSize(currentLogical.width, currentLogical.height - navbarHeight));
        };

        window.addEventListener("resize", resizeListener);
        console.log("AppHub Webview Spawned at", url);
      } catch (e) {
        console.error("Failed to spawn external apphub webview", e);
      }
    };

    spawnWebview();

    return () => {
      if (resizeListener) window.removeEventListener("resize", resizeListener);
      if (webviewRef.current) {
        console.log("Destroying AppHub Webview");
        webviewRef.current.close().catch(console.error);
        webviewRef.current = null;
      }
    };
  }, [url, navbarHeight]);

  return (
    <div className="w-full h-full bg-background flex flex-col items-center justify-center">
      <span className="text-default-400 text-sm animate-pulse">Loading Remote AppHub...</span>
    </div>
  );
}

export function AppHubContentRouteWrapper() {
  const { selectedInstance, isMultipassInstalled } = useMultipass();
  const [isServerReady, setIsServerReady] = useState(false);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    let isChecking = false;

    if (!isMultipassInstalled || !selectedInstance || selectedInstance.status !== "Running" || !selectedInstance.ip) {
       return;
    }

    const checkServer = async () => {
      if (isChecking) return;
      isChecking = true;
      try {
        const isReady = await invoke<boolean>("check_apphub_status", { instanceName: selectedInstance.name });
        if (isReady) {
          setIsServerReady(true);
          setIsStartingServer(false);
          clearInterval(interval);
        } else if (!isStartingServer) {
          // If server is not ready and we haven't tried starting it yet
          setIsStartingServer(true);
          console.log("AppHub server not running, starting it...");
          await invoke("start_apphub", { instanceName: selectedInstance.name });
        }
      } catch (e: any) {
        console.error("Error checking or starting AppHub server:", e);
        setErrorMsg(e.toString());
        clearInterval(interval);
      } finally {
        isChecking = false;
      }
    };

    // Initial check right away
    checkServer();

    // Poll every 3 seconds if not ready
    if (!isServerReady) {
       interval = setInterval(checkServer, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedInstance?.name, selectedInstance?.status, isMultipassInstalled, isStartingServer, isServerReady]);

  if (!isMultipassInstalled || !selectedInstance) return null;
  
  if (selectedInstance.status !== "Running" || !selectedInstance.ip) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-default-500">
        <p>Instance is not running or IP is unavailable.</p>
      </div>
    );
  }

  if (errorMsg) {
     return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-default-600 bg-background max-w-md mx-auto text-center p-8">
            <h2 className="text-xl font-bold text-danger">Failed to start AppHub</h2>
            <p className="text-sm font-mono bg-default-100 p-2 rounded w-full border border-default-200">
              {errorMsg}
            </p>
            <Button size="sm" variant="ghost" onPress={() => setErrorMsg("")}>Retry</Button>
        </div>
     );
  }

  if (!isServerReady) {
      return (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-default-600 bg-background">
             <Spinner size="lg" color="current" className="text-primary" />
             <div className="flex flex-col items-center">
                 <h2 className="text-lg font-bold">Starting AppHub Server</h2>
                 <p className="text-xs text-default-500 animate-pulse">Running <code className="bg-default-100 px-1 rounded">npm run dev</code> in ~/clawset/apphub...</p>
             </div>
          </div>
      );
  }

  const url = `http://${selectedInstance.ip}:3000`;

  return <AppHubContent url={url} navbarHeight={90} />;
}
