import { useQuery } from "@tanstack/react-query";
import { invoke } from "./invoke";
import { ClawsetInstance, PluginInfo, HostResources, InstanceView } from "../context/ClawsetContext";

// ─── Constants ───────────────────────────────────────────────

export const QUERY_KEYS = {
  INSTANCES: (providerId: string) => ["instances", providerId] as const,
  INSTANCE_POLL: (providerId: string, name: string) => ["instance_poll", providerId, name] as const,
  PLUGINS: () => ["plugins"] as const,
  AUTH_STATUS: () => ["auth_status"] as const,
  HOST_RESOURCES: () => ["host_resources"] as const,
};

// ─── Hooks ───────────────────────────────────────────────────

export function useInstances(providerId: string, isAnyProvisioning: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.INSTANCES(providerId),
    queryFn: async () => {
      const res: any = await invoke("instance_list", { providerId });
      const instanceList = Array.isArray(res) ? res : [];
      
      return instanceList.map((inst: any) => ({
        id: inst.id || inst.name,
        name: inst.name,
        ip: inst.ip || "",
        status: inst.status || "Unknown",
        provider: inst.provider || providerId,
        meta: inst.meta || { os: "Ubuntu" },
      } as ClawsetInstance));
    },
    refetchInterval: isAnyProvisioning ? 2000 : 10000,
  });
}

export function useInstancePoll(
  providerId: string, 
  instanceName: string | null, 
  appId: string,
  isProvisioning: boolean
) {
  return useQuery({
    queryKey: instanceName ? QUERY_KEYS.INSTANCE_POLL(providerId, instanceName) : [],
    queryFn: async () => {
      if (!instanceName) return null;
      
      const res: any = await invoke("instance_poll", {
        providerId,
        instanceId: instanceName,
        appId,
      });

      // Parse views json
      let views: InstanceView[] = [];
      try {
        const parsedViews = JSON.parse(res.views_output?.stdout || '{"views":[]}');
        views = (parsedViews.views || []).map((v: any) => ({
          id: v.id,
          name: v.name,
          port: v.port,
          path: v.path || "/",
          status: v.status,
        }));
      } catch { /* ignore */ }

      // Parse app status
      let appStatusParsed: any = {};
      try { 
        appStatusParsed = JSON.parse(res.app_status?.stdout || "{}"); 
      } catch { /* ignore */ }

      return {
        details: res.details || {},
        appStatus: appStatusParsed,
        views,
      };
    },
    enabled: !!instanceName,
    refetchInterval: isProvisioning ? 2000 : 10000,
  });
}

export function usePlugins() {
  return useQuery({
    queryKey: QUERY_KEYS.PLUGINS(),
    queryFn: async () => {
      const result: PluginInfo[] = await invoke("plugin_list");
      return Array.isArray(result) ? result : [];
    },
    staleTime: Infinity, // Only refetch manually or on window focus
  });
}

export function useAuthStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.AUTH_STATUS(),
    queryFn: async () => {
      const result: Record<string, boolean> = await invoke("auth_list_providers");
      return result || {};
    },
    staleTime: Infinity,
  });
}

export function useHostResources() {
  return useQuery({
    queryKey: QUERY_KEYS.HOST_RESOURCES(),
    queryFn: async () => {
      const res: HostResources = await invoke("get_host_resources");
      return res;
    },
    staleTime: Infinity,
  });
}
