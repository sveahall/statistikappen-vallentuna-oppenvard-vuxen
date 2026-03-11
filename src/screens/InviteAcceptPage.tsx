import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/apiClient";
import { tenant } from "@/config/tenant";

export const InviteAcceptPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validera formuläret
    if (!email || !verificationCode || !name || !password || !confirm) {
      setError("Alla fält är obligatoriska");
      return;
    }

    if (password !== confirm) {
      setError("Lösenorden matchar inte");
      return;
    }

    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("Lösenord måste vara minst 8 tecken och innehålla minst en bokstav och en siffra");
      return;
    }

    if (name.length < 2 || name.length > 100) {
      setError("Namn måste vara mellan 2 och 100 tecken");
      return;
    }

    setLoading(true);

    try {
      // Steg 1: Verifiera e-postadress
      const verifyRes = await api(`/invites/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, verification_code: verificationCode })
      });

      if (!verifyRes.ok) {
        const errorData = await verifyRes.json();
        throw new Error(errorData.error || "Kunde inte verifiera e-postadress");
      }

      // Steg 2: Skapa konto
      const acceptRes = await api(`/invites/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name })
      });

      if (!acceptRes.ok) {
        const errorData = await acceptRes.json();
        throw new Error(errorData.error || "Kunde inte skapa konto");
      }

      navigate("/login", {
        state: { message: "Konto skapat! Du kan nu logga in." }
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Något gick fel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Skapa ditt konto</h1>
          <p className="text-gray-600">Fyll i uppgifterna nedan för att slutföra din registrering</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm" role="alert">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              E-postadress
            </label>
            <input
              id="email"
              type="email"
              placeholder={tenant.exampleEmail}
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="verificationCode" className="block text-sm font-medium text-gray-700 mb-1">
              Verifieringskod
            </label>
            <input
              id="verificationCode"
              type="text"
              placeholder="Kod från inbjudan"
              value={verificationCode}
              onChange={e => setVerificationCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-center text-lg tracking-widest"
              maxLength={12}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Koden fick du av din administratör
            </p>
          </div>

          <hr className="border-gray-200" />

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Ditt namn
            </label>
            <input
              id="name"
              type="text"
              placeholder="Förnamn Efternamn"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="name"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Lösenord
            </label>
            <input
              id="password"
              type="password"
              placeholder="Minst 8 tecken, bokstav + siffra"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
              Bekräfta lösenord
            </label>
            <input
              id="confirm"
              type="password"
              placeholder="Upprepa lösenordet"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--tenant-brand)] text-white py-3 px-4 rounded-lg hover:opacity-90 focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
          >
            {loading ? "Skapar konto..." : "Skapa konto"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          Har du problem? Kontakta din systemadministratör
        </p>
      </div>
    </div>
  );
};
