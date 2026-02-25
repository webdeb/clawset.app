import { useState } from "react";
import { Card, Button, Input, Slider } from "@heroui/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useMultipass } from "../context/MultipassContext";

export function InstanceProvision() {
  const { instances, installInstance, provisionLogs, hostResources } = useMultipass();
  
  // Max limits (80% of host)
  const hostTotalRamGB = hostResources?.total_memory ? Math.floor(hostResources.total_memory / (1024 ** 3)) : 16;
  const hostTotalCpus = hostResources?.total_cpus || 8;
  const hostAvailableDiskGB = hostResources?.available_disk ? Math.floor(hostResources.available_disk / (1024 ** 3)) : 100;

  const maxRamGB = Math.max(1, Math.floor(hostTotalRamGB * 0.8));
  const maxCpuCount = Math.max(1, Math.floor(hostTotalCpus * 0.8));
  const maxDiskGB = Math.max(10, Math.floor(hostAvailableDiskGB * 0.8));

  // Determine a default sequential instance name (e.g. clawset-1)
  const defaultInstanceName = `clawset-${instances.length + 1}`;

  const [name, setName] = useState<string>(defaultInstanceName);
  const [memory, setMemory] = useState<number>(2);
  const [cpus, setCpus] = useState<number>(2);
  const [disk, setDisk] = useState<number>(10);
  const [folder, setFolder] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Safely clamp values between 1 and their respective maxes to prevent warnings triggering erroneously if defaults exceed host capabilities
  const safeMemory = Math.min(Math.max(1, memory), maxRamGB);
  const safeCpus = Math.min(Math.max(1, cpus), maxCpuCount);
  const safeDisk = Math.min(Math.max(10, disk), maxDiskGB);

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
    if (!folder || !name.trim()) return;
    
    setActionLoading(true);
    try {
      await installInstance(name, folder, `${safeMemory}G`, `${safeCpus}`, `${safeDisk}G`);
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-screen flex items-start justify-center bg-background text-foreground p-8 overflow-y-auto">
      <Card className="p-6 w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            Provision New Environment
          </h2>
          <p className="text-default-500 text-sm">
            Please configure the resources for your secure OpenClaw environment.
          </p>
        </div>

        <div className="flex flex-col gap-6 border border-default-200 rounded-lg p-6 bg-default-50/50">
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
              minValue={10}
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
            isDisabled={!folder || !memory || !cpus || !disk || actionLoading}
          >
            {actionLoading ? "Provisioning Environment..." : "Provision Environment"}
          </Button>
        </div>

        {/* Show Logs if provisioning */}
        {actionLoading && provisionLogs.length > 0 && (
          <div className="flex flex-col gap-2 mt-4 bg-black/95 border border-default-200 p-4 rounded-lg shadow-sm">
             <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-semibold text-green-500 animate-pulse">
                   Installing Environment...
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
