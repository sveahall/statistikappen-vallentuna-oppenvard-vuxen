import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "@/screens/DashboardRedesign/components/Sidebar";
import { GlobalSearch } from "./GlobalSearch";
import { useAuth } from "@/contexts/AuthContext";
import { User, Menu, HelpCircle } from "lucide-react";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { ApiHealthBanner } from "@/components/ApiHealthBanner";
import { getRoleLabel } from "@/lib/roleLabels";
import { GlobalSearchResult } from "@/types/types";

interface LayoutProps {
  children: React.ReactNode;
  title: string;
}

export const Layout = ({ children, title }: LayoutProps): JSX.Element => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reset: startOnboarding } = useOnboarding();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const [fadeKey, setFadeKey] = useState(0);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFadeKey(k => k + 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);

  const handleSearchResult = (result: GlobalSearchResult) => {
    switch (result.type) {
      case 'customer': {
        navigate(`/kunder/${result.id}`);
        break;
      }
      case 'handler': {
        if (user && user.id === result.id) navigate('/min-profil');
        else navigate(`/admin?handlerId=${result.id}`);
        break;
      }
      case 'effort': {
        navigate(`/admin?effortId=${result.id}`);
        break;
      }
      case 'case': {
        const c = result.data as { customer_id?: number } | undefined;
        if (c?.customer_id) navigate(`/kunder/${c.customer_id}?caseId=${result.id}`);
        else navigate('/arendelista');
        break;
      }
      case 'shift': {
        const s = result.data as { customer_id?: number; case_id?: number } | undefined;
        if (s?.customer_id) navigate(`/kunder/${s.customer_id}?caseId=${s.case_id}`);
        else if (s?.case_id) navigate(`/arendelista?caseId=${s.case_id}`);
        else navigate('/registrera-tid');
        break;
      }
      default:
        console.warn('Okänd resultattyp:', result.type);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex overflow-x-hidden">
      {/* Desktop Sidebar - sticky bredvid innehållet */}
      <div className="hidden lg:block lg:fixed lg:inset-y-0 lg:left-0 lg:w-[300px]">
        <Sidebar />
      </div>
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed left-0 top-0 h-full w-[300px] bg-[var(--tenant-brand)] z-50">
            <Sidebar onClose={() => setIsMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:ml-[300px]">
        <ApiHealthBanner />
        {/* Custom header med global sökning */}
        <header className="bg-white/95 w-full py-3 sm:py-4 shadow-sm overflow-visible">
          <div className="content-container flex flex-col gap-3 sm:gap-4 md:flex-row md:items-center md:justify-between w-full min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
              {/* Mobile menu button */}
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Öppna meny"
              >
                <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
              </button>
              
              <h1 className="text-lg sm:text-xl md:text-2xl font-extralight text-gray-800 leading-tight truncate">{title}</h1>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 md:gap-4 w-full md:w-auto min-w-0">
              <div className="w-full sm:w-auto min-w-0 order-1 sm:order-1">
                <GlobalSearch onResultSelect={handleSearchResult} />
              </div>
              <button
                onClick={() => startOnboarding()}
                className="hidden md:flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors order-2"
                title="Öppna guide"
                aria-label="Öppna guide"
              >
                <HelpCircle className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">Guide</span>
              </button>
              <button
                onClick={() => navigate('/min-profil')}
                className="group flex items-center gap-2 lg:gap-2.5 p-1.5 sm:p-2 rounded-lg hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-100 transition-all duration-200 hover:shadow-sm hover:border-gray-200 self-start sm:self-auto order-2 sm:order-3"
              >
                <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-green-100 to-green-200 rounded-full flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-200">
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-sm font-semibold text-gray-900 group-hover:text-gray-800 transition-colors">
                    {user?.name}
                  </div>
                  <div className="text-xs capitalize text-gray-500">
                    {getRoleLabel(user?.role) || (user?.role ?? '')}
                  </div>
                </div>
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 w-full py-2 sm:py-4">
          <div key={fadeKey} className="content-container route-fade">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
