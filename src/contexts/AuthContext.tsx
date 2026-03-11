import React, { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { api } from '@/lib/apiClient';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<boolean>;
  loading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minuter

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth måste användas inom en AuthProvider');
  }
  return context;
};

const getStoredAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
};

const getStoredRefreshToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('refreshToken') || localStorage.getItem('refreshToken');
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredAccessToken());
  const [refreshToken, setRefreshToken] = useState<string | null>(() => getStoredRefreshToken());
  const [loading, setLoading] = useState(true);


  // Session timeout - 30 minuter inaktivitet (konstant definierad högst upp)
  const inactivityTimerRef = useRef<NodeJS.Timeout>();

  const logout = useCallback(async () => {
    try {
      await api(`/users/logout`, { method: 'POST' });
    } catch (error) {
      console.error('Error while logging out:', error);
    } finally {
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    }
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    if (!refreshToken) return false;
    
    try {
      const response = await api(`/users/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        setAccessToken(data.accessToken);
        setUser(data.user);
        localStorage.setItem('accessToken', data.accessToken);
        return true;
      } else {
        await logout();
        return false;
      }
    } catch (error) {
      await logout();
      return false;
    }
  }, [refreshToken, logout]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    if (accessToken) {
      inactivityTimerRef.current = setTimeout(() => {
        logout();
      }, SESSION_TIMEOUT);
    }
  }, [accessToken, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api(`/users/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      let errorData: { error?: string; message?: string; remainingAttempts?: number; retryAfterSeconds?: number } = {};
      try {
        errorData = await response.json();
      } catch {
        throw new Error('Inloggning misslyckades. Försök igen.');
      }
      const err = new Error(errorData.message || 'Inloggning misslyckades') as Error & {
        code?: string;
        remainingAttempts?: number;
        retryAfterSeconds?: number;
      };
      err.code = errorData.error;
      err.remainingAttempts = errorData.remainingAttempts;
      err.retryAfterSeconds = errorData.retryAfterSeconds;
      throw err;
    }

    const data = await response.json();
    setUser(data.user);
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
  }, []);

  // Kontrollera om användaren är inloggad vid app-start
  useEffect(() => {
    const checkAuth = async () => {
      if (accessToken) {
        try {
          const response = await api(`/users/me`);

          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
          } else {
            // Access token är ogiltig, försök med refresh token
            if (refreshToken) {
              const refreshed = await refreshAccessToken();
              if (!refreshed) {
                // Båda tokens är ogiltiga, logga ut
                logout();
              }
            } else {
              logout();
            }
          }
        } catch (error) {
          // Försök med refresh token
          if (refreshToken) {
            const refreshed = await refreshAccessToken();
            if (!refreshed) {
              logout();
            }
          } else {
            logout();
          }
        }
      } else if (refreshToken) {
        // Ingen access token men finns refresh token, försök förnya
        const refreshed = await refreshAccessToken();
        if (!refreshed) {
          logout();
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, [accessToken, refreshToken, refreshAccessToken, logout]);

  // Event listeners för session timeout
  useEffect(() => {
    if (accessToken) {
      resetInactivityTimer();
      
      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      
      events.forEach(event => {
        document.addEventListener(event, resetInactivityTimer);
      });

      return () => {
        events.forEach(event => {
          document.removeEventListener(event, resetInactivityTimer);
        });
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }
      };
    }
  }, [accessToken, resetInactivityTimer]);

  const isAuthenticated = !!user && !!accessToken;

  const value: AuthContextType = {
    user,
    accessToken,
    refreshToken,
    login,
    logout,
    refreshAccessToken,
    loading,
    isAuthenticated
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
