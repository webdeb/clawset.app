import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { InfoContent } from "./components/InfoContent";
import { ConfigContent } from "./components/ConfigContent";
import { DashboardContentRouteWrapper } from "./components/DashboardContent";
import { MultipassProvider } from "./context/MultipassContext";

function App() {
  return (
    <MultipassProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/info/:instanceId" element={<InfoContent />} />
          <Route path="/config/:instanceId" element={<ConfigContent />} />
          <Route path="/dashboard/:instanceId" element={<DashboardContentRouteWrapper />} />
        </Route>
      </Routes>
    </MultipassProvider>
  );
}

export default App;
