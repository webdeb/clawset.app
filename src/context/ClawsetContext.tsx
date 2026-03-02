import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { invoke } from "../lib/invoke";
import { listen } from "@tauri-apps/api/event";
import { createAuthorizationFlow, exchangeAuthorizationCode } from "../lib/login-codex";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useInstances, 
  useInstancePoll, 
  usePlugins, 
  useAuthStatus, 
  useHostResources,
  QUERY_KEYS
} from "../lib/queries";

// ─── Types ──────────────────────────────────────────────────

export type InstanceStatus = "Running" | "Stopped" | "NotInstalled" | "Unknown";

export interface InstanceView {
  id: string;
  name: string;
  port: number;
  path: string;
  status?: string; // "running" | "stopped" | undefined
}

export interface ClawsetInstance {
  // From instance_list
  id: string;
  name: string;
  ip: string;
  status: InstanceStatus;
  provider: string;
  meta?: { os?: string };

  // From instance_get (detailed)
  resources?: { cpus?: string; memory?: string; storage?: string };
  mounts?: Record<string, string>;
  hostPathFolder?: string;
  nodeInstalled?: string;
  openclawInstalled?: boolean;
  isProvisioning?: boolean;

  // From agent app interactions
  openclawStatus?: any;
  openclawConfig?: any;
  agentAuth?: any;

  // Dynamic views from .clawset/views.json
  views?: InstanceView[];
}

export interface HostResources {
  free_memory: number;
  total_memory: number;
  total_cpus: number;
  available_disk: number;
  total_disk: number;
}

export interface PluginInfo {
  id: string;
  name: string;
  type: string;
  version: string;
  description: string;
  path: string;
}

export interface AuthProviderInfo {
  id: string;
  name: string;
  description?: string;
  method: string; // "api_key" | "oauth2_pkce"
  placeholder?: string;
  docsUrl?: string;
}

interface ClawsetContextType {
  // Provider state
  isProviderAvailable: boolean;
  activeProviderId: string;
  activeAppId: string;
  plugins: PluginInfo[];

  // UI context: "system" or an instance name
  activeContext: string;
  setActiveContext: (ctx: string) => void;

  // Instance state
  instances: ClawsetInstance[];
  selectedInstanceName: string | null;
  selectedInstance: ClawsetInstance | null;
  hostResources: HostResources | null;
  loading: boolean;
  error: string | null;

  // Provision state
  provisioningInstanceName: string | null;
  provisionLogs: string[];

  // Auth state
  authProviders: AuthProviderInfo[];
  authStatus: Record<string, boolean>;

  // Actions
  setSelectedInstanceName: (name: string) => void;
  refreshInstances: () => Promise<void>;
  refreshPlugins: () => Promise<void>;
  installInstance: (providerId: string, name: string, memory: string, cpus: string, disk: string) => Promise<void>;
  provisionInstance: (name: string, hostPath: string) => Promise<void>;
  startInstance: (name: string) => Promise<void>;
  stopInstance: (name: string) => Promise<void>;
  destroyInstance: (name: string) => Promise<void>;
  syncOpenclawStatus: (name: string) => Promise<void>;
  syncAgentAuth: (name: string) => Promise<void>;
  appAction: (instanceId: string, action: string) => Promise<any>;
  readInstanceFile: (instanceId: string, remotePath: string) => Promise<any>;
  writeInstanceFile: (instanceId: string, remotePath: string, content: string) => Promise<any>;

  // Auth actions
  saveApiKey: (providerId: string, key: string) => Promise<void>;
  startOAuthFlow: (providerId: string) => Promise<string>;
  completeOAuthFlow: (providerId: string, redirectUrl: string) => Promise<void>;
}

const ClawsetContext = createContext<ClawsetContextType | undefined>(undefined);

const PREFERRED_INSTANCE_KEY = "clawset_preferred_instance";
const DEFAULT_PROVIDER = "multipass";
const DEFAULT_APP = "openclaw";

const CLAWSET_DIR = "$HOME/clawset/.clawset";

