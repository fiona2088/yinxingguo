import { createBrowserRouter } from "react-router";
import { Root } from "./Root";
import { HomePage } from "./pages/HomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { EnergyPage } from "./pages/EnergyPage";
import { DevicesPage } from "./pages/DevicesPage";
import { ReportsPage } from "./pages/ReportsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: HomePage },
      { path: "dashboard", Component: DashboardPage },
      { path: "energy", Component: EnergyPage },
      { path: "devices", Component: DevicesPage },
      { path: "reports", Component: ReportsPage },
    ],
  },
]);
