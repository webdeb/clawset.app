import { useState, useRef, useEffect } from "react";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { Button, Card, Spinner, Input } from "@heroui/react";
import { useMultipass } from "../context/MultipassContext";
import { createAuthorizationFlow, exchangeAuthorizationCode } from "../lib/login-codex";
import { openUrl } from "@tauri-apps/plugin-opener";

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
  const { selectedInstance, isMultipassInstalled, syncAgentAuth, syncOpenclawStatus, loading: contextLoading } = useMultipass();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [pastedUrl, setPastedUrl] = useState("");
  const [pkceState, setPkceState] = useState<{verifier: string, state: string} | null>(null);

  useEffect(() => {
    if (selectedInstance?.name && selectedInstance.status === "Running" && selectedInstance.ip) {
        setIsSyncing(true);
        Promise.all([
            syncAgentAuth(selectedInstance.name),
            syncOpenclawStatus(selectedInstance.name)
        ]).finally(() => setIsSyncing(false));
    }
  }, [selectedInstance?.name, selectedInstance?.status, selectedInstance?.ip]);

  if (!isMultipassInstalled) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8 text-center flex-col gap-4">
        <h2 className="text-xl font-bold">Multipass Not Found</h2>
        <p className="text-default-500">Please install Multipass to use this application.</p>
      </div>
    );
  }

  if (contextLoading || !selectedInstance || (isSyncing && !selectedInstance.agentAuth)) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-background">
        <Spinner size="lg" color="current" />
        <div className="flex flex-col items-center gap-1">
            <p className="text-primary font-medium">Initializing System...</p>
            <p className="text-sm text-default-400 animate-pulse">Syncing instance status...</p>
        </div>
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
        <Button variant="outline" onPress={() => window.location.reload()}>Retry Sync</Button>
      </div>
    );
  }

  // Check if agent auth has been set up yet
  const hasCodexAuth = selectedInstance.agentAuth?.profiles?.["openai-codex:default"]?.access;

  if (!hasCodexAuth) {
    const handleLogin = async () => {
        setIsLoggingIn(true);
        try {
            const { url, verifier, state } = await createAuthorizationFlow();
            console.log("Login URL:", url);

            setPkceState({ verifier, state });
            
            // Open the user's default system browser to the auth URL
            await openUrl(url);
            setShowTokenInput(true);
        } catch (e) {
            console.error("Failed to start login flow:", e);
            alert(`Failed to start login flow: ${e}`);
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleUrlPaste = async () => {
        if (!pastedUrl.trim()) return;
        if (!pkceState) {
            alert("Login session invalid. Please click 'Login with OpenAI' again.");
            return;
        }

        setIsLoggingIn(true);
        try {
            const interceptedUrlObj = new URL(pastedUrl);
            const code = interceptedUrlObj.searchParams.get("code");
            const returnedState = interceptedUrlObj.searchParams.get("state");

            if (returnedState !== pkceState.state) {
                throw new Error("Invalid state parameter returned from OpenAI. For security, please try again.");
            }

            if (!code) throw new Error("No authorization code found in the pasted URL.");
            
            const tokenData = await exchangeAuthorizationCode(code, pkceState.verifier);
            
            // Re-merge with existing auth-profiles.json properties
            const authPayload = {
                version: 1,
                profiles: {
                    ...(selectedInstance.agentAuth?.profiles || {}),
                    "openai-codex:default": {
                        type: "oauth",
                        provider: "openai-codex",
                        access: tokenData.access,
                        refresh: tokenData.refresh,
                        expires: tokenData.expires,
                        accountId: tokenData.accountId
                    }
                },
                lastGood: {
                    ...(selectedInstance.agentAuth?.lastGood || {}),
                    "openai-codex": "openai-codex:default"
                },
                usageStats: {
                    ...(selectedInstance.agentAuth?.usageStats || {}),
                    "openai-codex:default": {
                        lastUsed: Date.now(),
                        errorCount: 0
                    }
                }
            };

            await invoke("write_agent_auth", { 
                instanceName: selectedInstance.name, 
                authJson: JSON.stringify(authPayload, null, 2) 
            });
            
            // Refetch the data so we bypass this screen on next render cycle
            await syncAgentAuth(selectedInstance.name);
            setShowTokenInput(false);
        } catch (e: any) {
            console.error("Token exchange failed:", e);
            alert(`Token Exchange Failed: ${e.message || e}`);
        } finally {
            setIsLoggingIn(false);
        }
    };

    return (
      <div className="w-full min-h-full flex flex-col items-center justify-center bg-background text-foreground p-8 overflow-y-auto">
        <Card className="p-8 max-w-md flex flex-col items-center justify-center gap-6 shadow-sm border border-default-200">
          <div className="flex flex-col items-center text-center gap-2">
             <div className="w-12 h-12 bg-default-100 rounded-xl flex items-center justify-center mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-default-700"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/></svg>
             </div>
             <h2 className="text-xl font-bold">OpenAI Authentication Required</h2>
             <p className="text-sm text-default-500">You must authorize ChatGPT to let OpenClaw access and operate the Codex Agent.</p>
          </div>
          
          {!showTokenInput ? (
              <div className="w-full flex justify-center flex-col gap-2">
                 <Button 
                    className="w-full bg-black text-white px-8" 
                    size="lg"
                    isDisabled={isLoggingIn}
                    onPress={handleLogin}
                 >
                    {isLoggingIn && <Spinner size="sm" color="current" />}
                    Login with OpenAI in Browser
                 </Button>
                 <p className="text-[10px] text-default-400 text-center uppercase tracking-wide">
                    Proceeds to auth.openai.com
                 </p>
              </div>
          ) : (
              <div className="w-full flex justify-center flex-col gap-3 animate-fade-in">
                 <p className="text-xs text-default-600 font-medium">
                     After completing the browser login, you will be redirected to an unreachable page. Copy that full URL from your browser's address bar and paste it below.
                 </p>
                 <Input 
                    type="text" 
                    placeholder="http://localhost:1455/auth/callback?code=..." 
                    value={pastedUrl}
                    onChange={(e) => setPastedUrl(e.target.value)}
                 />
                 <Button 
                    className="w-full bg-primary text-white" 
                    size="lg"
                    isDisabled={isLoggingIn || !pastedUrl.trim()}
                    onPress={handleUrlPaste}
                 >
                    {isLoggingIn && <Spinner size="sm" color="current" />}
                    Submit Code
                 </Button>
                 <Button 
                    variant="ghost" 
                    className="text-xs text-default-600 border-none"
                    isDisabled={isLoggingIn}
                    onPress={() => setShowTokenInput(false)}
                 >
                    Cancel
                 </Button>
              </div>
          )}
        </Card>
      </div>
    );
  }

  const token = selectedInstance.openclawConfig?.gateway?.auth?.token;
  const url = `http://${selectedInstance.ip}:18789${token ? `/#token=${token}` : ''}`;

  return <DashboardContent url={url} navbarHeight={90} />;
}
