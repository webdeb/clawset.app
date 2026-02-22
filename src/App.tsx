import { Routes, Route, Navigate } from "react-router-dom";
import { InfoContent } from "./components/InfoContent";
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
          <Route path="/info" element={<InfoContent />} />
          <Route path="/config" element={<ConfigContent />} />
          <Route path="/dashboard" element={<DashboardContentRouteWrapper />} />
        </Route>
      </Routes>
    </MultipassProvider>
  );
}

export default App;
