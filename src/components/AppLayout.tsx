import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Button, Spinner, Select, ListBox, Tabs } from "@heroui/react";
import { useClawset } from "../context/ClawsetContext";

const navbarHeight = 60;

export function AppLayout() {
  const { 
    isProviderAvailable, 
    instances, 
    selectedInstance, 
    loading, 
    error, 
    setSelectedInstanceName, 
    startInstance 
  } = useClawset();

  const [actionLoading, setActionLoading] = useState(false);

  const openclawStatus = selectedInstance ? selectedInstance.status : "Unknown";
  const views = selectedInstance?.views || [];

  const handleStartInstance = async () => {
    if (!selectedInstance) return;
    setActionLoading(true);
    try {
      await startInstance(selectedInstance.name);
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
        className="flex flex-row items-center justify-between flex-shrink-0 w-full bg-default-50 border-b border-divider px-6 z-50 relative"
        style={{ height: navbarHeight }}
      >
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold leading-none">clawset.app</h1>
            <p className="text-[10px] text-default-500">Secure Agent Environment</p>
          </div>

          {!isProviderAvailable ? (
             <div className="bg-danger/10 text-danger px-3 py-1 rounded text-xs font-semibold flex items-center">
               No Instance Provider
             </div>
          ) : (
            <Tabs className="max-h-8">
              <Tabs.ListContainer>
                <Tabs.List className="gap-6 shadow-none p-0 border-b-0 bg-transparent h-8">
                  {/* Dynamic view tabs from .clawset/views.json */}
                  {views.map((view) => (
                    <Tabs.Tab 
                      key={view.id} 
                      href={`#view/${view.id}`} 
                      id={view.id}
                      isDisabled={openclawStatus !== "Running"}
                    >
                      {view.name}
                    </Tabs.Tab>
                  ))}
                  {/* Static tabs */}
                  <Tabs.Tab href="#instance" id="instance">Instance</Tabs.Tab>
                  <Tabs.Tab href="#plugins" id="plugins">Plugins</Tabs.Tab>
                  <Tabs.Tab href="#auth" id="auth">Auth</Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          )}
        </div>

        {isProviderAvailable && (
          <div className="flex items-center gap-4">
            {instances.length === 0 && (
              <Button variant="ghost" size="sm" isPending={actionLoading} onPress={() => window.location.hash = "#/instance"} className="h-8 min-h-8 text-xs">
                Install Default Instance
              </Button>
            )}
            {openclawStatus === "Stopped" && (
              <Button variant="ghost" size="sm" isPending={actionLoading} onPress={handleStartInstance} className="h-8 min-h-8 text-xs bg-primary/10 text-primary">
                Start Instance
              </Button>
            )}

            {instances.length > 0 && selectedInstance && (
              <Select 
                value={selectedInstance.name}
                onChange={(key) => {
                  if (key && typeof key === "string") setSelectedInstanceName(key);
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
                 {actionLoading ? <Spinner size="sm"/> : (!selectedInstance ? "No Instance" : openclawStatus === "Running" ? "Running" : openclawStatus === "Stopped" ? "Stopped" : openclawStatus)}
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
      
      {/* Dynamic Content */}
      <main className="flex-1 w-full bg-transparent overflow-y-auto relative">
        <Outlet />
      </main>
    </div>
  );
}
