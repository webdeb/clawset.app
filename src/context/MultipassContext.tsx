import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type InstanceStatus = "Running" | "Stopped" | "NotInstalled" | "Unknown";

export interface MultipassInstance {
  // this data is available from multipass list
  name: string;
  ip: string;
  ubuntuVersion?: string;
  status: InstanceStatus;
  
  // this data must be fetched from individual instance, or even from within the instance, so fetch only for selected instance.
  hostPathFolder?: string;
  memory?: string;
  cpus?: string;
  storage?: string;
  nodeInstalled?: string;
  openclawInstalled?: boolean;
  openclawStatus?: any;
  openclawConfig?: any;
  agentAuth?: any;
  isProvisioning?: boolean;
}

export interface HostResources {
  free_memory: number;
  total_memory: number;
  total_cpus: number;
  available_disk: number;
  total_disk: number;
}

interface MultipassContextType {
  isMultipassInstalled: boolean;
  instances: MultipassInstance[];
  selectedInstanceName: string | null;
  selectedInstance: MultipassInstance | null;
  hostResources: HostResources | null;
  loading: boolean;
  error: string | null;
  setSelectedInstanceName: (name: string) => void;
  refreshInstances: () => Promise<void>;
  provisioningInstanceName: string | null;
  provisionLogs: string[];
  installInstance: (name: string, memory: string, cpus: string, disk: string) => Promise<void>;
  provisionInstance: (name: string, hostPath: string) => Promise<void>;
  startInstance: (name: string) => Promise<void>;
  syncOpenclawStatus: (name: string) => Promise<void>;
  syncAgentAuth: (name: string) => Promise<void>;
}

const MultipassContext = createContext<MultipassContextType | undefined>(undefined);

const PREFERRED_INSTANCE_KEY = "clawset_preferred_instance";

