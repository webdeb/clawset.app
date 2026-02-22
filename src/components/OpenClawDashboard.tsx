import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Card, Button, Spinner, Link as HeroLink, Select, Label, ListBox } from "@heroui/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

const PREFERRED_INSTANCE_KEY = "clawset_preferred_instance";

export function OpenClawDashboard() {
  const [loading, setLoading] = useState(true);
  const [multipassInstalled, setMultipassInstalled] = useState(false);
  const [instances, setInstances] = useState<string[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [openclawStatus, setOpenclawStatus] = useState<string>("Unknown");
  const [instanceIp, setInstanceIp] = useState<string>("");
  const [instanceToken, setInstanceToken] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);

  const checkStatus = async (overrideInstance?: string) => {
    try {
      setLoading(true);
      setError(null);
      const isMultipassInstalled = await invoke<boolean>("check_multipass");
      setMultipassInstalled(isMultipassInstalled);

      if (isMultipassInstalled) {
        const availableInstances = await invoke<string[]>("list_multipass_instances");
        setInstances(availableInstances);

        // Determine which instance to use
        let targetInstance = overrideInstance || localStorage.getItem(PREFERRED_INSTANCE_KEY);
        if (!targetInstance && availableInstances.length > 0) {
          // Default to first if none selected
          targetInstance = availableInstances.includes("openclaw") ? "openclaw" : availableInstances[0];
        } else if (!targetInstance) {
          targetInstance = "openclaw"; // Fallback to our default name
        }

        setSelectedInstance(targetInstance);
        localStorage.setItem(PREFERRED_INSTANCE_KEY, targetInstance);

        const status = await invoke<string>("get_openclaw_status", { instanceName: targetInstance });
        setOpenclawStatus(status);

        if (status === "Running") {
          try {
            const ip = await invoke<string>("get_instance_ip", { instanceName: targetInstance });
            setInstanceIp(ip);
            const token = await invoke<string>("get_openclaw_token", { instanceName: targetInstance });
            console.log("Token:", token);
            setInstanceToken(token);
          } catch (e) {
            console.error("Failed to fetch instance IP or token", e);
          }
        }
      }
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleInstanceSelection = (value: React.Key | null) => {
    if (!value) return;
    const valStr = value.toString();
    setSelectedInstance(valStr);
    localStorage.setItem(PREFERRED_INSTANCE_KEY, valStr);
    checkStatus(valStr);
  };

  const handleStartInstance = async () => {
    try {
      setActionLoading(true);
      await invoke("start_openclaw", { instanceName: selectedInstance });
      await checkStatus(selectedInstance);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setActionLoading(false);
    }
  };

  const handleInstallOpenclaw = async () => {
    try {
      const selectedFolder = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Shared Folder for OpenClaw Data",
      });

      if (!selectedFolder) {
        // User cancelled the dialog
        return;
      }

      setActionLoading(true);
      await invoke("install_openclaw", { 
        instanceName: selectedInstance, 
        sharedFolder: selectedFolder 
      });
      await checkStatus(selectedInstance);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setActionLoading(false);
    }
  };

  const openDashboard = async () => {
    try {
      setShowDashboard(true);
      const url = `http://${instanceIp || selectedInstance + '.local'}:18789${instanceToken ? `/#token=${instanceToken}` : ''}`;
      
      // Spawn a native webview window instead of an iframe
      // This bypasses the frame-ancestors CSP issue completely, as it acts as a top-level context
      const webview = new WebviewWindow("openclaw-dashboard", {
        url,
        title: "OpenClaw Gateway",
        width: 1024,
        height: 768,
      });

      // Once the webview is closed by the user, we can toggle our local state
      webview.once("tauri://destroyed", () => {
        setShowDashboard(false);
      });
      
    } catch (e) {
      console.error("Failed to open webview window", e);
      // Fallback
      window.open(`http://${instanceIp || selectedInstance + '.local'}:18789${instanceToken ? `?token=${instanceToken}` : ''}`, "_blank");
    }
  };

  if (showDashboard) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-lg">Dashboard opened in a new Window.</p>
          <Button variant="outline" onPress={() => setShowDashboard(false)}>
            Close Overlay
          </Button>
        </div>
      </div>
    );
  }

  if (loading && !instances.length && !actionLoading) {
    return (
      <Card className="w-full max-w-md p-6">
        <div className="flex flex-col items-center justify-center gap-4">
          <Spinner size="lg" />
          <p>Checking System Status...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md p-2">
      <Card.Header className="flex flex-col items-start px-4 pt-4">
        <Card.Title className="text-xl font-bold">OpenClaw Integration</Card.Title>
        <p className="text-sm text-default-500">Manage your local OpenClaw server</p>
      </Card.Header>
      
      <Card.Content className="px-4 py-2 flex flex-col gap-4">
        {!multipassInstalled ? (
          <div className="bg-danger/10 text-danger p-4 rounded-lg flex flex-col gap-2">
            <p className="font-semibold">Multipass is not installed.</p>
            <p className="text-sm">
              Please install Multipass and the latest Ubuntu LTS to run OpenClaw locally.
            </p>
            <HeroLink 
              href="https://multipass.run/" 
              target="_blank" 
              className="text-sm underline mt-2"
            >
              Get Multipass
            </HeroLink>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Instance Selection */}
            {instances.length > 0 && (
              <Select 
                selectedKey={selectedInstance}
                onSelectionChange={handleInstanceSelection}
                className="w-full"
                aria-label="Select Multipass Instance"
              >
                <Label>Multipass Instance</Label>
                <Select.Trigger className="rounded-lg border bg-default-100 p-2 text-left">
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {instances.map((i) => (
                      <ListBox.Item key={i} id={i} textValue={i} className="hover:bg-default-200">
                        {i}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            )}

            <div className="flex justify-between items-center bg-default-100 p-3 rounded-lg">
              <span className="font-medium">Instance Status:</span>
              <span className="font-bold flex items-center gap-2">
                {openclawStatus === "Running" && <span className="w-2 h-2 rounded-full bg-success"></span>}
                {openclawStatus === "Stopped" && <span className="w-2 h-2 rounded-full bg-danger"></span>}
                {actionLoading ? <Spinner size="sm"/> : openclawStatus}
              </span>
            </div>

            {error && (
              <div className="bg-danger/10 text-danger p-3 rounded-lg text-sm">
                Error: {error}
              </div>
            )}

            <div className="flex flex-col gap-2 mt-2">
              {openclawStatus === "NotInstalled" && (
                <Button 
                  variant="primary" 
                  isPending={actionLoading} 
                  onPress={handleInstallOpenclaw}
                >
                  Create & Install Instance: {selectedInstance || "openclaw"}
                </Button>
              )}

              {openclawStatus === "Stopped" && (
                <Button 
                  variant="secondary" 
                  isPending={actionLoading} 
                  onPress={handleStartInstance}
                >
                  Start Instance
                </Button>
              )}

              {openclawStatus === "Running" && (
                <Button 
                  variant="primary" 
                  onPress={openDashboard}
                >
                  Open Dashboard
                </Button>
              )}
            </div>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
