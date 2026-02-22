import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Webview } from "@tauri-apps/api/webview";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";

export function Bootstrapper() {
  useEffect(() => {
    let navWv: Webview | null = null;
    let contentWv: Webview | null = null;
    let resizeListener: () => void;
    let unlistenNav: (() => void) | null = null;

    async function bootstrap() {
      try {
        const appWindow = getCurrentWindow();
        const physicalSize = await appWindow.innerSize();
        const scaleFactor = await appWindow.scaleFactor();
        const logicalSize = physicalSize.toLogical(scaleFactor);

        navWv = new Webview(appWindow, "nav-webview", {
          url: "/#/nav",
          x: 0,
          y: 0,
          width: logicalSize.width,
          height: 90,
          transparent: false,
        });
        navWv.once("tauri://created", () => console.log("Nav view created"));

        contentWv = new Webview(appWindow, "content-webview", {
          url: "/#/main",
          x: 0,
          y: 90,
          width: logicalSize.width,
          height: logicalSize.height - 90,
          transparent: false,
        });
        contentWv.once("tauri://created", () => console.log("Init Content view created"));

        resizeListener = async () => {
          if (!navWv || !contentWv) return;
          const currentPhys = await appWindow.innerSize();
          const currentLogical = currentPhys.toLogical(scaleFactor);
          
          navWv.setSize(new LogicalSize(currentLogical.width, 90));
          contentWv.setSize(new LogicalSize(currentLogical.width, currentLogical.height - 90));
        };
        window.addEventListener("resize", resizeListener);

        unlistenNav = await listen<{ url: string }>("set-content-url", async (e) => {
          const currentPhys = await appWindow.innerSize();
          const currentLogical = currentPhys.toLogical(scaleFactor);
          
          if (contentWv) {
            await contentWv.close();
          }
          
          contentWv = new Webview(appWindow, "content-webview", {
            url: e.payload.url,
            x: 0,
            y: 90,
            width: currentLogical.width,
            height: currentLogical.height - 90,
            transparent: false,
          });
          contentWv.once("tauri://created", () => console.log("Switched Content view to", e.payload.url));
        });

      } catch (err) {
        console.error("Failed to bootstrap webviews", err);
      }
    }

    bootstrap();

    return () => {
      if (resizeListener) window.removeEventListener("resize", resizeListener);
      if (unlistenNav) unlistenNav();
      navWv?.close();
      contentWv?.close();
    };
  }, []);

  return (
    <div className="w-screen h-screen flex items-center justify-center bg-background text-foreground">
      <p className="text-default-500 animate-pulse">Initializing OpenClaw architecture...</p>
    </div>
  );
}
