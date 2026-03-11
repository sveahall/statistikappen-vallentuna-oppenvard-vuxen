export interface Customer {
  id: number;
  initials: string;
  gender: string | null;
  birth_year: number | null;
  /** Alias for birth_year, set by frontend mapping */
  birthYear?: number | null;
  created_at: string;
  active: boolean;
  is_protected?: boolean;
  can_view?: boolean;
  is_group?: boolean;
  /** Alias for is_group, set by frontend mapping */
  isGroup?: boolean;
  label?: string;
}

export interface Effort {
  id: number;
  name: string;
  available_for: string;
  active: boolean;
}

export interface Handler {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export interface Invite {
  id: number;
  email: string;
  role: string;
  status: InviteStatus;
  status_display?: string;
  created_at: string;
  expires_at: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
  token: string | null;
  verification_code: string | null;
  verification_expires_at: string | null;
  invite_url?: string | null;
  email_verified?: boolean;
}

export interface CaseBase {
  id: number;
  customer_id: number;
  effort_id: number;
  handler1_id: number;
  handler2_id: number | null;
  active: boolean;
  created_at: string;
}

export interface CaseWithNames extends CaseBase {
  customer_name: string;   // customers.initials
  customer_active?: boolean; // customers.active (för UI)
  effort_name: string;     // efforts.name
  handler1_name: string;   // handlers.name
  handler2_name: string | null;
}

export interface Shift {
  id: number;
  case_id: number;
  date: string;
  hours: number;
  status: string;
  active: boolean;
}

export interface ShiftEntry {
  id: number;
  case_id: number;
  date: string;         // 'YYYY-MM-DD'
  hours: number;
  status: string;       // 'Utförd' | 'Avbokad' | ...
  active: boolean;
  // bekvämlighetsfält i listor
  customer_name?: string;
  customer_active?: boolean;
  effort_name?: string;
  handler1_name?: string;
  handler2_name?: string | null;
}

// Kommun-specifika statusvärden
export type ShiftStatus = "Utförd" | "Avbokad";

export interface GlobalSearchResult {
  id: number;
  type: 'customer' | 'handler' | 'effort' | 'case' | 'shift';
  title: string;
  subtitle?: string;
  icon: string;
  data: Record<string, unknown>;
}

export interface StatsSummary {
  antal_besok: number;
  antal_kunder: number;
  totala_timmar: number;
  avbokningsgrad: number;
  aktiva_kunder_total?: number;
  aktiva_insatser_total?: number;
  ny_antal_kunder?: number;
  ny_antal_insatser?: number;
}
  
