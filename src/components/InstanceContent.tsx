import { Card, Chip, Button, Spinner } from "@heroui/react";
import { useRef, useEffect } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useMultipass } from "../context/MultipassContext";

import { InstanceProvision } from "./InstanceProvision";

export function InstanceContent() {
  const { selectedInstance, setupExistingInstance, provisionLogs, provisioningInstanceName } = useMultipass();
  const logsEndRef = useRef<HTMLDivElement>(null);

  const isThisInstanceProvisioning = 
    provisioningInstanceName === selectedInstance?.name || 
    selectedInstance?.isProvisioning === true;

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [provisionLogs]);

  const handleSetupExistingInstance = async () => {
    if (!selectedInstance) return;

    try {
      let finalHostPath = selectedInstance.hostPathFolder;

      if (!finalHostPath) {
        const selected = await openDialog({
          title: 'Select Target Folder for Clawset Data mapping',
          directory: true,
          multiple: false,
        });

        if (!selected) {
           return; // User cancelled dialog
        }

        if (Array.isArray(selected)) {
          finalHostPath = selected.length > 0 ? selected[0] : "";
        } else {
          finalHostPath = selected;
        }
      }

      if (!finalHostPath) return;

      await setupExistingInstance(selectedInstance.name, finalHostPath);
    } catch (e) {
      console.error(e);
    }
  };
  
  if (!selectedInstance) {
    return <InstanceProvision />;
  }

  return (
    <div className="w-screen flex items-start justify-center bg-background text-foreground p-8 overflow-y-auto">
      <Card className="p-6 w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            {selectedInstance.name}
            <Chip size="sm" color={selectedInstance.status === "Running" ? "success" : "default"} variant="soft">
              {selectedInstance.status}
            </Chip>
          </h2>
          <p className="text-default-500 text-sm">{selectedInstance.ubuntuVersion || "Ubuntu"}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1 border border-default-200 rounded-lg p-3 bg-default-50/50">
            <span className="text-xs text-default-500 uppercase font-semibold tracking-wider">IP Address</span>
            <span className="font-medium font-mono text-sm">{selectedInstance.ip || "Unknown"}</span>
          </div>
          <div className="flex flex-col gap-1 border border-default-200 rounded-lg p-3 bg-default-50/50">
            <span className="text-xs text-default-500 uppercase font-semibold tracking-wider">CPUs</span>
            <span className="font-medium font-mono text-sm">{selectedInstance.cpus || "Unknown"}</span>
          </div>
          <div className="flex flex-col gap-1 border border-default-200 rounded-lg p-3 bg-default-50/50">
            <span className="text-xs text-default-500 uppercase font-semibold tracking-wider">Memory</span>
            <span className="font-medium font-mono text-sm">{selectedInstance.memory || "Unknown"}</span>
          </div>
          <div className="flex flex-col gap-1 border border-default-200 rounded-lg p-3 bg-default-50/50">
            <span className="text-xs text-default-500 uppercase font-semibold tracking-wider">Storage</span>
            <span className="font-medium font-mono text-sm">{selectedInstance.storage || "Unknown"}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-2">
          <h3 className="text-sm font-semibold border-b pb-2 uppercase tracking-wide text-default-600 flex justify-between items-center">
            <span>Environment Status</span>
            {isThisInstanceProvisioning && <Spinner size="sm" color="current" className="text-secondary" />}
          </h3>
          
          {isThisInstanceProvisioning ? (
            <div className="flex flex-col gap-2 mt-2 bg-default-50 border border-default-200 p-3 rounded-lg shadow-sm">
              <div className="flex justify-between items-center mb-1">
                 <span className={`text-xs font-semibold ${isThisInstanceProvisioning ? 'text-secondary animate-pulse' : 'text-default-500'}`}>
                    {isThisInstanceProvisioning ? "Provisioning Environment..." : "Provisioning Finished"}
                 </span>
              </div>
              <div className="w-full bg-black/90 rounded p-3 font-mono text-[10px] sm:text-xs text-green-400 overflow-y-auto h-48 border border-default-200/20 shadow-inner text-left whitespace-pre-wrap flex flex-col gap-1">
                {provisionLogs.length === 0 ? (
                  <span className="text-default-400 italic">Waiting for logs...</span>
                ) : (
                  provisionLogs.map((log, index) => (
                    <span key={index} className={log.startsWith("ERROR:") ? "text-danger" : ""}>{log}</span>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center py-1">
                <span className="text-default-600 text-sm">Node.js</span>
                {selectedInstance.nodeInstalled ? (
                  <span className="font-mono text-xs bg-default-100 px-2 py-1 rounded">{selectedInstance.nodeInstalled}</span>
                ) : (
                  <span className="text-default-400 text-xs italic">Not Installed</span>
                )}
              </div>
              
              <div className="flex justify-between items-center py-1">
                <span className="text-default-600 text-sm">OpenClaw Installed</span>
                <div className="flex items-center gap-2">
                  {/* {!selectedInstance.openclawInstalled && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="bg-secondary/10 text-secondary" 
                      onPress={handleSetupExistingInstance}
                      isDisabled={provisioningInstanceName !== null || selectedInstance.isProvisioning} // disable if ANY instance is provisioning or this one is
                    >
                      Install Node & OpenClaw
                    </Button>
                  )} */}
                  <Chip size="sm" color={selectedInstance.openclawInstalled ? "success" : "default"} variant="soft">
                    {selectedInstance.openclawInstalled ? "Yes" : "No"}
                  </Chip>
                </div>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-default-600 text-sm">OpenClaw Process</span>
                <Chip size="sm" color={selectedInstance.openclawRunning ? "success" : "default"} variant="soft">
                  {selectedInstance.openclawRunning ? "Active" : "Inactive"}
                </Chip>
              </div>
              
              <div className="flex flex-col gap-1 mt-2">
                <span className="text-default-600 text-sm">Gateway Token</span>
                {selectedInstance.openclawToken ? (
                  <div className="bg-default-100 p-2 rounded text-xs font-mono break-all text-default-700 select-all border border-default-200">
                    {selectedInstance.openclawToken}
                  </div>
                ) : (
                  <span className="text-default-400 text-xs italic">Unable to retrieve token</span>
                )}
              </div>

              {selectedInstance.hostPathFolder && (
                <div className="flex flex-col gap-1 mt-2">
                  <span className="text-default-600 text-sm">Host Mount Path</span>
                  <div className="bg-default-100 p-2 rounded text-xs font-mono break-all text-default-700 select-all border border-default-200">
                    {selectedInstance.hostPathFolder}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
