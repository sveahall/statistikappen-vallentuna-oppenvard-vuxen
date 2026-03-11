import { tenant } from "@/config/tenant";
import { Customer, Handler, Effort, CaseWithNames, ShiftEntry, GlobalSearchResult, StatsSummary } from "@/types/types";
import { api } from "./apiClient";

export const API_URL = tenant.apiBaseUrl;

type QueryValue = string | number | boolean | null | undefined;
export type StatsRow = Record<string, string | number | boolean | null>;

const appendQueryParams = (params: URLSearchParams, values?: Record<string, QueryValue>) => {
  if (!values) return;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "boolean") {
      params.append(key, value ? "true" : "false");
    } else {
      params.append(key, String(value));
    }
  }
};

const extractErrorMessage = async (res: Response, fallback: string): Promise<string> => {
  try {
    const errorBody = await res.json();
    return errorBody?.message || errorBody?.error || fallback;
  } catch (parseError) {
    console.error("Failed to parse error response", parseError);
    return fallback;
  }
};

export async function getCustomers(all = false): Promise<Customer[]> {
  const res = await api(`/customers${all ? '?all=true' : ''}`);
  if (!res.ok) throw new Error("Kunde inte hämta kunder");
  const data = await res.json();
  return data.map((c: Customer) => ({
    ...c,
    birthYear: c.birth_year ?? null,
    isGroup: c.is_group ?? false,
  }));
}

export async function protectCustomer(id: number): Promise<{ id: number; is_protected: boolean }> {
  const res = await api(`/customers/${id}/protect`, { method: 'POST' });
  if (!res.ok) {
    const message = await extractErrorMessage(res, 'Kunde inte märka kund som skyddad');
    throw new Error(message);
  }
  return res.json();
}

export async function unprotectCustomer(id: number): Promise<{ id: number; is_protected: boolean }> {
  const res = await api(`/customers/${id}/unprotect`, { method: 'POST' });
  if (!res.ok) {
    const message = await extractErrorMessage(res, 'Kunde inte ta bort skyddad markering');
    throw new Error(message);
  }
  return res.json();
}

export async function createCustomer(data: { initials: string; gender?: string; birthYear?: number; startDate?: string; isGroup?: boolean }): Promise<Customer> {
  const res = await api(`/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Kunde inte skapa kund");
  return res.json();
}

export async function softDeleteCustomer(id: string): Promise<Customer> {
  const res = await api(`/customers/${id}/deactivate`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    const msg = "Kunde inte avaktivera kund";
    const message = await extractErrorMessage(res, msg);
    throw new Error(message);
  }
  return res.json();
}

export async function reactivateCustomer(id: string): Promise<Customer> {
  const res = await api(`/customers/${id}/activate`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) {
    const msg = "Kunde inte återaktivera kund";
    const message = await extractErrorMessage(res, msg);
    throw new Error(message);
  }
  return res.json();
}

export async function getCustomer(id: string): Promise<Customer & { birthYear: number | null; isGroup?: boolean }> {
  const res = await api(`/customers/${id}`);
  if (!res.ok) throw new Error("Kunde inte hämta kund");
  const c = await res.json();
  return {
    ...c,
    birthYear: c.birth_year ?? null,
    isGroup: c.is_group ?? false,
  };
}

export async function getCustomerTotalHours(id: number): Promise<number> {
  const res = await api(`/customers/${id}/time`);
  if (!res.ok) {
    throw new Error("Kunde inte hämta kundens tid");
  }
  const data = await res.json();
  return Number(data?.totalHours ?? 0);
}

export async function updateCustomer(id: string, data: { initials: string; gender?: string; birthYear?: number; active: boolean; startDate: string; isGroup?: boolean }): Promise<Customer> {
  const res = await api(`/customers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      initials: data.initials,
      gender: data.gender,
      birthYear: data.birthYear,
      active: data.active,
      startDate: data.startDate,
      isGroup: data.isGroup
    })
  });
  if (!res.ok) throw new Error("Kunde inte uppdatera kund");
  return res.json();
}

export async function getEfforts(): Promise<Effort[]> {
  const res = await api(`/efforts`);
  if (!res.ok) throw new Error("Kunde inte hämta insatser");
  return res.json();
}

