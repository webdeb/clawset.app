import { Card, Chip, Button, Spinner } from "@heroui/react";
import { useClawset } from "../context/ClawsetContext";
import { useState } from "react";

export function InstanceOpenClawStatus({ isSyncingStatus }: { isSyncingStatus?: boolean }) {
  const { selectedInstance, syncOpenclawStatus, appAction, writeInstanceFile } = useClawset();
  const [loadingAction, setLoadingAction] = useState<"start" | "stop" | "init" | "save" | null>(null);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [editedConfig, setEditedConfig] = useState("");
  const [saveError, setSaveError] = useState("");

  if (!selectedInstance || !selectedInstance.openclawInstalled) {
    return null;
  }

  const status = selectedInstance.openclawStatus;
  const config = selectedInstance.openclawConfig;
  
  const isRunning = status?.nodeService?.runtimeShort?.includes("running") || false;

  const handleStartStop = async (action: "start" | "stop") => {
    setLoadingAction(action);
    try {
      await appAction(selectedInstance.name, action);
    } catch (e) {
      console.error(e);
    } finally {
      await syncOpenclawStatus(selectedInstance.name);
      setLoadingAction(null);
    }
  };

  const generateRandomToken = () => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const OPENCLAW_CONFIG_PATH = "${HOME}/clawset/.openclaw/openclaw.json";

  const initDefaultConfig = async () => {
    setLoadingAction("init");
    try {
      const generatedToken = generateRandomToken();
      const newConfig = {
        agents: {
          defaults: {
            workspace: "${HOME}/clawset"
          }
        },
        gateway: {
          port: 18789,
          mode: "local",
          bind: "lan",
          auth: {
            mode: "token",
            token: generatedToken
          },
          controlUi: {
            dangerouslyDisableDeviceAuth: true,
            dangerouslyAllowHostHeaderOriginFallback: true
          }
        }
      };

      await writeInstanceFile(
        selectedInstance.name,
        OPENCLAW_CONFIG_PATH,
        JSON.stringify(newConfig, null, 2)
      );
    } catch (e) {
      console.error(e);
    } finally {
      await syncOpenclawStatus(selectedInstance.name);
      setLoadingAction(null);
    }
  };

  const isConfigMissing = !config || Object.keys(config).length === 0;

  const handleEditConfig = () => {
    setEditedConfig(JSON.stringify(config, null, 2));
    setIsEditingConfig(true);
    setSaveError("");
  };

  const handleSaveConfig = async () => {
    setLoadingAction("save");
    setSaveError("");
    try {
      JSON.parse(editedConfig); // Validate JSON format
      await writeInstanceFile(
        selectedInstance.name,
        OPENCLAW_CONFIG_PATH,
        editedConfig
      );
      setIsEditingConfig(false);
    } catch (e: any) {
      console.error(e);
      setSaveError(e.message || "Invalid JSON or failed to save");
    } finally {
      await syncOpenclawStatus(selectedInstance.name);
      setLoadingAction(null);
    }
  };

  return (
    <Card className="p-4 bg-default-50 border border-default-200 mt-4 flex flex-col gap-4 shadow-sm">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-md font-semibold text-default-800 flex items-center gap-2">
            OpenClaw Service
            {isSyncingStatus && <Spinner size="sm" color="current" className="text-default-400" />}
          </h3>
          <p className="text-xs text-default-500">
            {status?.update?.registry?.latestVersion ? `Version: ${status.update.registry.latestVersion}` : "Operating normally"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isRunning ? (
             <Chip size="sm" color="success" variant="soft" className="font-semibold px-2">
               Yeah
             </Chip>
          ) : (
             <Chip size="sm" color="default" variant="soft" className="font-semibold px-2">
               No
             </Chip>
          )}
          <Button 
            size="sm" 
            variant="ghost" 
            isIconOnly 
            className="text-default-400 hover:text-default-700 bg-transparent border-none" 
            onPress={() => syncOpenclawStatus(selectedInstance.name)}
            isDisabled={isSyncingStatus}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button 
          size="sm" 
          className="bg-primary text-white"
          isDisabled={isRunning || loadingAction !== null}
          onPress={() => handleStartStop("start")}
        >
          {loadingAction === "start" && <Spinner size="sm" color="current" />}
          Start
        </Button>
        <Button 
          size="sm" 
          className="bg-danger/10 text-danger"
          variant="danger-soft" 
          isDisabled={!isRunning || loadingAction !== null} 
          onPress={() => handleStartStop("stop")}
        >
          {loadingAction === "stop" && <Spinner size="sm" color="current" />}
          Stop
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-default-600 text-xs uppercase font-semibold">Gateway Token</span>
        {config?.gateway?.auth?.token ? (
          <div className="bg-default-100 p-2 rounded text-xs font-mono break-all text-default-700 select-all border border-default-200">
            {config.gateway.auth.token}
          </div>
        ) : (
          <span className="text-default-400 text-xs italic">
             {isSyncingStatus ? "Syncing..." : "Unable to retrieve token"}
          </span>
        )}
      </div>

      {status?.securityAudit?.findings && status.securityAudit.findings.length > 0 && (
        <details className="mt-2 text-sm group">
          <summary className="cursor-pointer font-semibold text-warning flex items-center gap-2 select-none list-none marker:hidden">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            {status.securityAudit.findings.length} Findings by Security Audit
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto transition-transform group-open:rotate-180"><polyline points="6 9 12 15 18 9"/></svg>
          </summary>
          <div className="flex flex-col gap-3 py-3 mt-2">
            {status.securityAudit.findings.map((finding: any, idx: number) => (
              <div key={idx} className="bg-default-100 p-3 rounded-md border border-default-200">
                <div className="flex items-center gap-2 mb-1">
                  <Chip size="sm" color={finding.severity === "critical" ? "danger" : finding.severity === "warn" ? "warning" : "default"} variant="soft" className="text-[10px] h-5">
                    {finding.severity}
                  </Chip>
                  <span className="text-xs font-semibold text-default-700">{finding.title}</span>
                </div>
                <p className="text-xs text-default-600 mb-1">{finding.detail}</p>
                {finding.remediation && (
                  <p className="text-xs text-default-500 font-mono mt-2 pt-2 border-t border-default-200">
                    Fix: {finding.remediation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="mt-0 text-sm group">
          <summary className="cursor-pointer font-semibold text-default-500 flex items-center gap-2 select-none list-none marker:hidden">
            Configuration
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto transition-transform group-open:rotate-180"><polyline points="6 9 12 15 18 9"/></svg>
          </summary>
          <div className="pt-3">
            {isConfigMissing ? (
              <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg flex flex-col items-center justify-center gap-3">
                <span className="text-warning text-xs text-center">No `openclaw.json` config found on instance.</span>
                <Button 
                   size="sm" 
                   className="bg-warning/20 text-warning"
                   onPress={initDefaultConfig}
                   isDisabled={loadingAction !== null}
                >
                  {loadingAction === "init" && <Spinner size="sm" color="warning" />}
                  Generate Initial Config
                </Button>
              </div>
            ) : isEditingConfig ? (
              <div className="flex flex-col gap-3">
                <textarea
                  value={editedConfig}
                  onChange={(e) => setEditedConfig(e.target.value)}
                  rows={14}
                  className={`w-full font-mono text-[10px] p-2 rounded-lg bg-default-100 border ${saveError ? 'border-danger' : 'border-default-200'} focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-y`}
                />
                {saveError && <span className="text-danger text-xs">{saveError}</span>}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onPress={() => setIsEditingConfig(false)}>Cancel</Button>
                  <Button size="sm" className="bg-primary text-white" onPress={handleSaveConfig} isDisabled={loadingAction !== null}>
                    {loadingAction === "save" && <Spinner size="sm" color="current" />}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative group/config">
                <Button 
                  size="sm" 
                  variant="outline"
                  className="absolute top-2 right-4 opacity-0 group-hover/config:opacity-100 transition-opacity z-10 bg-background/50 backdrop-blur" 
                  onPress={handleEditConfig}
                >
                  Edit JSON
                </Button>
                <pre className="p-3 bg-default-100 rounded-lg text-[10px] overflow-x-auto max-h-64 border border-default-200">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </div>
            )}
          </div>
      </details>
    </Card>
  );
}
