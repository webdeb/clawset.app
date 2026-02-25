import { Routes, Route, Navigate } from "react-router-dom";
import { InstanceContent } from "./components/InstanceContent";
import { ConfigContent } from "./components/ConfigContent";
import { AppLayout } from "./components/AppLayout";
import { DashboardContentRouteWrapper } from "./components/DashboardContent";
import { MultipassProvider } from "./context/MultipassContext";

function App() {
  return (
    <MultipassProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/instance" element={<InstanceContent />} />
          <Route path="/config" element={<ConfigContent />} />
          <Route path="/dashboard" element={<DashboardContentRouteWrapper />} />
        </Route>
      </Routes>
    </MultipassProvider>
  );
}

export default App;
