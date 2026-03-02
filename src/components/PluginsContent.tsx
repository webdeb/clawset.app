import { useState } from "react";
import { Card, Button, Input, Chip, Spinner } from "@heroui/react";
import { invoke } from "../lib/invoke";
import { useClawset, PluginInfo } from "../context/ClawsetContext";

export function PluginsContent() {
  const { plugins, refreshPlugins } = useClawset();
  const [gitUrl, setGitUrl] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleAddPlugin = async () => {
    if (!gitUrl.trim()) return;
    setIsAdding(true);
    setError("");
    try {
      await invoke("plugin_add", { gitUrl: gitUrl.trim() });
      setGitUrl("");
      await refreshPlugins();
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemovePlugin = async (id: string) => {
    setIsRemoving(id);
    try {
      await invoke("plugin_remove", { id });
      await refreshPlugins();
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setIsRemoving(null);
    }
  };

  const typeColors: Record<string, "accent" | "success" | "warning"> = {
    "instance-provider": "accent",
    "agent-app": "success",
    "ai-provider": "warning",
  };

  const grouped = {
    "instance-provider": plugins.filter(p => p.type === "instance-provider"),
    "agent-app": plugins.filter(p => p.type === "agent-app"),
    "ai-provider": plugins.filter(p => p.type === "ai-provider"),
  };

  const sectionLabels: Record<string, string> = {
    "instance-provider": "Instance Providers",
    "agent-app": "Agent Apps",
    "ai-provider": "AI Providers",
  };

  return (
    <div className="w-full min-h-full flex flex-col items-center bg-background text-foreground p-8">
      <Card className="p-6 w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold">Plugins</h2>
          <p className="text-default-500 text-sm">
            Manage your instance providers, agent apps, and AI providers.
          </p>
        </div>

        {/* Add Plugin */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-xs font-medium text-default-500 uppercase tracking-wider">Add from Git</label>
            <Input
              placeholder="https://github.com/user/clawset-docker.git"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              disabled={isAdding}
              className="bg-default-100 rounded-lg text-sm"
            />
          </div>
          <Button
            className="bg-primary text-white h-[40px]"
            onPress={handleAddPlugin}
            isDisabled={isAdding || !gitUrl.trim()}
          >
            {isAdding && <Spinner size="sm" color="current" />}
            Install
          </Button>
        </div>

        {error && (
          <div className="bg-danger/10 text-danger text-xs p-3 rounded-lg border border-danger/20">
            {error}
          </div>
        )}

        {/* Plugin List */}
        {Object.entries(grouped).map(([type, typePlugins]) => (
          typePlugins.length > 0 && (
            <div key={type} className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold border-b pb-2 uppercase tracking-wide text-default-600">
                {sectionLabels[type] || type}
              </h3>
              {typePlugins.map((plugin: PluginInfo) => (
                <div key={plugin.id} className="flex items-center justify-between p-3 bg-default-50 border border-default-200 rounded-lg">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{plugin.name}</span>
                      <Chip size="sm" color={typeColors[plugin.type] || "default"} variant="soft" className="text-[10px] h-5">
                        {plugin.type}
                      </Chip>
                      <span className="text-[10px] text-default-400 font-mono">v{plugin.version}</span>
                    </div>
                    {plugin.description && (
                      <p className="text-xs text-default-500">{plugin.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger bg-danger/10"
                      onPress={() => handleRemovePlugin(plugin.id)}
                      isDisabled={isRemoving === plugin.id}
                    >
                      {isRemoving === plugin.id ? <Spinner size="sm" color="current" /> : "Remove"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        ))}

        {plugins.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-default-400 gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22v-4"/><path d="M12 6V2"/><path d="M2 12h4"/><path d="M18 12h4"/>
              <path d="m4.9 4.9 2.9 2.9"/><path d="m16.2 16.2 2.9 2.9"/>
              <path d="m4.9 19.1 2.9-2.9"/><path d="m16.2 7.8 2.9-2.9"/>
            </svg>
            <p className="text-sm">No plugins installed yet.</p>
            <p className="text-xs">Add a plugin from a Git URL above to get started.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