export function ClawsetProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [provisioningInstanceName, setProvisioningInstanceName] = useState<string | null>(null);
  const [selectedInstanceName, setSelectedInstanceName] = useState<string | null>(() => {
    return localStorage.getItem(PREFERRED_INSTANCE_KEY);
  });
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);
  const [oauthPkceState, setOauthPkceState] = useState<Record<string, { verifier: string; state: string }>>({});
  const [activeContext, setActiveContextRaw] = useState<string>("system");

  const activeProviderId = DEFAULT_PROVIDER;
  const activeAppId = DEFAULT_APP;

  // ─── Queries ───────────────────────────────────────────────

  const { data: hostResources = null } = useHostResources();
  const { data: plugins = [], refetch: refreshPluginsQuery } = usePlugins();
  const { data: authStatus = {}, refetch: refreshAuthStatusQuery } = useAuthStatus();
  
  // Calculate isAnyProvisioning to speed up polling during install
  const isAnyProvisioning = provisioningInstanceName !== null;
  
  const { 
    data: baseInstances = [], 
    isLoading: instancesLoading,
    error: instancesError,
    refetch: refreshInstancesQuery,
    isSuccess: isProviderAvailable
  } = useInstances(activeProviderId, isAnyProvisioning);

  const { data: pollData } = useInstancePoll(
    activeProviderId, 
    selectedInstanceName, 
    activeAppId, 
    isAnyProvisioning
  );

  // ─── Computed State ────────────────────────────────────────

  const authProviders = plugins
    .filter(p => p.type === "ai-provider")
    .map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      method: "oauth2_pkce", // TODO: read from manifest
    }));

  // Combine base instances with polled details for the selected instance
  const instances = baseInstances.map(inst => {
    if (inst.name === selectedInstanceName && pollData) {
      const details = pollData.details;
      const appStatus = pollData.appStatus;
      
      const hostMount = details.mounts ? Object.values(details.mounts)[0] as string : undefined;
      
      let finalViews = pollData.views;
      // If no views from instance, fall back to manifest defaults
      if (finalViews.length === 0) {
        // Note: we'd need a separate fetch for plugin_get_manifest if we wanted to dynamically 
        // fall back here, but for now we hardcode the fallback to match previous behavior
        finalViews = [{ id: "gateway", name: "Gateway", port: 18789, path: "/" }];
      }

      return {
        ...inst,
        resources: details.resources || {},
        mounts: details.mounts || {},
        hostPathFolder: hostMount || undefined,
        ip: details.ip || inst.ip,
        status: details.status || inst.status,
        meta: details.meta || inst.meta,
        nodeInstalled: appStatus.node_installed || undefined,
        openclawInstalled: appStatus.openclaw_installed || false,
        isProvisioning: appStatus.is_provisioning || false,
        openclawStatus: appStatus.openclaw_status || {},
        views: finalViews,
      };
    }
    return inst;
  });

  const selectedInstance = instances.find(inst => inst.name === selectedInstanceName) || null;
  const loading = instancesLoading;
  const error = instancesError ? (instancesError as Error).toString() : null;

  // When switching context to an instance, auto-sync selectedInstance
  const setActiveContext = useCallback((ctx: string) => {
    setActiveContextRaw(ctx);
    if (ctx !== "system") {
      setSelectedInstanceName(ctx);
      localStorage.setItem(PREFERRED_INSTANCE_KEY, ctx);
    }
  }, []);

  // Set default selection if none selected and instances arrive
  useEffect(() => {
    if (baseInstances.length > 0 && !selectedInstanceName) {
      const first = baseInstances[0].name;
      setSelectedInstanceName(first);
      localStorage.setItem(PREFERRED_INSTANCE_KEY, first);
    }
  }, [baseInstances, selectedInstanceName]);

  // Provisioning log listener
  useEffect(() => {
    const unlisten = listen<string>("provision-log", (event) => {
      setProvisionLogs(prev => [...prev, event.payload]);
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // ─── Dummy callbacks for backwards compatibility ───────────
  // These are replaced by automatic TanStack Query backgrounds refetches, 
  // but kept in the context value so we don't need to change all components yet.

  const refreshInstances = useCallback(async () => {
    await refreshInstancesQuery();
  }, [refreshInstancesQuery]);

  const refreshPlugins = useCallback(async () => {
    await refreshPluginsQuery();
    await refreshAuthStatusQuery();
  }, [refreshPluginsQuery, refreshAuthStatusQuery]);

  const handleSetSelectedInstance = useCallback((name: string) => {
    setSelectedInstanceName(name);
    localStorage.setItem(PREFERRED_INSTANCE_KEY, name);
  }, []);

  const installInstance = useCallback(async (providerId: string, name: string, memory: string, cpus: string, disk: string) => {
    setProvisioningInstanceName(name);
    setProvisionLogs([]);
    try {
      await invoke("instance_create", {
        providerId,
        params: { name, memory, cpus, disk }
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSTANCES(providerId) });
      handleSetSelectedInstance(name);
    } catch (error: any) {
      setProvisionLogs(prev => [...prev, `ERROR: ${error}`]);
      throw error;
    } finally {
      setProvisioningInstanceName(null);
    }
  }, [activeProviderId, handleSetSelectedInstance, queryClient]);

  const provisionInstance = useCallback(async (name: string, _hostPath: string) => {
    setProvisioningInstanceName(name);
    setProvisionLogs([]);
    try {
      await invoke("app_install", {
        providerId: activeProviderId,
        instanceId: name,
        appId: activeAppId,
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSTANCES(activeProviderId) });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSTANCE_POLL(activeProviderId, name) });
      handleSetSelectedInstance(name);
    } catch (error: any) {
      setProvisionLogs(prev => [...prev, `ERROR: ${error}`]);
      throw error;
    } finally {
      setProvisioningInstanceName(null);
    }
  }, [activeProviderId, activeAppId, handleSetSelectedInstance, queryClient]);

  const startInstance = useCallback(async (name: string) => {
    try {
      await invoke("instance_start", {
        providerId: activeProviderId,
        instanceId: name
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSTANCES(activeProviderId) });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSTANCE_POLL(activeProviderId, name) });
    } finally {
      // Done
    }
  }, [activeProviderId, queryClient]);

  const stopInstance = useCallback(async (name: string) => {
    try {
      await invoke("instance_stop", {
        providerId: activeProviderId,
        instanceId: name,
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSTANCES(activeProviderId) });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSTANCE_POLL(activeProviderId, name) });
    } finally {
      // Done
    }
  }, [activeProviderId, queryClient]);

  const destroyInstance = useCallback(async (name: string) => {
    try {
      if (!activeProviderId) return;
      await invoke("instance_destroy", {
        providerId: activeProviderId,
        instanceId: name,
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSTANCES(activeProviderId) });
      if (selectedInstanceName === name) {
        setSelectedInstanceName(null);
        setActiveContext("system");
      }
    } finally {
      // Done
    }
  }, [activeProviderId, queryClient, selectedInstanceName, setSelectedInstanceName, setActiveContext]);

  const syncOpenclawStatus = useCallback(async (name: string) => {
    try {
      const statusResult: any = await invoke("instance_exec", {
        providerId: activeProviderId,
        instanceId: name,
        cmd: "source ~/.bashrc 2>/dev/null; openclaw status --all --json 2>/dev/null || echo '{}'"
      });

      // Read config from the path declared in the agent app's manifest
      const configResult: any = await invoke("instance_exec", {
        providerId: activeProviderId,
        instanceId: name,
        cmd: `cat $HOME/clawset/.openclaw/openclaw.json 2>/dev/null || echo '{}'`
      });

      let status = {};
      let config = {};
      try { status = JSON.parse(statusResult?.stdout || "{}"); } catch { /* */ }
      try { config = JSON.parse(configResult?.stdout || "{}"); } catch { /* */ }

      // Update poll cache so UI reflects immediately
      queryClient.setQueryData(QUERY_KEYS.INSTANCE_POLL(activeProviderId, name), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          appStatus: {
            ...old.appStatus,
            openclaw_status: status,
            openclaw_config: config,
          }
        };
      });
    } catch (e) {
      console.error(`Failed to sync OpenClaw status for ${name}:`, e);
    }
  }, [activeProviderId, queryClient]);

  const syncAgentAuth = useCallback(async (name: string) => {
    try {
      const result: any = await invoke("instance_exec", {
        providerId: activeProviderId,
        instanceId: name,
        cmd: `cat $HOME/clawset/.openclaw/agents/main/agent/auth-profiles.json 2>/dev/null || echo '{}'`
      });

      let parsed = {};
      try { parsed = JSON.parse(result?.stdout || "{}"); } catch { /* */ }

      queryClient.setQueryData(QUERY_KEYS.INSTANCE_POLL(activeProviderId, name), (old: any) => {
        if (!old) return old;
        return {
          ...old,
          appStatus: {
            ...old.appStatus,
            agentAuth: parsed,
          }
        };
      });
    } catch (e) {
      console.error(`Failed to sync agent auth for ${name}:`, e);
    }
  }, [activeProviderId, queryClient]);

  const appAction = useCallback(async (instanceId: string, action: string) => {
    const res = await invoke("app_action", {
      providerId: activeProviderId,
      instanceId,
      appId: activeAppId,
      action,
    });
    // Bust cache if action likely caused state change
    if (action !== "status") {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.INSTANCE_POLL(activeProviderId, instanceId) });
    }
    return res;
  }, [activeProviderId, activeAppId, queryClient]);

  const readInstanceFile = useCallback(async (instanceId: string, remotePath: string) => {
    return invoke("app_read_file", {
      providerId: activeProviderId,
      instanceId,
      remotePath,
    });
  }, [activeProviderId]);

  const writeInstanceFile = useCallback(async (instanceId: string, remotePath: string, content: string) => {
    return invoke("app_write_file", {
      providerId: activeProviderId,
      instanceId,
      remotePath,
      content,
    });
  }, [activeProviderId]);

  // ─── Auth actions ──────────────────────────────────────────

  const saveApiKey = useCallback(async (providerId: string, key: string) => {
    try {
      await invoke("auth_save", {
        providerId,
        authJson: JSON.stringify({ type: "api_key", key }, null, 2),
      });
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.AUTH_STATUS() });
    } catch (e) {
      console.error(`Failed to save API key for ${providerId}:`, e);
      throw e;
    }
  }, [queryClient]);

  const startOAuthFlow = useCallback(async (providerId: string) => {
    // Use the generic PKCE flow (currently only openai-codex)
    const { url, verifier, state } = await createAuthorizationFlow();
    setOauthPkceState(prev => ({ ...prev, [providerId]: { verifier, state } }));
    return url;
  }, []);

  const completeOAuthFlow = useCallback(async (providerId: string, redirectUrl: string) => {
    const pkce = oauthPkceState[providerId];
    if (!pkce) throw new Error("No active OAuth flow for this provider.");

    const interceptedUrlObj = new URL(redirectUrl);
    const code = interceptedUrlObj.searchParams.get("code");
    const returnedState = interceptedUrlObj.searchParams.get("state");

    if (returnedState !== pkce.state) {
      throw new Error("Invalid state parameter. Please try again.");
    }
    if (!code) throw new Error("No authorization code found.");

    const tokenData = await exchangeAuthorizationCode(code, pkce.verifier);

    await invoke("auth_save", {
      providerId,
      authJson: JSON.stringify({
        type: "oauth2",
        access: tokenData.access,
        refresh: tokenData.refresh,
        expires: tokenData.expires,
        accountId: tokenData.accountId,
      }, null, 2),
    });

    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.AUTH_STATUS() });
    
    setOauthPkceState(prev => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });

    // Push auth to all running instances
    for (const inst of instances.filter(i => i.status === "Running")) {
      try {
        await invoke("instance_exec", {
          providerId: activeProviderId,
          instanceId: inst.name,
          cmd: `mkdir -p ${CLAWSET_DIR}/auth && cat > ${CLAWSET_DIR}/auth/${providerId}.json << 'CLAWSET_EOF'\n${JSON.stringify({ type: "oauth2", access: tokenData.access, refresh: tokenData.refresh, expires: tokenData.expires }, null, 2)}\nCLAWSET_EOF`
        });
      } catch (e) {
        console.error(`Failed to push auth to ${inst.name}:`, e);
      }
    }
  }, [oauthPkceState, instances, activeProviderId, queryClient]);

  // ─── Context value ─────────────────────────────────────────

  const value: ClawsetContextType = {
    isProviderAvailable,
    activeProviderId,
    activeAppId,
    plugins,
    activeContext,
    setActiveContext,
    instances,
    selectedInstance,
    selectedInstanceName,
    hostResources,
    loading,
    error,
    provisionLogs,
    provisioningInstanceName,
    authProviders,
    authStatus,
    setSelectedInstanceName: handleSetSelectedInstance,
    refreshInstances,
    refreshPlugins,
    installInstance,
    provisionInstance,
    startInstance,
    stopInstance,
    destroyInstance,
    syncOpenclawStatus,
    syncAgentAuth,
    appAction,
    readInstanceFile,
    writeInstanceFile,
    saveApiKey,
    startOAuthFlow,
    completeOAuthFlow,
  };

  return <ClawsetContext.Provider value={value}>{children}</ClawsetContext.Provider>;
}

export function useClawset() {
  const context = useContext(ClawsetContext);
  if (context === undefined) {
    throw new Error("useClawset must be used within a ClawsetProvider");
  }
  return context;
}
