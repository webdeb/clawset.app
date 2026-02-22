import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Button, Spinner, Select, ListBox, Tabs } from "@heroui/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useMultipass } from "../context/MultipassContext";

const navbarHeight = 90;

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    isMultipassInstalled, 
    instances, 
    selectedInstance, 
    loading, 
    error, 
    setSelectedInstance, 
    installInstance, 
    startInstance 
  } = useMultipass();

  const [activeTab, setActiveTab] = useState<React.Key>("info");
  const [actionLoading, setActionLoading] = useState(false);

  const activeInstanceObj = instances.find(i => i.name === selectedInstance);
  const openclawStatus = activeInstanceObj ? activeInstanceObj.status : "Unknown";

  // Sync tab status with Router path initially
  useEffect(() => {
    if (location.pathname.includes("/config")) setActiveTab("config");
    else if (location.pathname.includes("/dashboard")) setActiveTab("dashboard");
    else setActiveTab("info");
  }, [location.pathname]);

  const handleTabChange = (key: React.Key) => {
    setActiveTab(key);
    if (!selectedInstance) return;

    if (key === "info") navigate(`/info/${selectedInstance}`);
    else if (key === "config") navigate(`/config/${selectedInstance}`);
    else if (key === "dashboard") navigate(`/dashboard/${selectedInstance}`);
  };

  const handleInstanceSelection = (name: string) => {
    setSelectedInstance(name);
    // When instance changes, refresh the current route with the new instance ID
    if (activeTab === "info") navigate(`/info/${name}`);
    else if (activeTab === "config") navigate(`/config/${name}`);
    else if (activeTab === "dashboard") navigate(`/dashboard/${name}`);
  };

  const handleInstallOpenclaw = async () => {
    setActionLoading(true);
    try {
      const selected = await openDialog({
        title: 'Select Target Folder for Clawset Data mapping',
        directory: true,
        multiple: false,
      });

      let hostPathId = "";
      if (selected && !Array.isArray(selected)) {
        hostPathId = selected;
      }

      await installInstance(selectedInstance || "openclaw-default", hostPathId);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartInstance = async () => {
    if (!selectedInstance) return;
    setActionLoading(true);
    try {
      await startInstance(selectedInstance);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && instances.length === 0 && !actionLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-background text-foreground">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Persistent Header */}
      <header 
        className="flex flex-row items-center justify-between flex-shrink-0 w-full bg-default-50 border-b border-divider px-6 z-50 shadow-sm relative"
        style={{ height: navbarHeight }}
      >
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold leading-none">OpenClaw</h1>
            <p className="text-[10px] text-default-500">Sandboxed Environment</p>
          </div>

          {!isMultipassInstalled ? (
             <div className="bg-danger/10 text-danger px-3 py-1 rounded text-xs font-semibold flex items-center">
               Multipass missing
             </div>
          ) : (
            <Tabs 
              selectedKey={activeTab as string} 
              onSelectionChange={handleTabChange} 
              className="max-h-8"
            >
              <Tabs.ListContainer>
                <Tabs.List className="gap-6 shadow-none p-0 border-b-0 bg-transparent h-8">
                  <Tabs.Tab id="info">Info</Tabs.Tab>
                  <Tabs.Tab id="config">Config</Tabs.Tab>
                  <Tabs.Tab id="dashboard" isDisabled={openclawStatus !== "Running"}>Dashboard</Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          )}
        </div>

        {isMultipassInstalled && (
          <div className="flex items-center gap-4">
            {openclawStatus === "NotInstalled" && (
              <Button variant="ghost" size="sm" isPending={actionLoading} onPress={handleInstallOpenclaw} className="h-8 min-h-8 text-xs">
                Install {selectedInstance || "Instance"}
              </Button>
            )}
            {openclawStatus === "Stopped" && (
              <Button variant="ghost" size="sm" isPending={actionLoading} onPress={handleStartInstance} className="h-8 min-h-8 text-xs bg-primary/10 text-primary">
                Start Instance
              </Button>
            )}

            {instances.length > 0 && selectedInstance && (
              <Select 
                value={selectedInstance}
                onChange={(key) => {
                  if (key && typeof key === "string") handleInstanceSelection(key);
                }}
                className="w-40"
                aria-label="Select Instance"
                placeholder="Select Instance"
              >
                <Select.Trigger className="rounded bg-default-100 border text-left h-8 min-h-8">
                  <Select.Value />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {instances.map((i) => (
                      <ListBox.Item key={i.name} id={i.name} textValue={i.name}>
                        {i.name}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            )}

            <div className="flex flex-col items-end justify-center w-20">
               <span className="text-[9px] text-default-500 uppercase font-bold tracking-wider leading-none mb-1">Status</span>
               <span className="font-bold flex items-center gap-1.5 text-xs leading-none">
                 {openclawStatus === "Running" && <span className="w-2 h-2 rounded-full bg-success"></span>}
                 {openclawStatus === "Stopped" && <span className="w-2 h-2 rounded-full bg-danger"></span>}
                 {actionLoading ? <Spinner size="sm"/> : (openclawStatus === "Running" ? "Running" : openclawStatus === "Stopped" ? "Stopped" : openclawStatus)}
               </span>
            </div>
            
            {error && (
              <div className="absolute top-16 right-4 text-danger text-xs bg-default-50 px-2 py-1 rounded shadow-sm border border-danger/20">
                Error: {error}
              </div>
            )}
          </div>
        )}
      </header>
      
      {/* Dynamic Content rendered securely via Router Outlet */}
      <main className="flex-1 w-full bg-transparent overflow-hidden relative">
        <Outlet />
      </main>
    </div>
  );
}
