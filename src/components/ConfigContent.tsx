import { Card } from "@heroui/react";
import { useClawset } from "../context/ClawsetContext";

export function ConfigContent() {
  const { instances, selectedInstance } = useClawset();
  const instance = instances.find(i => i.name === selectedInstance?.name);
  
  return (
    <div className="w-screen h-screen flex items-center justify-center bg-background text-foreground p-8">
      <Card className="p-6 w-full max-w-lg flex flex-col gap-4">
        <h2 className="text-xl font-bold border-b pb-2">Configuration Editor</h2>
        <p className="text-default-500 mb-2 text-sm">
          Settings configuration mapping for <span className="text-foreground font-semibold">{selectedInstance?.name || "No instance selected"}</span>:
        </p>
        <div className="bg-default-100 p-4 rounded font-mono text-xs text-default-600">
          <pre><code>{JSON.stringify(instance, null, 2)}</code></pre>
        </div>
      </Card>
    </div>
  );
}