export async function getCustomerEfforts(customerId: number, options?: { includeInactive?: boolean }) {
  const params = new URLSearchParams({ customer_id: String(customerId) });
  if (options?.includeInactive) {
    params.append('all', 'true');
  }
  const res = await api(`/cases?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Kunde inte hämta insatser för kund ${customerId}`);
  }
  const data = await res.json();
  return data;
}

export async function getCustomerCases(customerId: number) {
  const res = await api(`/cases?customer_id=${customerId}`);
  if (!res.ok) {
    throw new Error(`Kunde inte hämta insatsen för kund ${customerId}`);
  }
  return res.json();
}

export async function getCasesForCustomerEffort(customerId: string, effortId: string): Promise<CaseWithNames[]> {
  const res = await api(`/cases?customer_id=${customerId}&effort_id=${effortId}`);
  if (!res.ok) throw new Error("Kunde inte hämta insatsen för kund och insats");
  return res.json();
}

type GetCasesOptions = {
  params?: Record<string, QueryValue>;
  request?: RequestInit;
};

export async function getCases(all = false, options?: GetCasesOptions): Promise<CaseWithNames[]> {
  const searchParams = new URLSearchParams();
  if (all) {
    searchParams.append('all', 'true');
  }
  appendQueryParams(searchParams, options?.params);
  const query = searchParams.toString();
  const path = query ? `/cases?${query}` : `/cases`;
  const res = await api(path, options?.request);
  if (!res.ok) throw new Error("Kunde inte hämta insatsen");
  const data = await res.json();
  return data;
}

// Ny funktion för att hämta aktiva insatsen för en specifik kund
export async function getActiveCasesByCustomer(customerId: number): Promise<CaseWithNames[]> {
  const res = await api(`/cases?customer_id=${customerId}&active=true`);
  if (!res.ok) throw new Error("Kunde inte hämta insatsen för kund");
  return res.json();
}

// Ny funktion för att skapa nytt insats
export async function createCase(data: { customer_id: number; effort_id: number; handler1_id: number; handler2_id?: number | null; active?: boolean }): Promise<CaseWithNames> {
  const res = await api(`/cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Kunde inte skapa insats");
  }
  return res.json();
}

export async function updateCase(
  id: string,
  data: { customer_id: string; effort_id: string; handler1_id: string; handler2_id?: string | null; active?: boolean }
): Promise<CaseWithNames> {
  const res = await api(`/cases/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Kunde inte uppdatera insats");
  }
  return res.json();
}

// Uppdaterad addShift - case-centrerad och strikt
export async function addShift(data: { case_id: number; date: string; hours: number; status: "Utförd"|"Avbokad" }): Promise<ShiftEntry> {
  if (!data.case_id) throw new Error("case_id krävs");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error("Ogiltigt datumformat");
  if (isNaN(new Date(data.date).getTime())) throw new Error("Ogiltigt datum");
  if (!(data.hours > 0) || data.hours > 24) throw new Error("Timmar måste vara mellan 0 och 24");
  if (data.status !== "Utförd" && data.status !== "Avbokad") throw new Error("Ogiltig status");
  
  const res = await api(`/shifts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Kunde inte skapa besök: ${errorText}`);
  }
  return res.json();
}

export async function getShifts(): Promise<ShiftEntry[]> {
  const res = await api(`/shifts`);
  if (!res.ok) throw new Error("Kunde inte hämta besök");
  return res.json();
}

export async function getShiftsForCase(caseId: string): Promise<ShiftEntry[]> {
  const res = await api(`/shifts?case_id=${caseId}`);
  if (!res.ok) throw new Error("Kunde inte hämta besök för insats");
  return res.json();
}

export async function updateShift(id: string, data: { date: string; hours: number; status: string }): Promise<ShiftEntry> {
  // Validera att hours är positivt och rimligt
  if (data.hours <= 0 || data.hours > 24 || isNaN(data.hours)) {
    throw new Error("Timmar måste vara mellan 0 och 24");
  }

  // Validera datum-format och giltighet
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    throw new Error("Ogiltigt datum-format. Använd YYYY-MM-DD");
  }
  if (isNaN(new Date(data.date).getTime())) {
    throw new Error("Ogiltigt datum");
  }
  
  const res = await api(`/shifts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Kunde inte uppdatera besök: ${errorText}`);
  }
  return res.json();
}

