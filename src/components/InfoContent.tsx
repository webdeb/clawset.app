import { useParams } from "react-router-dom";
import { Card } from "@heroui/react";

export function InfoContent() {
  const { instanceId } = useParams();
  
  return (
    <div className="w-screen h-screen flex items-center justify-center bg-background text-foreground p-8">
      <Card className="p-6 w-full max-w-lg flex flex-col gap-4">
        <h2 className="text-xl font-bold border-b pb-2">Instance Information</h2>
        <div className="flex justify-between">
          <span className="text-default-500">Name</span>
          <span className="font-medium">{instanceId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-default-500">Status</span>
          <span className="text-success font-medium">Running</span>
        </div>
        <p className="text-sm text-default-400 mt-4 border-t pt-2">
          This pane is natively rendered via React Router in the secondary payload Webview.
        </p>
      </Card>
    </div>
  );
}
