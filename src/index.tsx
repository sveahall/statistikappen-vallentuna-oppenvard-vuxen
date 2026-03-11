import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./globals.css";
import { validateEnv } from "./config/env";
import { applyTenantTheme, tenant } from "./config/tenant";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./lib/ErrorBoundary";
// AdminRoute ersatt av ProtectedRoute med requiredRole
import { DashboardRedesign } from "./screens/DashboardRedesign";
import { KunderPage } from "./screens/KunderPage";
import { CustomerProfile } from "./screens/KunderPage/CustomerProfile";
import { RegisteraTidPage } from "./screens/RegistreraTidPage";
import { ArendelistaPage } from "./screens/ArendelistaPage";
import { StatistikPage } from "./screens/StatistikPage";
import { AdminPage } from "./screens/AdminPage";
import MinProfilPage from "./screens/MinProfilPage";
import { LoginPage } from "./screens/LoginPage";
import { InviteAcceptPage } from "./screens/InviteAcceptPage";
import { ResetPasswordPage } from "./screens/ResetPasswordPage";
import { Forbidden } from "./components/Forbidden";
import { Toaster } from "react-hot-toast";
import { LoadingSpinner } from "./components/ui/loading-spinner";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import { RefreshProvider } from "./contexts/RefreshContext";
import { OnboardingTour } from "./components/Onboarding/OnboardingTour";

// Loading component for Suspense fallback
const PageLoader = () => (
  <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
    <div className="text-center">
      <LoadingSpinner size="lg" text="Laddar sida..." />
      <p className="mt-4 text-gray-600">Vänligen vänta...</p>
    </div>
  </div>
);

applyTenantTheme();
if (typeof document !== "undefined") {
  document.title = `${tenant.uiBrandName} - Tidsregistreringssystem`;
  document.documentElement.lang = tenant.locale;
}

// Validera miljövariabler innan appen startar
try {
  validateEnv();
} catch (error) {
  console.error('Miljövalidering misslyckades:', error);
  // I utvecklingsläge, visa felmeddelande (utan innerHTML för att undvika XSS)
  if (import.meta.env.DEV) {
    const container = document.createElement('div');
    container.style.cssText = 'padding: 20px; font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto;';

    const heading = document.createElement('h1');
    heading.style.color = '#dc2626';
    heading.textContent = 'Konfigurationsfel';

    const desc = document.createElement('p');
    desc.textContent = 'Appen kunde inte starta på grund av saknade miljövariabler.';

    const errorPre = document.createElement('pre');
    errorPre.style.cssText = 'background: #f3f4f6; padding: 15px; border-radius: 5px; overflow-x: auto;';
    errorPre.textContent = error instanceof Error ? error.message : 'Okänt fel';

    const solution = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = 'Lösning:';
    solution.appendChild(strong);
    solution.appendChild(document.createTextNode(' Skapa en .env-fil i projektets rot med nödvändiga VITE_-variabler.'));

    container.append(heading, desc, errorPre, solution);
    document.body.replaceChildren(container);
  }
  // Stoppa appen från att starta
  throw error;
}

const shouldLazyLoadStatistik = import.meta.env.VITE_ENABLE_LAZY === "1";
const StatistikPageLazy = lazy(async () => ({
  default: (await import("./screens/StatistikPage")).StatistikPage,
}));

const statistikRouteElement = (
  <ProtectedRoute>
    {shouldLazyLoadStatistik ? <StatistikPageLazy /> : <StatistikPage />}
  </ProtectedRoute>
);

createRoot(document.getElementById("app") as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <RefreshProvider>
            <OnboardingProvider>
              <Toaster position="top-center" toastOptions={{ duration: 2500 }} />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/forbidden" element={<Forbidden />} />
                  <Route path="/invite/:token" element={<InviteAcceptPage />} />
                  <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<ProtectedRoute><DashboardRedesign /></ProtectedRoute>} />
                  <Route path="/kunder" element={<ProtectedRoute><KunderPage /></ProtectedRoute>} />
                  <Route path="/kunder/:id" element={<ProtectedRoute><CustomerProfile /></ProtectedRoute>} />
                  <Route path="/registrera-tid" element={<ProtectedRoute><RegisteraTidPage /></ProtectedRoute>} />
                  <Route path="/arendelista" element={<ProtectedRoute><ArendelistaPage /></ProtectedRoute>} />
                  <Route path="/statistik" element={statistikRouteElement} />
                  <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminPage /></ProtectedRoute>} />
                  <Route path="/min-profil" element={<ProtectedRoute><MinProfilPage /></ProtectedRoute>} />
                </Routes>
                <OnboardingTour />
              </Suspense>
            </OnboardingProvider>
          </RefreshProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
