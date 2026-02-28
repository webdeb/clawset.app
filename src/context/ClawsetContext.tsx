import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createAuthorizationFlow, exchangeAuthorizationCode } from "../lib/login-codex";

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
  installInstance: (name: string, memory: string, cpus: string, disk: string) => Promise<void>;
  provisionInstance: (name: string, hostPath: string) => Promise<void>;
  startInstance: (name: string) => Promise<void>;
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
const VIEWS_FILE = `${CLAWSET_DIR}/views.json`;
const CONTEXT_FILE = `${CLAWSET_DIR}/context.json`;

export function ClawsetProvider({ children }: { children: ReactNode }) {
  const [isProviderAvailable, setIsProviderAvailable] = useState(true);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [provisioningInstanceName, setProvisioningInstanceName] = useState<string | null>(null);
  const [instances, setInstances] = useState<ClawsetInstance[]>([]);
  const [selectedInstanceName, setSelectedInstanceName] = useState<string | null>(null);
  const [hostResources, setHostResources] = useState<HostResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provisionLogs, setProvisionLogs] = useState<string[]>([]);
  const [authProviders, setAuthProviders] = useState<AuthProviderInfo[]>([]);
  const [authStatus, setAuthStatus] = useState<Record<string, boolean>>({});
  const [oauthPkceState, setOauthPkceState] = useState<Record<string, { verifier: string; state: string }>>({});

  const activeProviderId = DEFAULT_PROVIDER;
  const activeAppId = DEFAULT_APP;
  const selectedInstance = instances.find(inst => inst.name === selectedInstanceName) || null;

  // ─── Bootstrap ─────────────────────────────────────────────

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

  // ─── Plugin discovery + auth providers ─────────────────────

  const refreshPlugins = useCallback(async () => {
    try {
      const result: PluginInfo[] = await invoke("plugin_list");
      const list = Array.isArray(result) ? result : [];
      setPlugins(list);

      // Extract auth providers from ai-provider plugins
      const aiProviders = list.filter(p => p.type === "ai-provider");
      const providers: AuthProviderInfo[] = aiProviders.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        method: "oauth2_pkce", // TODO: read from manifest auth_config.method
        placeholder: undefined,
        docsUrl: undefined,
      }));
      setAuthProviders(providers);

      // Check which providers have stored credentials
      await refreshAuthStatus();
    } catch (e) {
      console.error("Failed to list plugins:", e);
      setPlugins([]);
    }
  }, []);

  const refreshAuthStatus = useCallback(async () => {
    try {
      const result: Record<string, boolean> = await invoke("auth_list_providers");
      setAuthStatus(result || {});
    } catch (e) {
      // auth_list_providers might not be implemented yet — that's OK
      console.error("Failed to check auth status:", e);
    }
  }, []);

  useEffect(() => {
    refreshPlugins();
  }, [refreshPlugins]);

  // ─── Views polling ─────────────────────────────────────────

  const fetchInstanceViews = useCallback(async (name: string, _ip: string) => {
    try {
      // Read .clawset/views.json from inside the instance
      const result: any = await invoke("instance_exec", {
        providerId: activeProviderId,
        instanceId: name,
        cmd: `cat ${VIEWS_FILE} 2>/dev/null || echo '{"views":[]}'`
      });

      let views: InstanceView[] = [];
      try {
        const parsed = JSON.parse(result?.stdout || '{"views":[]}');
        views = (parsed.views || []).map((v: any) => ({
          id: v.id,
          name: v.name,
          port: v.port,
          path: v.path || "/",
          status: v.status,
        }));
      } catch { /* ignore parse errors */ }

      // If no views from instance, fall back to manifest defaults
      if (views.length === 0) {
        // Get views from the agent app manifest
        const agentPlugin = plugins.find(p => p.id === activeAppId);
        if (agentPlugin) {
          try {
            const manifest: any = await invoke("plugin_get_manifest", { id: activeAppId });
            if (manifest?.views) {
              views = Object.entries(manifest.views).map(([key, spec]: [string, any]) => ({
                id: key,
                name: spec.name || key,
                port: spec.port,
                path: spec.path || "/",
              }));
            }
          } catch {
            // plugin_get_manifest might not exist yet — use hardcoded fallback
            views = [{ id: "gateway", name: "Gateway", port: 18789, path: "/" }];
          }
        }
      }

      setInstances(prev => prev.map(inst =>
        inst.name === name ? { ...inst, views } : inst
      ));
    } catch (e) {
      console.error(`Error fetching views for ${name}:`, e);
    }
  }, [activeProviderId, activeAppId, plugins]);

  // ─── Context sync (clawset → agent) ────────────────────────

  const syncContext = useCallback(async (name: string) => {
    try {
      const thisInstance = instances.find(i => i.name === name);
      if (!thisInstance || thisInstance.status !== "Running") return;

      const contextData = {
        orchestrator: "clawset",
        instance: {
          id: thisInstance.id,
          ip: thisInstance.ip,
          provider: thisInstance.provider,
        },
        peers: instances
          .filter(i => i.name !== name && i.status === "Running")
          .map(i => ({
            id: i.id,
            ip: i.ip,
            provider: i.provider,
            apps: [], // TODO: track installed apps per instance
          })),
        auth: {
          available: Object.entries(authStatus).filter(([, v]) => v).map(([k]) => k),
          missing: authProviders.filter(p => !authStatus[p.id]).map(p => p.id),
        },
      };

      await invoke("instance_exec", {
        providerId: activeProviderId,
        instanceId: name,
        cmd: `mkdir -p ${CLAWSET_DIR} && cat > ${CONTEXT_FILE} << 'CLAWSET_EOF'\n${JSON.stringify(contextData, null, 2)}\nCLAWSET_EOF`
      });
    } catch (e) {
      console.error(`Failed to sync context for ${name}:`, e);
    }
  }, [instances, authStatus, authProviders, activeProviderId]);

  // ─── Instance list + details ───────────────────────────────

  const fetchInstanceDetails = useCallback(async (name: string) => {
    try {
      const currentInst = instances.find(inst => inst.name === name);
      const isCurrentlyProvisioning = provisioningInstanceName === name || currentInst?.isProvisioning;

      if (isCurrentlyProvisioning) {
        try {
          const result: any = await invoke("instance_exec", {
            providerId: activeProviderId,
            instanceId: name,
            cmd: "cat /tmp/provision.log 2>/dev/null || echo ''"
          });
          if (result?.stdout) {
            setProvisionLogs(result.stdout.split('\n'));
            if (result.stdout.includes("==> Provisioning Complete")) {
              setInstances(prev => prev.map(inst =>
                inst.name === name ? { ...inst, isProvisioning: false } : inst
              ));
            }
          }
        } catch (e) {
          console.error(`Error fetching provision logs for ${name}:`, e);
        }
        return;
      }

      // 1. Get VM-level info from instance provider
      const details: any = await invoke("instance_get", {
        providerId: activeProviderId,
        instanceId: name
      });

      if (!details) return;

      const hostMount = details.mounts ? Object.values(details.mounts)[0] as string : undefined;

      setInstances(prev => prev.map(inst => {
        if (inst.name === name) {
          return {
            ...inst,
            resources: details.resources || {},
            mounts: details.mounts || {},
            hostPathFolder: hostMount || undefined,
            ip: details.ip || inst.ip,
            status: details.status || inst.status,
            meta: details.meta || inst.meta,
          };
        }
        return inst;
      }));

      // 2. For running instances, get app-level info from agent app status script
      if (details.status === "Running" && (details.ip || currentInst?.ip)) {
        try {
          const appStatus: any = await invoke("app_action", {
            providerId: activeProviderId,
            instanceId: name,
            appId: activeAppId,
            action: "status",
          });

          let parsed: any = {};
          try { parsed = JSON.parse(appStatus?.stdout || "{}"); } catch { /* */ }

          setInstances(prev => prev.map(inst => {
            if (inst.name === name) {
              return {
                ...inst,
                nodeInstalled: parsed.node_installed || undefined,
                openclawInstalled: parsed.openclaw_installed || false,
                isProvisioning: parsed.is_provisioning || false,
                openclawStatus: parsed.openclaw_status || {},
              };
            }
            return inst;
          }));
        } catch (e) {
          console.error(`Error fetching app status for ${name}:`, e);
        }

        // Fetch views + sync context
        await fetchInstanceViews(name, details.ip || currentInst?.ip || "");
        await syncContext(name);
      }
    } catch (e: any) {
      console.error(`Error fetching details for ${name}:`, e);
    }
  }, [instances, provisioningInstanceName, activeProviderId, activeAppId, fetchInstanceViews, syncContext]);

  const refreshInstances = useCallback(async () => {
    try {
      const res: any = await invoke("instance_list", {
        providerId: activeProviderId
      });

      setIsProviderAvailable(true);
      const instanceList = Array.isArray(res) ? res : [];

      setInstances(prev => {
        return instanceList.map((inst: any) => {
          const existing = prev.find(p => p.name === inst.name);
          return {
            ...existing,
            id: inst.id || inst.name,
            name: inst.name,
            ip: inst.ip || "",
            status: inst.status || "Unknown",
            provider: inst.provider || activeProviderId,
            meta: inst.meta || { os: "Ubuntu" },
          } as ClawsetInstance;
        });
      });

      if (instanceList.length > 0) {
        setSelectedInstanceName(currentSelected => {
          const storedPreference = localStorage.getItem(PREFERRED_INSTANCE_KEY);
          if (currentSelected && instanceList.find((r: any) => r.name === currentSelected)) {
            return currentSelected;
          }
          if (storedPreference && instanceList.find((r: any) => r.name === storedPreference)) {
            return storedPreference;
          }
          return instanceList[0].name;
        });
      } else {
        setSelectedInstanceName(null);
      }
    } catch (e: any) {
      setIsProviderAvailable(false);
      setError(e.toString());
    } finally {
      if (loading) setLoading(false);
    }
  }, [activeProviderId, loading]);

  // ─── Polling ───────────────────────────────────────────────

  const isAnyProvisioning = provisioningInstanceName !== null || instances.some(inst => inst.isProvisioning);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const runPoll = async () => {
      if (!isMounted) return;

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

  // ─── Instance actions ──────────────────────────────────────

  const handleSetSelectedInstance = useCallback((name: string) => {
    setSelectedInstanceName(name);
    localStorage.setItem(PREFERRED_INSTANCE_KEY, name);
    fetchInstanceDetails(name);
  }, [fetchInstanceDetails]);

  const installInstance = useCallback(async (name: string, memory: string, cpus: string, disk: string) => {
    setProvisioningInstanceName(name);
    setLoading(true);
    setProvisionLogs([]);
    try {
      await invoke("instance_create", {
        providerId: activeProviderId,
        params: { name, memory, cpus, disk }
      });
      await refreshInstances();
      handleSetSelectedInstance(name);
    } catch (error: any) {
      setProvisionLogs(prev => [...prev, `ERROR: ${error}`]);
      throw error;
    } finally {
      setLoading(false);
      setProvisioningInstanceName(null);
    }
  }, [activeProviderId, refreshInstances, handleSetSelectedInstance]);

  const provisionInstance = useCallback(async (name: string, _hostPath: string) => {
    setProvisioningInstanceName(name);
    setLoading(true);
    setProvisionLogs([]);
    try {
      await invoke("app_install", {
        providerId: activeProviderId,
        instanceId: name,
        appId: activeAppId,
      });
      await refreshInstances();
      handleSetSelectedInstance(name);
    } catch (error: any) {
      setProvisionLogs(prev => [...prev, `ERROR: ${error}`]);
      throw error;
    } finally {
      setLoading(false);
      setProvisioningInstanceName(null);
    }
  }, [activeProviderId, activeAppId, refreshInstances, handleSetSelectedInstance]);

  const startInstance = useCallback(async (name: string) => {
    setLoading(true);
    try {
      await invoke("instance_start", {
        providerId: activeProviderId,
        instanceId: name
      });
      await refreshInstances();
    } finally {
      setLoading(false);
    }
  }, [activeProviderId, refreshInstances]);

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

      setInstances(prev => prev.map(inst =>
        inst.name === name ? { ...inst, openclawStatus: status, openclawConfig: config } : inst
      ));
    } catch (e) {
      console.error(`Failed to sync OpenClaw status for ${name}:`, e);
    }
  }, [activeProviderId]);

  const syncAgentAuth = useCallback(async (name: string) => {
    try {
      const result: any = await invoke("instance_exec", {
        providerId: activeProviderId,
        instanceId: name,
        cmd: `cat $HOME/clawset/.openclaw/agents/main/agent/auth-profiles.json 2>/dev/null || echo '{}'`
      });

      let parsed = {};
      try { parsed = JSON.parse(result?.stdout || "{}"); } catch { /* */ }

      setInstances(prev => prev.map(inst =>
        inst.name === name ? { ...inst, agentAuth: parsed } : inst
      ));
    } catch (e) {
      console.error(`Failed to sync agent auth for ${name}:`, e);
    }
  }, [activeProviderId]);

  const appAction = useCallback(async (instanceId: string, action: string) => {
    return invoke("app_action", {
      providerId: activeProviderId,
      instanceId,
      appId: activeAppId,
      action,
    });
  }, [activeProviderId, activeAppId]);

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
      setAuthStatus(prev => ({ ...prev, [providerId]: true }));
    } catch (e) {
      console.error(`Failed to save API key for ${providerId}:`, e);
      throw e;
    }
  }, []);

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

    setAuthStatus(prev => ({ ...prev, [providerId]: true }));
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
  }, [oauthPkceState, instances, activeProviderId]);

  // ─── Context value ─────────────────────────────────────────

  const value: ClawsetContextType = {
    isProviderAvailable,
    activeProviderId,
    activeAppId,
    plugins,
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
