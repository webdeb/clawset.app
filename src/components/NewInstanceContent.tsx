import { useState } from "react";
import { Card, Button, Input, Slider } from "@heroui/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useNavigate } from "react-router-dom";
import { useClawset } from "../context/ClawsetContext";

export function NewInstanceContent() {
  const { instances, plugins, installInstance, provisionLogs, hostResources } = useClawset();
  const navigate = useNavigate();
  
  const providers = plugins.filter(p => p.type === "instance-provider");
  const [selectedProvider, setSelectedProvider] = useState<string>(
    providers.length > 0 ? providers[0].id : ""
  );
  
  // Max limits (80% of host)
  const hostTotalRamGB = hostResources?.total_memory ? Math.floor(hostResources.total_memory / (1024 ** 3)) : 16;
  const hostTotalCpus = hostResources?.total_cpus || 8;
  const hostAvailableDiskGB = hostResources?.available_disk ? Math.floor(hostResources.available_disk / (1024 ** 3)) : 100;

  const maxRamGB = Math.max(1, Math.floor(hostTotalRamGB * 0.8));
  const maxCpuCount = Math.max(1, Math.floor(hostTotalCpus * 0.8));
  const maxDiskGB = Math.max(2, Math.floor(hostAvailableDiskGB * 0.8));

  // Determine a default sequential instance name (e.g. clawset-1)
  const defaultInstanceName = `clawset-${instances.length + 1}`;

  const [name, setName] = useState<string>(defaultInstanceName);
  const [memory, setMemory] = useState<number>(2);
  const [cpus, setCpus] = useState<number>(2);
  const [disk, setDisk] = useState<number>(2);
  const [folder, setFolder] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Safely clamp values
  const safeMemory = Math.min(Math.max(1, memory), maxRamGB);
  const safeCpus = Math.min(Math.max(1, cpus), maxCpuCount);
  const safeDisk = Math.min(Math.max(2, disk), maxDiskGB);

  const isMemoryHigh = safeMemory >= Math.floor(maxRamGB * 0.8);
  const isCpuHigh = safeCpus >= Math.floor(maxCpuCount * 0.8);
  const isDiskHigh = safeDisk >= Math.floor(maxDiskGB * 0.8);

  const handleSelectFolder = async () => {
    try {
      const selected = await openDialog({
        title: 'Select Target Folder for Clawset Data mapping',
        directory: true,
        multiple: false,
      });

      if (!selected) return;
      
      let hostPathId = "";
      if (Array.isArray(selected)) {
        hostPathId = selected.length > 0 ? selected[0] : "";
      } else {
        hostPathId = selected;
      }

      setFolder(hostPathId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleProvision = async () => {
    if (!folder || !name.trim() || !selectedProvider) return;
    
    setActionLoading(true);
    try {
      await installInstance(selectedProvider, name, `${safeMemory}G`, `${safeCpus}`, `${safeDisk}G`);
      // Since `installInstance` updates URL context and queries automatically
      navigate(`/instance/${name}`);
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-full min-h-full flex flex-col items-center bg-background text-foreground p-8">
      <Card className="w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            Provision New Environment
          </h2>
          <p className="text-default-500 text-sm">
            Launch a new environment by picking an instance provider.
          </p>
        </div>

        <div className="flex flex-col gap-6 border border-default-200 rounded-lg p-6 bg-default-50/50">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Instance Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              disabled={actionLoading || providers.length === 0}
              className="bg-default-100/50 border border-default-200 rounded-lg text-sm px-3 py-2 outline-none focus:border-primary/50 transition-colors"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {providers.length === 0 && (
              <p className="text-xs text-danger pr-1">
                No instance providers found. Please install a provider plugin first from System settings.
              </p>
            )}
          </div>
        
          <div className="flex flex-col gap-2">
             <label className="text-sm font-medium">Instance Profile Name</label>
             <Input 
                placeholder="e.g. default, clawset-1, development..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={actionLoading}
                className="bg-default-100 rounded-lg text-sm"
             />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">RAM Memory <span className="text-default-400 font-normal">(Total: {hostTotalRamGB} GB)</span></label>
              <span className="text-sm font-semibold">{safeMemory} GB</span>
            </div>
            <Slider 
              step={0.25}
              maxValue={maxRamGB}
              minValue={1}
              value={safeMemory}
              onChange={(value) => setMemory(value as number)}
              isDisabled={actionLoading}
              className="max-w-md"
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            {isMemoryHigh && (
              <p className="text-xs text-warning pl-1">
                Allocating a high threshold of RAM may cause the host system to stutter.
              </p>
            )}
          </div>
          
          <div className="flex flex-col gap-2">
             <div className="flex justify-between items-center">
              <label className="text-sm font-medium">CPU Cores <span className="text-default-400 font-normal">(Total: {hostTotalCpus} Cores)</span></label>
              <span className="text-sm font-semibold">{safeCpus} Cores</span>
            </div>
             <Slider 
              step={1}
              maxValue={maxCpuCount}
              minValue={1}
              value={safeCpus}
              onChange={(value) => setCpus(value as number)}
              isDisabled={actionLoading}
              className="max-w-md"
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            {isCpuHigh && (
              <p className="text-xs text-warning pl-1">
                Allocating almost all Host CPUs might slow down the whole machine during spikes.
              </p>
            )}
          </div>
          
          <div className="flex flex-col gap-2">
             <div className="flex justify-between items-center">
              <label className="text-sm font-medium">Storage Disk Size <span className="text-default-400 font-normal">(Free: {hostAvailableDiskGB} GB)</span></label>
              <span className="text-sm font-semibold">{safeDisk} GB</span>
            </div>
             <Slider 
              step={2}
              maxValue={maxDiskGB}
              minValue={2}
              value={safeDisk}
              onChange={(value) => setDisk(value as number)}
              isDisabled={actionLoading}
              className="max-w-md"
            >
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            {isDiskHigh && (
              <p className="text-xs text-warning pl-1">
                Are you sure you want to allocate {safeDisk}GB of disk space? Make sure you have enough drive room.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 mt-2">
             <label className="text-sm font-medium">Shared Data Path (Required)</label>
             <div className="flex gap-2 items-center">
              <Input 
                 placeholder="Select a folder to mount Clawset data..."
                 value={folder}
                 readOnly={true}
                 className="flex-1 bg-default-100 rounded-lg text-sm"
              />
              <Button onPress={handleSelectFolder} isDisabled={actionLoading} variant="secondary" className="h-[52px]">
                Browse
              </Button>
            </div>
            <p className="text-xs text-default-400">
               Clawset data will be stored here and universally mounted across environments.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <Button 
            className="bg-primary text-primary-foreground" 
            onPress={handleProvision} 
            isDisabled={!folder || !name.trim() || !selectedProvider || actionLoading}
          >
            {actionLoading ? "Provisioning Environment..." : "Start Instance"}
          </Button>
        </div>

        {/* Show Logs if provisioning */}
        {actionLoading && provisionLogs.length > 0 && (
          <div className="flex flex-col gap-2 mt-4 bg-black/95 border border-default-200 p-4 rounded-lg shadow-sm">
             <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-green-500 animate-pulse">
                   Creating Instance...
                </span>
             </div>
             <div className="w-full font-mono text-[10px] sm:text-xs text-green-400 overflow-y-auto h-48 text-left whitespace-pre-wrap flex flex-col gap-1">
                {provisionLogs.map((log, index) => (
                  <span key={index} className={log.startsWith("ERROR:") ? "text-danger" : ""}>{log}</span>
                ))}
             </div>
          </div>
        )}
      </Card>
    </div>
  );
}
