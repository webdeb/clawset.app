import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { InstanceContent } from "./components/InstanceContent";
import { ConfigContent } from "./components/ConfigContent";
import { AppLayout } from "./components/AppLayout";
import { ViewRouteWrapper } from "./components/ViewContent";
import { PluginsContent } from "./components/PluginsContent";
import { AuthContent } from "./components/AuthContent";
import { ClawsetProvider } from "./context/ClawsetContext";

function ViewRoute() {
  const { viewId } = useParams<{ viewId: string }>();
  return <ViewRouteWrapper viewId={viewId || ""} />;
}

function App() {
  return (
    <ClawsetProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/instance" replace />} />
          <Route path="/view/:viewId" element={<ViewRoute />} />
          <Route path="/instance" element={<InstanceContent />} />
          <Route path="/config" element={<ConfigContent />} />
          <Route path="/plugins" element={<PluginsContent />} />
          <Route path="/auth" element={<AuthContent />} />
        </Route>
      </Routes>
    </ClawsetProvider>
  );
}

export default App;
