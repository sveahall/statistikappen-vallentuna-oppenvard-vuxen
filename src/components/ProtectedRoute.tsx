import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole 
}) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  // Visa loading tills auth-check är klar
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[var(--tenant-brand)]" />
          <p className="text-gray-600">Kontrollerar inloggning...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Omdirigera till login med ursprunglig destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/forbidden" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};
