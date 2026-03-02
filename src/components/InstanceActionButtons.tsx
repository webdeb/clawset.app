import { useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useClawset, ClawsetInstance } from "../context/ClawsetContext";

export function InstancePowerButton({ instance }: { instance: ClawsetInstance }) {
  const { startInstance, stopInstance } = useClawset();
  const [loading, setLoading] = useState(false);

  const handleStart = async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await startInstance(instance.name);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setLoading(true);
    try {
      await stopInstance(instance.name);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spinner size="sm" color="current" />;

  if (instance.status === "Stopped") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" onClick={handleStart} className="cursor-pointer">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
    );
  } else if (instance.status === "Running") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" onClick={handleStop} className="cursor-pointer">
        <rect x="6" y="6" width="12" height="12"></rect>
      </svg>
    );
  }

  return <>{instance.name.slice(0, 2)}</>;
}

export function DeleteInstanceButton({ instanceName, className }: { instanceName: string; className?: string }) {
  const { destroyInstance } = useClawset();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    const isConfirmed = await confirm(`Are you sure you want to delete the instance "${instanceName}"? This action cannot be undone.`, {
      title: 'Delete Instance',
      kind: 'warning',
    });
    if (isConfirmed) {
      setLoading(true);
      try {
        await destroyInstance(instanceName);
      } catch (e) {
        console.error("Failed to delete instance:", e);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Button 
      size="sm" 
      variant="ghost" 
      onPress={handleDelete} 
      className={className || "text-danger border-danger hover:bg-danger/10"}
      isDisabled={loading}
    >
      {loading ? <Spinner size="sm" color="current" /> : "Delete Instance"}
    </Button>
  );
}
