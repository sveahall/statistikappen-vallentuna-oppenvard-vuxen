import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Eye, EyeOff, AlertTriangle, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { tenant } from '@/config/tenant';

type LoginError = Error & {
  code?: string;
  remainingAttempts?: number;
  retryAfterSeconds?: number;
};

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  // Standard: spara inte tokens mellan sessions för bättre säkerhet
  const [remember, setRemember] = useState(false);
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval>>();

  const { login } = useAuth();
  const navigate = useNavigate();

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSeconds != null && lockoutSeconds > 0) {
      lockoutTimerRef.current = setInterval(() => {
        setLockoutSeconds(prev => {
          if (prev == null || prev <= 1) {
            clearInterval(lockoutTimerRef.current);
            setError(null);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(lockoutTimerRef.current);
    }
  }, [lockoutSeconds]);

  const formatLockoutTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${String(secs).padStart(2, '0')} min`;
    }
    return `${secs} sekunder`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRemainingAttempts(null);

    if (!email || !password) {
      setError('Fyll i alla fält');
      return;
    }

    setIsLoading(true);

    try {
      await login(email, password);
      // Hantera "Kom ihåg mig"
      const access = localStorage.getItem('accessToken');
      const refresh = localStorage.getItem('refreshToken');
      if (!remember) {
        if (access) sessionStorage.setItem('accessToken', access);
        if (refresh) sessionStorage.setItem('refreshToken', refresh);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      }
      toast.success('Inloggning lyckades!', {
        duration: 2000,
      });
      navigate('/dashboard');
    } catch (err) {
      const loginErr = err as LoginError;
      setError(loginErr.message || 'Inloggning misslyckades');

      if (loginErr.code === 'account_locked' && loginErr.retryAfterSeconds) {
        setLockoutSeconds(loginErr.retryAfterSeconds);
        setRemainingAttempts(null);
      } else if (loginErr.remainingAttempts != null) {
        setRemainingAttempts(loginErr.remainingAttempts);
        setLockoutSeconds(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-light text-[#333]">
            Logga in
          </CardTitle>
          <p className="text-gray-600 text-sm">
            Ange dina inloggningsuppgifter för att komma åt systemet
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                className={`flex items-start gap-3 px-4 py-3 rounded-lg text-sm ${
                  lockoutSeconds != null
                    ? 'bg-orange-50 border border-orange-200 text-orange-800'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {lockoutSeconds != null ? (
                  <Lock className="w-5 h-5 mt-0.5 flex-shrink-0 text-orange-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
                )}
                <div>
                  <p className="font-medium">{error}</p>
                  {lockoutSeconds != null && (
                    <p className="mt-1 text-xs">
                      Tid kvar: {formatLockoutTime(lockoutSeconds)}
                    </p>
                  )}
                  {remainingAttempts != null && remainingAttempts > 0 && (
                    <p className="mt-1 text-xs">
                      {remainingAttempts} {remainingAttempts === 1 ? 'försök' : 'försök'} kvar innan kontot låses.
                    </p>
                  )}
                </div>
              </div>
            )}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                E-post
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tenant.exampleEmail}
                className="w-full"
                required
                disabled={isLoading}
                autoComplete="username"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Lösenord
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ditt lösenord"
                  className="w-full pr-10"
                  required
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
          </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={isLoading} />
                Kom ihåg mig
              </label>
            </div>

            <Button
              type="submit"
              className="w-full bg-[var(--tenant-brand)] hover:bg-[var(--tenant-brand-hover)]"
              disabled={isLoading || lockoutSeconds != null}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Loggar in...
                </>
              ) : lockoutSeconds != null ? (
                `Låst (${formatLockoutTime(lockoutSeconds)})`
              ) : (
                'Logga in'
              )}
            </Button>
          </form>
          
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Glömt lösenord? Kontakta systemadministratören för att få hjälp med inloggningen
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
