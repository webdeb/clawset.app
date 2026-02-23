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
  openclawRunning?: boolean;
  openclawToken?: string;
}

interface MultipassContextType {
  isMultipassInstalled: boolean;
  instances: MultipassInstance[];
  selectedInstanceName: string | null;
  selectedInstance: MultipassInstance | null;
  loading: boolean;
  error: string | null;
  setSelectedInstanceName: (name: string) => void;
  refreshInstances: () => Promise<void>;
  isProvisioning: boolean;
  provisionLogs: string[];
  installInstance: (name: string, hostPath: string) => Promise<void>;
  setupExistingInstance: (name: string, hostPath: string) => Promise<void>;
  startInstance: (name: string) => Promise<void>;
}

const MultipassContext = createContext<MultipassContextType | undefined>(undefined);

const PREFERRED_INSTANCE_KEY = "clawset_preferred_instance";

export function MultipassProvider({ children }: { children: ReactNode }) {
  const [isMultipassInstalled, setIsMultipassInstalled] = useState(true);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [instances, setInstances] = useState<MultipassInstance[]>([]);
  const [selectedInstanceName, setSelectedInstanceName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);

  const selectedInstance = instances.find(inst => inst.name === selectedInstanceName) || null;

  useEffect(() => {
    const unlisten = listen<string>("provision-log", (event) => {
      setProvisionLogs(prev => [...prev, event.payload]);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const fetchInstanceDetails = async (name: string) => {
    try {
      const details: any = await invoke("get_multipass_instance_details", { instanceName: name });
      
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
            openclawRunning: details.openclaw_running || false,
            openclawToken: details.openclaw_token || undefined,
          };
        }
        return inst;
      }));
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

  // Poll list and selected instance details every 10 seconds
  useEffect(() => {
    const refresh = async () => {
      await refreshInstances();
      if (selectedInstanceName) {
        await fetchInstanceDetails(selectedInstanceName);
      }
    }

    refresh();
    const interval = setInterval(refresh, 10000); 
    
    return () => clearInterval(interval);
  }, [selectedInstanceName]);

  const handleSetSelectedInstance = (name: string) => {
    setSelectedInstanceName(name);
    localStorage.setItem(PREFERRED_INSTANCE_KEY, name);
    fetchInstanceDetails(name);
  };

  const installInstance = async (name: string, hostPath: string) => {
    setLoading(true);
    setProvisionLogs([]); // Clear previous logs
    try {
      await invoke("install_openclaw", { instanceName: name, sharedFolder: hostPath });
      await refreshInstances();
      handleSetSelectedInstance(name);
    } catch (error: any) {
      setProvisionLogs(prev => [...prev, `ERROR: ${error}`]);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const setupExistingInstance = async (name: string, hostPath: string) => {
    setIsProvisioning(true);
    setLoading(true);
    setProvisionLogs([]); // Clear previous logs
    try {
      await invoke("setup_existing_instance", { instanceName: name, sharedFolder: hostPath });
      await refreshInstances();
      handleSetSelectedInstance(name);
    } catch (error: any) {
      setProvisionLogs(prev => [...prev, `ERROR: ${error}`]);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isProvisioning && selectedInstance) {
      
    }
  }, [isProvisioning]);

  const startInstance = async (name: string) => {
    setLoading(true);
    try {
      await invoke("start_openclaw", { instanceName: name });
      await refreshInstances();
    } finally {
      setLoading(false);
    }
  };

  const value = {
    isMultipassInstalled,
    instances,
    selectedInstance,
    selectedInstanceName,
    loading,
    error,
    setSelectedInstanceName: handleSetSelectedInstance,
    refreshInstances,
    provisionLogs,
    installInstance,
    isProvisioning,
    setupExistingInstance,
    startInstance
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