export function MultipassProvider({ children }: { children: ReactNode }) {
  const [isMultipassInstalled, setIsMultipassInstalled] = useState(true);
  const [provisioningInstanceName, setProvisioningInstanceName] = useState<string | null>(null);
  const [instances, setInstances] = useState<MultipassInstance[]>([]);
  const [selectedInstanceName, setSelectedInstanceName] = useState<string | null>(null);
  const [hostResources, setHostResources] = useState<HostResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);

  const selectedInstance = instances.find(inst => inst.name === selectedInstanceName) || null;

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const res: HostResources = await invoke("get_host_resources");
        setHostResources(res);
      } catch (e) {
        console.error("Failed to fetch host resources:", e);
      }
    };
    fetchResources();

    const unlisten = listen<string>("provision-log", (event) => {
      setProvisionLogs(prev => [...prev, event.payload]);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const fetchInstanceDetails = async (name: string) => {
    try {
      const currentInst = instances.find(inst => inst.name === name);
      const isCurrentlyProvisioning = provisioningInstanceName === name || currentInst?.isProvisioning;

      // If the instance is currently provisioning, avoid hitting it with heavy commands
      if (isCurrentlyProvisioning) {
        try {
          const logContents: string = await invoke("read_provision_log", { instanceName: name });
          if (logContents) {
            setProvisionLogs(logContents.split('\n'));
            if (logContents.includes("==> Provisioning Complete")) {
              setInstances(prev => prev.map(inst => 
                inst.name === name ? { ...inst, isProvisioning: false } : inst
              ));
            }
          }
        } catch(e) {
          console.error(`Error fetching provision logs for ${name}:`, e);
        }
        return;
      }

      const details: any = await invoke("get_multipass_instance_details", { instanceName: name });
      
      let newProvisioningState = details.is_provisioning || false;

      setInstances(prev => prev.map(inst => {
        if (inst.name === name) {
          return {
            ...inst,
            hostPathFolder: details.host_path_folder || undefined,
            memory: details.memory || undefined,
            cpus: details.cpus || undefined,
            storage: details.storage || undefined,
            nodeInstalled: details.node_installed || undefined,
            openclawInstalled: details.openclaw_installed || false,
            isProvisioning: newProvisioningState,
          };
        }
        return inst;
      }));

      // if the instance just started provisioning, fetch the logs immediately
      if (newProvisioningState) {
          try {
              const logContents: string = await invoke("read_provision_log", { instanceName: name });
              if (logContents) {
                  setProvisionLogs(logContents.split('\n'));
              }
          } catch(e) {
              console.error(`Error fetching provision logs for ${name}:`, e);
          }
      }

    } catch (e: any) {
      console.error(`Error fetching details for ${name}:`, e);
    }
  };

  const refreshInstances = async () => {
    try {
      const checkCmd: boolean = await invoke("check_multipass");
      setIsMultipassInstalled(checkCmd);

      if (!checkCmd) {
        setLoading(false);
        return;
      }

      const res: any[] = await invoke("list_multipass_instances");
      
      setInstances(prev => {
        const newInstances = res.map(inst => {
          const existing = prev.find(p => p.name === inst.name);
          return {
            ...existing,
            name: inst.name,
            ip: inst.ip,
            status: inst.status,
            ubuntuVersion: inst.ubuntu_version || undefined,
          } as MultipassInstance;
        });

        return newInstances;
      });

      // Handle default selection
      if (res.length > 0) {
        setSelectedInstanceName(currentSelected => {
          const storedPreference = localStorage.getItem(PREFERRED_INSTANCE_KEY);
          if (currentSelected && res.find(r => r.name === currentSelected)) {
             return currentSelected;
          }
          if (storedPreference && res.find(r => r.name === storedPreference)) {
             return storedPreference;
          }
          return res[0].name;
        });
      } else {
        setSelectedInstanceName(null);
      }
      
    } catch (e: any) {
      setError(e.toString());
    } finally {
      if (loading) setLoading(false);
    }
  };

  const isAnyProvisioning = provisioningInstanceName !== null || instances.some(inst => inst.isProvisioning);

  // Poll list and selected instance details
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const runPoll = async () => {
      if (!isMounted) return;

      // Avoid hammering the multipass daemon with `check_multipass` and `list` while provisioning
      if (!isAnyProvisioning) {
        await refreshInstances();
      }
      if (selectedInstanceName) {
        await fetchInstanceDetails(selectedInstanceName);
      }

      if (isMounted) {
        const intervalTime = isAnyProvisioning ? 2000 : 10000;
        timeoutId = setTimeout(runPoll, intervalTime);
      }
    };

    runPoll();
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [selectedInstanceName, isAnyProvisioning]);

  const handleSetSelectedInstance = (name: string) => {
    setSelectedInstanceName(name);
    localStorage.setItem(PREFERRED_INSTANCE_KEY, name);
    fetchInstanceDetails(name);
  };

  const installInstance = async (name: string, memory: string, cpus: string, disk: string) => {
    setProvisioningInstanceName(name);
    setLoading(true);
    setProvisionLogs([]); // Clear previous logs
    try {
      await invoke("install_openclaw", { instanceName: name, memory, cpus, disk });
      await refreshInstances();
      handleSetSelectedInstance(name);
    } catch (error: any) {
      setProvisionLogs(prev => [...prev, `ERROR: ${error}`]);
      throw error;
    } finally {
      setLoading(false);
      setProvisioningInstanceName(null);
    }
  };

  const provisionInstance = async (name: string, hostPath: string) => {
    setProvisioningInstanceName(name);
    setLoading(true);
    setProvisionLogs([]); // Clear previous logs
    try {
      await invoke("provision_instance", { instanceName: name, sharedFolder: hostPath });
      await refreshInstances();
      handleSetSelectedInstance(name);
    } catch (error: any) {
      setProvisionLogs(prev => [...prev, `ERROR: ${error}`]);
      throw error;
    } finally {
      setLoading(false);
      setProvisioningInstanceName(null);
    }
  };

  const startInstance = async (name: string) => {
    setLoading(true);
    try {
      await invoke("start_openclaw", { instanceName: name });
      await refreshInstances();
    } finally {
      setLoading(false);
    }
  };

  const syncOpenclawStatus = async (name: string) => {
    try {
      const rawJsonString: string = await invoke("sync_openclaw_status", { instanceName: name });
      const parsed = JSON.parse(rawJsonString);
      setInstances(prev => prev.map(inst => 
        inst.name === name ? { 
            ...inst, 
            openclawStatus: parsed.status,
            openclawConfig: parsed.config
        } : inst
      ));
    } catch(e) {
      console.error(`Failed to sync OpenClaw status for ${name}:`, e);
    }
  };

  const syncAgentAuth = async (name: string) => {
    try {
      const rawJsonString: string = await invoke("read_agent_auth", { instanceName: name });
      const parsed = JSON.parse(rawJsonString);
      setInstances(prev => prev.map(inst => 
        inst.name === name ? { 
            ...inst, 
            agentAuth: parsed
        } : inst
      ));
    } catch(e) {
      console.error(`Failed to sync agent auth for ${name}:`, e);
    }
  };

  const value = {
    isMultipassInstalled,
    instances,
    selectedInstance,
    selectedInstanceName,
    hostResources,
    loading,
    error,
    setSelectedInstanceName: handleSetSelectedInstance,
    refreshInstances,
    provisionLogs,
    installInstance,
    provisioningInstanceName,
    provisionInstance,
    startInstance,
    syncOpenclawStatus,
    syncAgentAuth
  };

  console.log("MultipassContext value:", value);

  return <MultipassContext.Provider value={value}>{children}</MultipassContext.Provider>;
}

export function useMultipass() {
  const context = useContext(MultipassContext);
  if (context === undefined) {
    throw new Error("useMultipass must be used within a MultipassProvider");
  }
  return context;
}
