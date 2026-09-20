import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router';
import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { SplashScreen } from './components/SplashScreen';
import { HomePage } from './pages/HomePage';
import { EnergyPage } from './pages/EnergyPage';
import { DashboardPage } from './pages/DashboardPage';
import { DashboardAnalysisPage } from './pages/DashboardAnalysisPage';
import { DevicesPage } from './pages/DevicesPage';
import { ReportsPage } from './pages/ReportsPage';
import { PredictPage } from './pages/PredictPage';
import { CarbonPage } from './pages/CarbonPage';
import { SettingsPage } from './pages/SettingsPage';
import { VisualizationDatasetPage } from './pages/VisualizationDatasetPage';
import { VisualizationBabylon } from './pages/VisualizationBabylon';

function Layout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/energy", element: <EnergyPage /> },
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/dashboard/analysis", element: <DashboardAnalysisPage /> },
      { path: "/predict", element: <PredictPage /> },
      { path: "/devices", element: <DevicesPage /> },
      { path: "/carbon", element: <CarbonPage /> },
      { path: "/reports", element: <ReportsPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/visualization", element: <VisualizationDatasetPage /> },
      { path: "/visualization3d", element: <VisualizationBabylon /> },
    ],
  },
]);

function App() {
  const [splashComplete, setSplashComplete] = useState(false);

  return (
    <>
      {!splashComplete && <SplashScreen onComplete={() => setSplashComplete(true)} />}
      {splashComplete && <RouterProvider router={router} />}
    </>
  );
}

export default App;
