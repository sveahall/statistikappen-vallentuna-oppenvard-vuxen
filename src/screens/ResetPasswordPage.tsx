import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { enhancedToast } from '../components/ui/enhanced-toast';
import { schemas } from '../lib/validation';
import { z } from 'zod';
import { Eye, EyeOff, Lock, AlertCircle } from 'lucide-react';
import { API_URL } from '../lib/api';

export const ResetPasswordPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Validera token när sidan laddas
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsValidating(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/auth/validate-reset-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        if (response.ok) {
          setIsValidToken(true);
        } else {
          setIsValidToken(false);
        }
      } catch (error) {
        setIsValidToken(false);
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    let validation;
    try {
      try {
        const validatedData = schemas.passwordReset.parse({ password, confirmPassword });
        validation = { success: true, data: validatedData };
      } catch (error) {
        if (error instanceof z.ZodError) {
          const errors = error.issues.map((issue) => issue.message);
          validation = { success: false, errors };
        } else {
          validation = { success: false, errors: ['Ett oväntat fel uppstod vid validering'] };
        }
      }
    } catch (error) {
      setErrors({ password: 'Valideringsfel: ' + (error instanceof Error ? error.message : 'Okänt fel') });
      return;
    }
    
    if (!validation.success) {
      setErrors(Array.isArray(validation.errors) ? {} : (validation.errors || {}));
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      });

      if (response.ok) {
        enhancedToast.success('Lösenord återställt! Du kan nu logga in med ditt nya lösenord');
        navigate('/login');
      } else {
        const errorData = await response.json();
        enhancedToast.error(
          'Kunde inte återställa lösenord',
          errorData.message || 'Ett fel uppstod'
        );
      }
    } catch (error) {
      enhancedToast.error('Nätverksfel: Kunde inte ansluta till servern');
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Validerar återställningslänk...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl text-gray-900">
              Ogiltig länk
            </CardTitle>
            <CardDescription className="text-gray-600">
              Återställningslänken är ogiltig eller har utgått
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center text-sm text-gray-500">
              <p>Länken du använde är inte giltig eller har utgått.</p>
              <p className="mt-2">Kontakta din administratör för en ny länk.</p>
            </div>
            <Button
              asChild
              className="w-full"
            >
              <a href="/login">
                Gå till inloggning
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <Lock className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl text-gray-900">
            Skapa ett nytt lösenord
          </CardTitle>
          <CardDescription className="text-gray-600">
            Ange ditt nya lösenord nedan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Nytt lösenord
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ange nytt lösenord"
                  className={errors.password ? 'border-red-300 focus:border-red-500' : ''}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="text-sm text-red-600">
                  {errors.password}
                </p>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Lösenordskrav:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`flex items-center gap-2 ${password.length >= 8 ? 'text-green-600' : 'text-gray-500'}`}>
                    <span>{password.length >= 8 ? '✅' : '⭕'}</span>
                    <span>Minst 8 tecken</span>
                  </div>
                  <div className={`flex items-center gap-2 ${/[a-z]/.test(password) ? 'text-green-600' : 'text-gray-500'}`}>
                    <span>{/[a-z]/.test(password) ? '✅' : '⭕'}</span>
                    <span>Liten bokstav (a-z)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${/[A-Z]/.test(password) ? 'text-green-600' : 'text-gray-500'}`}>
                    <span>{/[A-Z]/.test(password) ? '✅' : '⭕'}</span>
                    <span>Stor bokstav (A-Z)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${/\d/.test(password) ? 'text-green-600' : 'text-gray-500'}`}>
                    <span>{/\d/.test(password) ? '✅' : '⭕'}</span>
                    <span>Siffra (0-9)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${/[^A-Za-z0-9]/.test(password) ? 'text-green-600' : 'text-gray-500'}`}>
                    <span>{/[^A-Za-z0-9]/.test(password) ? '✅' : '⭕'}</span>
                    <span>Specialtecken (!@#$%^&*)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${password === confirmPassword && password.length > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                    <span>{password === confirmPassword && password.length > 0 ? '✅' : '⭕'}</span>
                    <span>Lösenorden matchar</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                Bekräfta lösenord
              </label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Bekräfta nytt lösenord"
                  className={errors.confirmPassword ? 'border-red-300 focus:border-red-500' : ''}
                  aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p id="confirm-password-error" className="text-sm text-red-600">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Återställer lösenord...' : 'Återställ lösenord'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
