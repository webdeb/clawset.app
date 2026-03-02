import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InstanceContent } from "./components/InstanceContent";
import { AppLayout } from "./components/AppLayout";
import { ViewRouteWrapper } from "./components/ViewContent";
import { PluginsContent } from "./components/PluginsContent";
import { AuthContent } from "./components/AuthContent";
import { NewInstanceContent } from "./components/NewInstanceContent";
import { ClawsetProvider } from "./context/ClawsetContext";

const queryClient = new QueryClient();

function InstanceViewRoute() {
  const { viewId } = useParams<{ instanceName: string; viewId: string }>();
  return <ViewRouteWrapper viewId={viewId || ""} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ClawsetProvider>
        <Routes>
          <Route element={<AppLayout />}>
            {/* Default redirect */}
            <Route path="/" element={<Navigate to="/system/plugins" replace />} />

            {/* System context */}
            <Route path="/system" element={<Navigate to="/system/plugins" replace />} />
            <Route path="/system/plugins" element={<PluginsContent />} />
            <Route path="/system/auth" element={<AuthContent />} />
            <Route path="/system/new" element={<NewInstanceContent />} />

            {/* Instance context */}
            <Route path="/instance/:instanceName" element={<InstanceContent />} />
            <Route path="/instance/:instanceName/:viewId" element={<InstanceViewRoute />} />
          </Route>
        </Routes>
      </ClawsetProvider>
    </QueryClientProvider>
  );
}

export default App;
