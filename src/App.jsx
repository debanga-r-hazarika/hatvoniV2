import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import RequiredPhoneDialog from './components/RequiredPhoneDialog';
import Home from './pages/Home';
import About from './pages/About';
import Lots from './pages/Lots';
import LotDetail from './pages/LotDetail';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Traditions from './pages/Traditions';
import Recipes from './pages/Recipes';
import Gallery from './pages/Gallery';
import Contact from './pages/Contact';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Profile from './pages/Profile';
import Orders from './pages/Orders';
import PrivacyPolicy from './pages/PrivacyPolicy';
import ReturnsShipping from './pages/ReturnsShipping';
import FAQ from './pages/FAQ';
import TermsConditions from './pages/TermsConditions';
import OrderDetail from './pages/OrderDetail';
import Wishlist from './pages/Wishlist';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ConfirmAccount from './pages/ConfirmAccount';
import Admin from './pages/Admin';
import AdminCoupons from './pages/AdminCoupons';
import AdminOrders from './pages/AdminOrders';
import AdminInventory from './pages/AdminInventory';
import AdminEmployees from './pages/AdminEmployees';
import AdminSellers from './pages/AdminSellers';
import AdminLogistics from './pages/AdminLogistics';
import AdminSupport from './pages/AdminSupport';
import AdminWarehouses from './pages/AdminWarehouses';
import AdminNotificationPreferences from './pages/AdminNotificationPreferences';
import Support from './pages/Support';
import Seller from './pages/Seller';
import SellerOrderDetail from './pages/SellerOrderDetail';
import PaymentProcessing from './pages/PaymentProcessing';
import TrackShipment from './pages/TrackShipment';
import NotFound from './pages/NotFound';
import AccessDenied from './pages/AccessDenied';

// Pages that use a minimal transactional header (no shared Navbar/Footer)
const TRANSACTIONAL = ['/checkout', '/login', '/signup', '/forgot-password', '/reset-password', '/confirm-account'];

function Layout({ children, path }) {
  const isTransactional = TRANSACTIONAL.includes(path);
  if (isTransactional) return <>{children}</>;
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}

function PhoneCompletionGate() {
  const location = useLocation();
  const { user, loading, profile } = useAuth();

  const hiddenRoutes = ['/login', '/signup', '/forgot-password', '/reset-password', '/confirm-account'];
  const shouldHide = hiddenRoutes.includes(location.pathname);

  if (loading || !user || shouldHide) return null;
  const hasPhone = Boolean(String(profile?.phone || '').trim());
  if (hasPhone) return null;

  return <RequiredPhoneDialog open />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PhoneCompletionGate />
        <Routes>
          <Route path="/" element={<Layout path="/"><Home /></Layout>} />
          <Route path="/about" element={<Layout path="/about"><About /></Layout>} />
          <Route path="/products" element={<Layout path="/products"><Products /></Layout>} />
          <Route path="/products/:id" element={<Layout path="/products/:id"><ProductDetail /></Layout>} />
          <Route path="/lots" element={<Layout path="/lots"><Lots /></Layout>} />
          <Route path="/lots/:id" element={<Layout path="/lots/:id"><LotDetail /></Layout>} />
          <Route path="/product/kola-khar" element={<Layout path="/product/kola-khar"><ProductDetail /></Layout>} />
          <Route path="/traditions" element={<Layout path="/traditions"><Traditions /></Layout>} />
          <Route path="/recipes" element={<Layout path="/recipes"><Recipes /></Layout>} />
          <Route path="/gallery" element={<Layout path="/gallery"><Gallery /></Layout>} />
          <Route path="/contact" element={<Layout path="/contact"><Contact /></Layout>} />
          <Route path="/cart" element={<Layout path="/cart"><Cart /></Layout>} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/payment-processing/:id" element={<PaymentProcessing />} />
          <Route path="/profile" element={<Layout path="/profile"><Profile /></Layout>} />
          <Route path="/orders" element={<Layout path="/orders"><Orders /></Layout>} />
          <Route path="/admin" element={<Layout path="/admin"><Admin /></Layout>} />
          <Route path="/admin/coupons" element={<Layout path="/admin/coupons"><AdminCoupons /></Layout>} />
          <Route path="/admin/orders" element={<Layout path="/admin/orders"><AdminOrders /></Layout>} />
          <Route path="/admin/orders/:orderId" element={<Layout path="/admin/orders/:orderId"><AdminOrders /></Layout>} />
          <Route path="/admin/inventory" element={<Layout path="/admin/inventory"><AdminInventory /></Layout>} />
          <Route path="/admin/employees" element={<Layout path="/admin/employees"><AdminEmployees /></Layout>} />
          <Route path="/admin/sellers" element={<Layout path="/admin/sellers"><AdminSellers /></Layout>} />
          <Route path="/admin/warehouses" element={<Layout path="/admin/warehouses"><AdminWarehouses /></Layout>} />
          <Route path="/admin/logistics" element={<Layout path="/admin/logistics"><AdminLogistics /></Layout>} />
          <Route path="/admin/support" element={<Layout path="/admin/support"><AdminSupport /></Layout>} />
          <Route path="/admin/notifications" element={<Layout path="/admin/notifications"><AdminNotificationPreferences /></Layout>} />
          <Route path="/support" element={<Layout path="/support"><Support /></Layout>} />
          <Route path="/seller" element={<Layout path="/seller"><Seller /></Layout>} />
          <Route path="/seller/orders/:id" element={<Layout path="/seller/orders/:id"><SellerOrderDetail /></Layout>} />
          <Route path="/order/:id" element={<Layout path="/order/:id"><OrderDetail /></Layout>} />
          <Route path="/track/:trackingId" element={<Layout path="/track/:trackingId"><TrackShipment /></Layout>} />
          <Route path="/wishlist" element={<Layout path="/wishlist"><Wishlist /></Layout>} />
          <Route path="/privacy-policy" element={<Layout path="/privacy-policy"><PrivacyPolicy /></Layout>} />
          <Route path="/returns-shipping" element={<Layout path="/returns-shipping"><ReturnsShipping /></Layout>} />
          <Route path="/faq" element={<Layout path="/faq"><FAQ /></Layout>} />
          <Route path="/terms-conditions" element={<Layout path="/terms-conditions"><TermsConditions /></Layout>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/confirm-account" element={<ConfirmAccount />} />
          <Route path="/access-denied" element={<Layout path="/access-denied"><AccessDenied /></Layout>} />
          <Route path="*" element={<Layout path="*"><NotFound /></Layout>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
