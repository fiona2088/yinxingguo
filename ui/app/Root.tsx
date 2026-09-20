import { Outlet } from "react-router";
import { Navbar } from "./components/Navbar";

export function Root() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <Outlet />
    </div>
  );
}
