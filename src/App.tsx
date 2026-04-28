import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme/ThemeContext";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { useCloudProfileSync } from "@/hooks/useCloudProfileSync";
import Index from "./pages/Index.tsx";
import Demo from "./pages/Demo.tsx";
import GestureGuide from "./pages/GestureGuide.tsx";
import Install from "./pages/Install.tsx";
import BridgeInstall from "./pages/BridgeInstall.tsx";
import BridgeGuideOS from "./pages/BridgeGuideOS.tsx";
import Auth from "./pages/Auth.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import Account from "./pages/Account.tsx";
import NotFound from "./pages/NotFound.tsx";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

const queryClient = new QueryClient();

// Internal child so it can use the AuthContext (provider is its parent).
const AppRoutes = () => {
  useCloudProfileSync();
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/guide" element={<GestureGuide />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/install" element={<Install />} />
      <Route path="/bridge" element={<BridgeInstall />} />
      <Route path="/bridge/:os" element={<BridgeGuideOS />} />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        }
      />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
