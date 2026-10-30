import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "./store/AppContext";
import { Header, Footer, BottomNav } from "./components/ui";
import Home from "./pages/Home";
import VehicleDetail from "./pages/VehicleDetail";
import Checkout from "./pages/Checkout";
import Dashboard from "./pages/Dashboard";
import Register from "./pages/Register";
import Login from "./pages/Login";
import AddVehicle from "./pages/AddVehicle";
import Admin from "./pages/Admin";
import ProtectedRoute from "./components/ProtectedRoute";

function Toast() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", bottom: 76, left: "50%", transform: "translateX(-50%)", zIndex: 99, background: "#0f1e2e", color: "#fff", padding: "12px 18px", borderRadius: 12, maxWidth: "92vw", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>
      {toast}
    </div>
  );
}

function ScrollTop() {
  const { pathname } = useLocation();
  if (typeof window !== "undefined") window.scrollTo(0, 0);
  return null;
}

function DemoNotice() {
  const { pathname } = useLocation();
  if (["/login", "/cadastro"].includes(pathname)) return null;
  return <div className="container"><div className="alert info">Veículos, anúncios, reservas, pagamentos e painel são demonstrações locais, sem persistência no servidor ou cobranças reais.</div></div>;
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <ScrollTop />
        <Header />
        <main>
          <DemoNotice />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/veiculo/:id" element={<VehicleDetail />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/checkout/:id" element={<Checkout />} />
              <Route path="/painel" element={<Dashboard />} />
              <Route path="/anunciar" element={<AddVehicle />} />
              <Route path="/admin" element={<Admin />} />
            </Route>
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Register />} />
          </Routes>
        </main>
        <Footer />
        <BottomNav />
        <Toast />
      </HashRouter>
    </AppProvider>
  );
}
