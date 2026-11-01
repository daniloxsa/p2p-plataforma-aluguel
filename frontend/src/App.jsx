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
import MyAnnouncements from "./pages/MyAnnouncements";
import CreateAnnouncement from "./pages/CreateAnnouncement";
import OwnerAnnouncement from "./pages/OwnerAnnouncement";
import Admin from "./pages/Admin";
import AdminVehicles from './pages/AdminVehicles';
import AdminVehicleReview from './pages/AdminVehicleReview';
import AdminRoute, { AdminAccessProvider } from './components/AdminAccess';
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
  if (pathname === '/' || pathname.startsWith('/veiculo/')) return null;
  return <div className="container"><div className="alert info">Cadastro, catálogo, Meus veículos, Meus anúncios e Administração usam dados reais. Reservas e pagamentos do painel são demonstrações, sem cobranças reais.</div></div>;
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <AdminAccessProvider>
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
              <Route path="/anuncios/meus" element={<MyAnnouncements />} />
              <Route path="/anuncios/novo" element={<CreateAnnouncement />} />
              <Route path="/anuncios/meus/:id" element={<OwnerAnnouncement />} />
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/veiculos" element={<AdminVehicles />} />
                <Route path="/admin/veiculos/:id" element={<AdminVehicleReview />} />
              </Route>
            </Route>
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Register />} />
          </Routes>
        </main>
        <Footer />
        <BottomNav />
        <Toast />
        </AdminAccessProvider>
      </HashRouter>
    </AppProvider>
  );
}
