import { Card, Chip } from "@heroui/react";
import { useMultipass } from "../context/MultipassContext";

export function InfoContent() {
  const { instances, selectedInstance } = useMultipass();
  const instance = instances.find(i => i.name === selectedInstance);
  
  if (!instance) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background text-foreground p-8">
        <Card className="p-6 w-full max-w-lg">
          <p className="text-default-500 text-center">Instance not found or loading...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-screen flex items-start justify-center bg-background text-foreground p-8 overflow-y-auto">
      <Card className="p-6 w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            {instance.name}
            <Chip size="sm" color={instance.status === "Running" ? "success" : "default"} variant="soft">
              {instance.status}
            </Chip>
          </h2>
          <p className="text-default-500 text-sm">{instance.ubuntuVersion || "Ubuntu"}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1 border border-default-200 rounded-lg p-3 bg-default-50/50">
            <span className="text-xs text-default-500 uppercase font-semibold tracking-wider">IP Address</span>
            <span className="font-medium font-mono text-sm">{instance.ip || "Unknown"}</span>
          </div>
          <div className="flex flex-col gap-1 border border-default-200 rounded-lg p-3 bg-default-50/50">
            <span className="text-xs text-default-500 uppercase font-semibold tracking-wider">CPUs</span>
            <span className="font-medium font-mono text-sm">{instance.cpus || "Unknown"}</span>
          </div>
          <div className="flex flex-col gap-1 border border-default-200 rounded-lg p-3 bg-default-50/50">
            <span className="text-xs text-default-500 uppercase font-semibold tracking-wider">Memory</span>
            <span className="font-medium font-mono text-sm">{instance.memory || "Unknown"}</span>
          </div>
          <div className="flex flex-col gap-1 border border-default-200 rounded-lg p-3 bg-default-50/50">
            <span className="text-xs text-default-500 uppercase font-semibold tracking-wider">Storage</span>
            <span className="font-medium font-mono text-sm">{instance.storage || "Unknown"}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-2">
          <h3 className="text-sm font-semibold border-b pb-2 uppercase tracking-wide text-default-600">Environment Status</h3>
          
          <div className="flex justify-between items-center py-1">
            <span className="text-default-600 text-sm">Node.js</span>
            {instance.nodeInstalled ? (
              <span className="font-mono text-xs bg-default-100 px-2 py-1 rounded">{instance.nodeInstalled}</span>
            ) : (
              <span className="text-default-400 text-xs italic">Not Installed</span>
            )}
          </div>
          
          <div className="flex justify-between items-center py-1">
            <span className="text-default-600 text-sm">OpenClaw Installed</span>
            <Chip size="sm" color={instance.openclawInstalled ? "success" : "default"} variant="soft">
              {instance.openclawInstalled ? "Yes" : "No"}
            </Chip>
          </div>

          <div className="flex justify-between items-center py-1">
            <span className="text-default-600 text-sm">OpenClaw Process</span>
            <Chip size="sm" color={instance.openclawRunning ? "success" : "default"} variant="soft">
              {instance.openclawRunning ? "Active" : "Inactive"}
            </Chip>
          </div>
          
          <div className="flex flex-col gap-1 mt-2">
            <span className="text-default-600 text-sm">Gateway Token</span>
            {instance.openclawToken ? (
              <div className="bg-default-100 p-2 rounded text-xs font-mono break-all text-default-700 select-all border border-default-200">
                {instance.openclawToken}
              </div>
            ) : (
              <span className="text-default-400 text-xs italic">Unable to retrieve token</span>
            )}
          </div>

          {instance.hostPathFolder && (
            <div className="flex flex-col gap-1 mt-2">
              <span className="text-default-600 text-sm">Host Mount Path</span>
              <div className="bg-default-100 p-2 rounded text-xs font-mono break-all text-default-700 select-all border border-default-200">
                {instance.hostPathFolder}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
