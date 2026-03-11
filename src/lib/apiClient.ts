import { API_URL } from "./api";

// Single-flight refresh to prevent multiple concurrent refresh requests
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshAccessToken(): Promise<string | null> {
  // Reuse in-flight refresh
  if (refreshPromise) return refreshPromise;

  const storedRefresh = sessionStorage.getItem('refreshToken') || localStorage.getItem('refreshToken');
  if (!storedRefresh) return null;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/users/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefresh })
      });
      if (!res.ok) return null;
      const data = await res.json();
      const newAccess = data?.accessToken as string | undefined;
      if (!newAccess) return null;

      // Respect where refresh token is stored (session vs local)
      if (sessionStorage.getItem('refreshToken')) {
        sessionStorage.setItem('accessToken', newAccess);
      } else {
        localStorage.setItem('accessToken', newAccess);
      }
      return newAccess;
    } catch {
      return null;
    } finally {
      // allow next refresh after current microtask completes
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function api(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_URL}${path}`;

  // Prepare headers with latest access token
  const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const headers = new Headers(options.headers);
  const authHeaders = getAuthHeaders();
  Object.entries(authHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  // Default timeout if no signal provided
  let controller: AbortController | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let signal = options.signal;
  if (!signal) {
    controller = new AbortController();
    signal = controller.signal;
    // 10s default timeout
    timeoutId = setTimeout(() => controller?.abort(), 10000);
  }

  const doFetch = () => fetch(url, { ...options, headers, signal });

  // First attempt
  let res = await doFetch();

  // If unauthorized and not already hitting refresh/login, try refresh once
  if (res.status === 401 && !path.startsWith('/users/refresh') && !path.startsWith('/users/login')) {
    const newAccess = await tryRefreshAccessToken();
    if (newAccess) {
      // retry with new token
      const retryHeaders = new Headers(options.headers);
      Object.entries(getAuthHeaders()).forEach(([key, value]) => retryHeaders.set(key, value));
      retryHeaders.set('Authorization', `Bearer ${newAccess}`);
      res = await fetch(url, { ...options, headers: retryHeaders, signal });
    }
  }

  // Rensa timeout efter att request är klar
  if (timeoutId !== undefined) clearTimeout(timeoutId);

  return res;
}

// Backwards compatibility
export const apiClient = api;
