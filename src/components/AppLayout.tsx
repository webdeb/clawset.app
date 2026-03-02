import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, matchPath } from "react-router-dom";
import { Button, ButtonGroup, Spinner, Tabs } from "@heroui/react";
import { useClawset } from "../context/ClawsetContext";
import { WebviewLayoutProvider } from "../context/WebviewLayoutContext";
import { ContextChat } from "./ContextChat";

const HEADER_HEIGHT = 48;

/**
 * Derive context from URL:
 *  /system/*               → { type: "system" }
 *  /instance/:name/*       → { type: "instance", name }
 */
function useRouteContext() {
  const location = useLocation();

  const instanceMatch = matchPath("/instance/:instanceName/*", location.pathname);
  if (instanceMatch) {
    return { type: "instance" as const, instanceName: instanceMatch.params.instanceName! };
  }

  return { type: "system" as const, instanceName: null };
}

export function AppLayout() {
  const {
    isProviderAvailable,
    instances,
    loading,
    error,
    setSelectedInstanceName,
    setActiveContext,
  } = useClawset();

  const navigate = useNavigate();
  const location = useLocation();
  const routeContext = useRouteContext();
  const [chatCollapsed, setChatCollapsed] = useState(false);

  const isSystem = routeContext.type === "system";
  const contextInstance = isSystem ? null : instances.find((i) => i.name === routeContext.instanceName);
  const openclawStatus = contextInstance?.status || "Unknown";
  const views = contextInstance?.views || [];

  // ─── Webview Layout State ─────────────────────────────────────
  // Managed entirely inside WebviewLayoutProvider now.

  // Sync context state from URL (URL = source of truth)
  useEffect(() => {
    if (isSystem) {
      setActiveContext("system");
    } else if (routeContext.instanceName) {
      setActiveContext(routeContext.instanceName);
      setSelectedInstanceName(routeContext.instanceName);
    }
  }, [isSystem, routeContext.instanceName, setActiveContext, setSelectedInstanceName]);

  // ─── Loading state ──────────────────────────────────────────
  if (loading && instances.length === 0) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-background text-foreground">
        <Spinner size="lg" />
      </div>
    );
  }

  // ─── Tab config ─────────────────────────────────────────────
  const systemTabs = [
    { id: "plugins", label: "Plugins", path: "/system/plugins" },
    { id: "auth", label: "Auth", path: "/system/auth" },
  ];

  const getActiveTab = (): string => {
    if (isSystem) {
      const found = systemTabs.find((t) => location.pathname === t.path);
      return found?.id || "plugins";
    }
    // Instance context: /instance/:name → "overview", /instance/:name/:viewId → viewId
    const parts = location.pathname.split("/");
    // /instance/name/viewId → parts = ["", "instance", "name", "viewId"]
    return parts[3] || "overview";
  };

  const handleTabChange = (tabId: string) => {
    if (isSystem) {
      const tab = systemTabs.find((t) => t.id === tabId);
      if (tab) navigate(tab.path);
    } else {
      if (tabId === "overview") {
        navigate(`/instance/${routeContext.instanceName}`);
      } else {
        navigate(`/instance/${routeContext.instanceName}/${tabId}`);
      }
    }
  };

  const switchContext = (ctx: string) => {
    if (ctx === "system") {
      navigate("/system/plugins");
    } else {
      navigate(`/instance/${ctx}`);
    }
  };

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="w-full h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header (Acts as native macOS Titlebar now with custom Overlay) */}
      <header
        data-tauri-drag-region
        className="flex flex-row items-center justify-between flex-shrink-0 w-full bg-default-50 border-b border-divider pr-4 pl-[72px] z-50 relative"
        style={{ height: HEADER_HEIGHT }}
      >
        {/* Center Absolute: Clawset Logo (Centered natively in window) */}
        {/* <div data-tauri-drag-region className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 text-default-400 pointer-events-none select-none">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span className="text-xs font-bold tracking-widest uppercase opacity-80">Clawset</span>
        </div> */}
        {/* Left: Tabs */}
        <div className="flex items-center gap-6 flex-1 z-10">

          {/* Context-dependent tabs */}
          <div className="flex items-center">
          {isProviderAvailable && (
            <Tabs className="max-h-8" selectedKey={getActiveTab()} onSelectionChange={(key) => handleTabChange(key as string)}>
              <Tabs.ListContainer>
                <Tabs.List className="gap-4 shadow-none p-0 border-b-0 bg-transparent h-8">
                  {isSystem ? (
                    <>
                      {systemTabs.map((tab) => (
                        <Tabs.Tab key={tab.id} id={tab.id}>
                          {tab.label}
                        </Tabs.Tab>
                      ))}
                    </>
                  ) : (
                    <>
                      <Tabs.Tab key="overview" id="overview">
                        Instance
                      </Tabs.Tab>
                      {views.map((view) => (
                        <Tabs.Tab
                          key={view.id}
                          id={view.id}
                          isDisabled={openclawStatus !== "Running"}
                        >
                          {view.name}
                        </Tabs.Tab>
                      ))}
                    </>
                  )}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          )}
          </div>
        </div>

        {/* Right: Context indicator + Status + Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Context Switcher ROW */}
          <div className="flex items-center gap-2 mr-2 pr-4 select-none" data-tauri-drag-region>
            <ButtonGroup size="sm" variant="ghost" className="h-7">
              {/* Instance icons */}
              {instances.map((inst) => (
                <Button
                  key={inst.name}
                  onPress={() => switchContext(inst.name)}
                  variant="ghost"
                  className={routeContext.instanceName === inst.name ? "text-primary border-primary font-bold relative px-2 min-w-10" : "font-bold relative px-2 min-w-10 opacity-50 text-default-600"}
                >
                  {inst.name}
                  {/* Status dot */}
                  <span
                    className={`ml-1 w-1.5 h-1.5 rounded-full border border-default-50 ${
                      inst.status === "Running" ? "bg-success" : "bg-danger"
                    }`}
                  />
                </Button>
              ))}
                <Button
                  onPress={() => switchContext("system")}
                  variant="ghost"
                  className={isSystem ? "text-primary border-primary" : "opacity-50"}
                  aria-label="System"
                >
                  System
                </Button>
            </ButtonGroup>
            <Button size="sm" variant="ghost" className="h-7 px-3 bg-default-100 hover:bg-default-200 ml-1 font-semibold" onPress={() => navigate("/system/new")}>
              New
            </Button>
          </div>

          {!isProviderAvailable && (
            <div className="bg-danger/10 text-danger px-3 py-1 rounded text-xs font-semibold flex items-center">
              No Provider
            </div>
          )}


          {error && (
            <div className="text-danger text-[10px] bg-danger/10 px-2 py-0.5 rounded">
              {error}
            </div>
          )}
        </div>
      </header>

      {/* Main: Chat + Content */}
      <WebviewLayoutProvider>
        <div className="flex-1 flex overflow-hidden">
          {/* Left/Center: Tab Content */}
          <main className="flex-1 bg-transparent relative">
            <div className="absolute inset-0 overflow-y-auto">
              <Outlet />
            </div>
          </main>

          {/* Right: ContextChat Sidebar */}
          <ContextChat
            collapsed={chatCollapsed}
            onToggle={() => setChatCollapsed(!chatCollapsed)}
          />
        </div>
      </WebviewLayoutProvider>
    </div>
  );
}
