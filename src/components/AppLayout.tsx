import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, matchPath } from "react-router-dom";
import { Button, Spinner, Tabs } from "@heroui/react";
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
    startInstance,
    setSelectedInstanceName,
    setActiveContext,
  } = useClawset();

  const navigate = useNavigate();
  const location = useLocation();
  const routeContext = useRouteContext();
  const [actionLoading, setActionLoading] = useState(false);
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

  const handleStartInstance = async () => {
    if (!contextInstance) return;
    setActionLoading(true);
    try {
      await startInstance(contextInstance.name);
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Loading state ──────────────────────────────────────────
  if (loading && instances.length === 0 && !actionLoading) {
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

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="w-full h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header
        className="flex flex-row items-center justify-between flex-shrink-0 w-full bg-default-50 border-b border-divider px-4 z-50 relative"
        style={{ height: HEADER_HEIGHT }}
      >
        {/* Left: Context name */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${isSystem ? "bg-default-200 text-default-600" : "bg-primary/10 text-primary"}`}>
              {isSystem ? "⚙" : (routeContext.instanceName || "").slice(0, 2).toUpperCase()}
            </span>
            <h1 className="text-sm font-semibold leading-none">
              {isSystem ? "System" : routeContext.instanceName}
            </h1>
          </div>
        </div>

        {/* Center: Context-dependent tabs */}
        <div className="flex-1 flex items-center justify-center">
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

        {/* Right: Status + Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {!isProviderAvailable && (
            <div className="bg-danger/10 text-danger px-3 py-1 rounded text-xs font-semibold flex items-center">
              No Provider
            </div>
          )}

          {isProviderAvailable && !isSystem && contextInstance && (
            <>
              {openclawStatus === "Stopped" && (
                <Button
                  variant="ghost"
                  size="sm"
                  isPending={actionLoading}
                  onPress={handleStartInstance}
                  className="h-7 min-h-7 text-[11px] bg-primary/10 text-primary"
                >
                  Start
                </Button>
              )}

              <div className="flex items-center gap-1.5">
                {openclawStatus === "Running" && <span className="w-2 h-2 rounded-full bg-success" />}
                {openclawStatus === "Stopped" && <span className="w-2 h-2 rounded-full bg-danger" />}
                <span className="text-[11px] font-medium text-default-500">
                  {actionLoading ? <Spinner size="sm" /> : openclawStatus}
                </span>
              </div>
            </>
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
          {/* Left: ContextChat */}
          <ContextChat
            collapsed={chatCollapsed}
            onToggle={() => setChatCollapsed(!chatCollapsed)}
          />

          {/* Right: Tab Content */}
          <main className="flex-1 bg-transparent overflow-hidden relative">
            <div className="absolute inset-0">
              <Outlet />
            </div>
          </main>
        </div>
      </WebviewLayoutProvider>
    </div>
  );
}
