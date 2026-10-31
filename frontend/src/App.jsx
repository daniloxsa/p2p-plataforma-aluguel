import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { AppProvider, useApp } from "./store/AppContext";
import { Header, Footer, BottomNav } from "./components/ui";
import Home from "./pages/Home";
import VehicleDetail from "./pages/VehicleDetail";
import Checkout from "./pages/Checkout";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Register from "./pages/Register";
import Login from "./pages/Login";
import AddVehicle from "./pages/AddVehicle";
import OwnerVehicle from "./pages/OwnerVehicle";
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
  return <div className="container"><div className="alert info">O cadastro e a aba Meus veículos usam dados reais da sua conta. Os anúncios da Home, reservas, pagamentos e demais áreas do painel são demonstrações, sem cobranças reais.</div></div>;
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
              <Route path="/perfil" element={<Profile />} />
              <Route path="/anunciar" element={<AddVehicle />} />
              <Route path="/meus-veiculos/:id" element={<OwnerVehicle />} />
              <Route path="/meus-veiculos/:id/editar" element={<OwnerVehicle editing />} />
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
