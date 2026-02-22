import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

export type InstanceStatus = "Running" | "Stopped" | "NotInstalled" | "Unknown";

export interface MultipassInstance {
  name: string;
  ip: string;
  status: InstanceStatus;
  nodeInstalled?: string;
  openclawInstalled?: boolean;
  openclawRunning?: boolean;
  openclawToken?: string;
}

interface MultipassContextType {
  isMultipassInstalled: boolean;
  instances: MultipassInstance[];
  selectedInstance: string | null;
  loading: boolean;
  error: string | null;
  setSelectedInstance: (name: string) => void;
  refreshInstances: () => Promise<void>;
  installInstance: (name: string, hostPath: string) => Promise<void>;
  startInstance: (name: string) => Promise<void>;
}

const MultipassContext = createContext<MultipassContextType | undefined>(undefined);

const PREFERRED_INSTANCE_KEY = "clawset_preferred_instance";

export function MultipassProvider({ children }: { children: ReactNode }) {
  const [isMultipassInstalled, setIsMultipassInstalled] = useState(true);
  const [instances, setInstances] = useState<MultipassInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInstanceDetails = async (name: string): Promise<MultipassInstance> => {
    try {
      const statusResponse: string = await invoke("get_openclaw_status", { instanceName: name });
      const parts = statusResponse.split("|");
      
      let status: InstanceStatus = "Unknown";
      let ip = "";
      let token = undefined;

      if (parts.length >= 2) {
        status = parts[0] as InstanceStatus;
        ip = parts[1];

        if (status === "Running") {
          try {
             token = (await invoke("get_openclaw_token", { instanceName: name })) as string;
          } catch(e: any) {
             console.warn(`Could not retrieve token for ${name}:`, e.toString());
          }
        }
      } else {
        status = statusResponse as InstanceStatus;
      }

      return { name, ip, status, token };
    } catch (e: any) {
      console.error(`Error fetching details for ${name}:`, e);
      return { name, ip: "", status: "Unknown" };
    }
  };

  const refreshInstances = async () => {
    setLoading(true);
    setError(null);
    try {
      const checkCmd: boolean = await invoke("check_multipass");
      setIsMultipassInstalled(checkCmd);

      if (!checkCmd) {
        setLoading(false);
        return;
      }

      const res: string[] = await invoke("list_multipass_instances");
      const openclawNames = res.filter((name) => name.startsWith(""));
      
      const detailedInstances = await Promise.all(openclawNames.map(fetchInstanceDetails));
      setInstances(detailedInstances);

      // Restore selection preference
      const storedPreference = localStorage.getItem(PREFERRED_INSTANCE_KEY);
      if (openclawNames.length > 0) {
        const initialInstance = storedPreference && openclawNames.includes(storedPreference)
          ? storedPreference
          : openclawNames[0];
          
        setSelectedInstance(initialInstance);
      } else {
        setSelectedInstance(null);
      }

    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshInstances();

    const interval = setInterval(() => {
      refreshInstances();
    }, 10000); 
    
    return () => clearInterval(interval);
  }, []);

  const handleSetSelectedInstance = (name: string) => {
    setSelectedInstance(name);
    localStorage.setItem(PREFERRED_INSTANCE_KEY, name);
  };

  const installInstance = async (name: string, hostPath: string) => {
    setLoading(true);
    try {
      await invoke("install_openclaw", { instanceName: name, sharedFolder: hostPath });
      await refreshInstances();
      handleSetSelectedInstance(name);
    } finally {
      setLoading(false);
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

  const value = {
    isMultipassInstalled,
    instances,
    selectedInstance,
    loading,
    error,
    setSelectedInstance: handleSetSelectedInstance,
    refreshInstances,
    installInstance,
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
