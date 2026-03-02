import { invoke as tauriInvoke, InvokeArgs } from "@tauri-apps/api/core";
import type { 
  ClawsetInstance, 
  HostResources, 
  PluginInfo,
} from "../context/ClawsetContext";

/**
 * Strict mapping of all Tauri commands declared in src-tauri/src/lib.rs
 * Maps the exact string command name to its required arguments and expected return type.
 */
export interface TauriCommandMap {
  // General
  "set_webview_url": { args: { label: string; url: string }; ret: void };
  "get_host_resources": { ret: HostResources };

  // Plugin management
  "plugin_list": { ret: PluginInfo[] };
  "plugin_add": { args: { gitUrl: string }; ret: void };
  "plugin_remove": { args: { id: string }; ret: void };
  "plugin_update": { args: { id: string }; ret: void };
  "plugin_get_manifest": { args: { id: string }; ret: Record<string, any> };

  // Instance provider
  "instance_list": { args: { providerId: string }; ret: ClawsetInstance[] };
  "instance_get": { args: { providerId: string; instanceId: string }; ret: Record<string, any> };
  "instance_create": { args: { providerId: string; params: { name: string; memory: string; cpus: string; disk: string } }; ret: void };
  "instance_destroy": { args: { providerId: string; instanceId: string }; ret: void };
  "instance_start": { args: { providerId: string; instanceId: string }; ret: void };
  "instance_stop": { args: { providerId: string; instanceId: string }; ret: void };
  "instance_exec": { args: { providerId: string; instanceId: string; cmd: string }; ret: { stdout: string; stderr: string; code: number } };
  "instance_poll": { args: { providerId: string; instanceId: string; appId: string }; ret: any };

  // Agent app
  "app_install": { args: { providerId: string; instanceId: string; appId: string }; ret: void };
  "app_action": { args: { providerId: string; instanceId: string; appId: string; action: string }; ret: any };
  "app_read_file": { args: { providerId: string; instanceId: string; remotePath: string }; ret: string };
  "app_write_file": { args: { providerId: string; instanceId: string; remotePath: string; content: string }; ret: void };

  // Auth
  "auth_save": { args: { providerId: string; authJson: string }; ret: void };
  "auth_list_providers": { ret: Record<string, boolean> };
}

/**
 * A strongly-typed wrapper around Tauri's `invoke`.
 * Provides autocomplete and validation for command names and their exact argument payloads.
 */
export function invoke<T extends keyof TauriCommandMap>(
  cmd: T,
  ...args: "args" extends keyof TauriCommandMap[T] 
    ? [TauriCommandMap[T]["args"]] 
    : []
): Promise<TauriCommandMap[T]["ret"]> {
  const payload = args[0] as InvokeArgs | undefined;
  return tauriInvoke<TauriCommandMap[T]["ret"]>(cmd, payload);
}
