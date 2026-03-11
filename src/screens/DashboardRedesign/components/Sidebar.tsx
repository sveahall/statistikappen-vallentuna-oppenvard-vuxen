import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { tenant } from "@/config/tenant";
import { Home, Users, Clock, FileText, BarChart3, User, Shield, X } from "lucide-react";

interface SidebarProps {
  onClose?: () => void;
}

export const Sidebar = ({ onClose }: SidebarProps): JSX.Element => {
  const location = useLocation();
  const { user } = useAuth();
  
  const navItems = [
    { id: 1, name: "Startsida", path: "/", active: location.pathname === "/" || location.pathname === "/dashboard", icon: Home },
    { id: 2, name: "Kunder", path: "/kunder", active: location.pathname === "/kunder", icon: Users },
    { id: 3, name: "Registrera tid", path: "/registrera-tid", active: location.pathname === "/registrera-tid", icon: Clock },
    { id: 4, name: "Insatslista", path: "/arendelista", active: location.pathname === "/arendelista", icon: FileText },
    { id: 5, name: "Statistik", path: "/statistik", active: location.pathname === "/statistik", icon: BarChart3 },
  ];

  const handleNavClick = () => {
    // Stäng mobilmenyn om den finns
    if (onClose) {
      onClose();
    }
  };

  return (
    <aside className="w-[300px] bg-[var(--tenant-brand)] flex flex-col h-screen sticky top-0">
      <div className="flex flex-col items-center gap-10 p-6 flex-1">
        {/* Mobile close button - bara synlig på mobil */}
        {onClose && (
          <div className="lg:hidden w-full flex justify-end">
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Stäng meny"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
        )}
        
        {/* Logo and title section */}
        <div className="flex flex-col items-center">
          <div className="relative group">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 group-hover:scale-105 border border-white/20 overflow-hidden">
              <img
                src={tenant.assets.logoPath}
                alt={tenant.assets.logoAlt}
                className="w-20 h-20 object-contain"
              />
            </div>
          </div>
          <h2 className="font-light text-white text-xl mt-3 font-['Arial-Bold',Helvetica] group-hover:text-white/90 transition-colors">
            {tenant.uiBrandName}
          </h2>
          <p className="font-normal text-white/80 text-sm font-['Arial-Regular',Helvetica] group-hover:text-white/70 transition-colors">
            {tenant.uiBrandSubtitle}
          </p>
        </div>

        {/* Navigation menu */}
        <nav className="flex flex-col w-full gap-2">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <Link key={item.id} to={item.path} onClick={handleNavClick}>
                <Button
                  variant="ghost"
                  className={`group w-full h-12 flex items-center justify-start px-4 text-base font-['Arial-${
                    item.active ? "Bold" : "Regular"
                  }',Helvetica] ${
                    item.active
                      ? "bg-white text-[var(--tenant-brand)] font-bold shadow-lg transform scale-105 border border-white/20"
                      : "bg-transparent text-white font-normal hover:bg-white/10 hover:shadow-md hover:transform hover:scale-105 hover:border hover:border-white/10"
                  } rounded-xl transition-all duration-300 ease-out relative overflow-hidden`}
                >
                  {/* Hover background effect */}
                  <div className={`absolute inset-0 bg-gradient-to-r ${
                    item.active 
                      ? 'from-white/5 to-white/10' 
                      : 'from-transparent to-transparent group-hover:from-white/5 group-hover:to-white/10'
                  } transition-all duration-300`} />
                  
                  {/* Icon */}
                  <IconComponent className={`w-5 h-5 mr-3 transition-all duration-300 ${
                    item.active 
                      ? 'text-[var(--tenant-brand)] transform scale-110' 
                      : 'text-white/80 group-hover:text-white group-hover:transform group-hover:scale-110'
                  }`} />
                  
                  {/* Text */}
                  <span className={`relative z-10 transition-all duration-300 ${
                    item.active ? 'transform translate-x-1' : 'group-hover:transform group-hover:translate-x-1'
                  }`}>
                    {item.name}
                  </span>
                  

                </Button>
              </Link>
            );
          })}
        </nav>

        {/* Profile/Admin section at bottom */}
        <div className="mt-auto w-full">
          <Link to={user?.role === 'admin' ? "/admin" : "/min-profil"} onClick={handleNavClick}>
            <Button
              variant="ghost"
              className={`group w-full h-12 flex items-center justify-start px-4 text-base font-['Arial-${
                location.pathname === (user?.role === 'admin' ? "/admin" : "/min-profil") ? "Bold" : "Regular"
              }',Helvetica] ${
                location.pathname === (user?.role === 'admin' ? "/admin" : "/min-profil")
                  ? "bg-white text-[var(--tenant-brand)] font-bold shadow-lg transform scale-105 border border-white/20"
                  : "bg-transparent text-white font-normal hover:bg-white/10 hover:shadow-md hover:transform hover:scale-105 hover:border hover:border-white/10"
              } rounded-xl transition-all duration-300 ease-out relative overflow-hidden`}
            >
              {/* Hover background effect */}
              <div className={`absolute inset-0 bg-gradient-to-r ${
                location.pathname === (user?.role === 'admin' ? "/admin" : "/min-profil")
                  ? 'from-white/5 to-white/10' 
                  : 'from-transparent to-transparent group-hover:from-white/5 group-hover:to-white/10'
              } transition-all duration-300`} />
              
              {/* Icon */}
              {user?.role === 'admin' ? (
                <Shield className={`w-5 h-5 mr-3 transition-all duration-300 ${
                  location.pathname === "/admin"
                    ? 'text-[var(--tenant-brand)] transform scale-110' 
                    : 'text-white/80 group-hover:text-white group-hover:transform hover:scale-110'
                }`} />
              ) : (
                <User className={`w-5 h-5 mr-3 transition-all duration-300 ${
                  location.pathname === "/min-profil"
                    ? 'text-[var(--tenant-brand)] transform scale-110' 
                    : 'text-white/80 group-hover:text-white group-hover:transform hover:scale-110'
                }`} />
              )}
              
              {/* Text */}
              <span className={`relative z-10 transition-all duration-300 ${
                location.pathname === (user?.role === 'admin' ? "/admin" : "/min-profil") ? 'transform translate-x-1' : 'group-hover:transform hover:translate-x-1'
              }`}>
                {user?.role === 'admin' ? "Admin" : "Min Profil"}
              </span>
            </Button>
          </Link>
        </div>
      </div>
    </aside>
  );
};