// Inaktivera alla shifts som tillhör ett specifikt case (soft delete - INGEN permanent radering!)
export async function deactivateShiftsForCase(caseId: string): Promise<{ message: string; deactivatedCount: number }> {
  const res = await api(`/shifts/case/${caseId}/deactivate`, {
    method: "PUT"
  });
  if (!res.ok) throw new Error("Kunde inte inaktivera shifts för case");
  return res.json();
}

// Gemensam typ för statistik-filterparametrar
export type StatsFilterParams = {
  from?: string; to?: string; insats?: string; effortCategory?: string;
  gender?: string; birthYear?: string; handler?: string; customer?: string;
  includeInactive?: boolean; shiftStatus?: 'Alla' | 'Utförd' | 'Avbokad';
};

const STATS_PARAM_KEYS = [
  'from', 'to', 'insats', 'effortCategory', 'gender',
  'birthYear', 'handler', 'customer', 'includeInactive', 'shiftStatus',
] as const;

function buildStatsUrl(endpoint: string, params?: StatsFilterParams): string {
  let url = `/stats/${endpoint}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const key of STATS_PARAM_KEYS) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== false && value !== '') {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

async function fetchStats<T>(endpoint: string, errorMsg: string, params?: StatsFilterParams, options?: RequestInit): Promise<T> {
  const res = await api(buildStatsUrl(endpoint, params), options);
  if (!res.ok) throw new Error(errorMsg);
  return res.json() as Promise<T>;
}

export const getStatsSummary = (params?: StatsFilterParams, options?: RequestInit) =>
  fetchStats<StatsSummary>('summary', 'Kunde inte hämta statistik', params, options);

export const getStatsByEffort = (params?: StatsFilterParams, options?: RequestInit) =>
  fetchStats<StatsRow[]>('by-effort', 'Kunde inte hämta statistik per insats', params, options);

export const getStatsByHandler = (params?: StatsFilterParams, options?: RequestInit) =>
  fetchStats<StatsRow[]>('by-handler', 'Kunde inte hämta statistik per behandlare', params, options);

export async function searchAll(query: string, perType?: number): Promise<GlobalSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({ q: trimmed });
  if (perType) params.append('perType', String(perType));

  const res = await api(`/search?${params.toString()}`);
  if (!res.ok) {
    const message = await res.text().catch(() => null);
    throw new Error(message || "Kunde inte söka");
  }
  return res.json();
}

export const getStatsByGender = (params?: StatsFilterParams, options?: RequestInit) =>
  fetchStats<StatsRow[]>('by-gender', 'Kunde inte hämta statistik per kön', params, options);

export const getStatsByBirthYear = (params?: StatsFilterParams, options?: RequestInit) =>
  fetchStats<StatsRow[]>('by-birthyear', 'Kunde inte hämta statistik per födelseår', params, options);

export const getStatsCases = (params?: StatsFilterParams, options?: RequestInit) =>
  fetchStats<StatsRow[]>('cases', 'Kunde inte hämta ärenden', params, options);

export const getStatsRaw = (params?: StatsFilterParams, options?: RequestInit) =>
  fetchStats<StatsRow[]>('raw', 'Kunde inte hämta detaljerad statistik', params, options);

export const getStatsByMonth = (params?: StatsFilterParams, options?: RequestInit) =>
  fetchStats<StatsRow[]>('by-month', 'Kunde inte hämta statistik per månad', params, options);

export async function getHandlers(all = false): Promise<Handler[]> {
  const res = await api(`/handlers${all ? '?all=true' : ''}`);
  if (!res.ok) throw new Error("Kunde inte hämta behandlare");
  return res.json();
}

export interface HandlerPublic {
  id: string;
  name: string;
}

export const getPublicHandlers = async (): Promise<HandlerPublic[]> => {
  const response = await api(`/handlers/public`);
  if (!response.ok) throw new Error("Kunde inte hämta behandlare");
  return response.json();
};
