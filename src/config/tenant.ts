type TenantTheme = {
  primary: string;
  primaryHover: string;
  primarySoft: string;
  primaryRing: string;
};

type TenantAssets = {
  logoPath: string;
  logoAlt: string;
};

export type TenantConfig = {
  municipalityName: string;
  municipalityCode: string;
  uiBrandName: string;
  uiBrandSubtitle: string;
  supportEmail: string;
  exampleEmail: string;
  baseUrl: string;
  apiBaseUrl: string;
  defaultTimezone: string;
  locale: string;
  dataRetentionDays: number;
  assets: TenantAssets;
  theme: TenantTheme;
};

const fallbackBaseUrl = (() => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "http://localhost:5173";
})();

const fallbackApiBaseUrl = (() => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin.replace(/\/$/, "")}/api`;
  }
  return "http://localhost:4000/api";
})();

const defaultTenant: TenantConfig = {
  municipalityName: "Vallentuna kommun",
  municipalityCode: "VALLENTUNA_OPPENVARD_VUXEN",
  uiBrandName: "Vallentuna kommun",
  uiBrandSubtitle: "Öppenvård vuxen statistiksystem",
  supportEmail: "support@vallentuna.se",
  exampleEmail: "exempel@vallentuna.se",
  baseUrl: fallbackBaseUrl,
  apiBaseUrl: fallbackApiBaseUrl,
  defaultTimezone: "Europe/Stockholm",
  locale: "sv-SE",
  dataRetentionDays: 1825,
  assets: {
    logoPath: "/vallentuna-logo.png",
    logoAlt: "Vallentuna kommun logo",
  },
  theme: {
    primary: "#17694c",
    primaryHover: "#145c41",
    primarySoft: "#eaf6f1",
    primaryRing: "rgba(23, 105, 76, 0.9)",
  },
};

const getEnv = (key: keyof ImportMetaEnv): string | undefined =>
  import.meta.env[key] as string | undefined;

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const tenant: TenantConfig = (() => {
  let uiBrandName =
    getEnv("VITE_UI_BRAND_NAME") ||
    getEnv("VITE_MUNICIPALITY_NAME") ||
    getEnv("VITE_APP_NAME") ||
    defaultTenant.uiBrandName;
  // Detta projekt är för Vallentuna öppenvård vuxen – överskriv gammal template-text
  if (uiBrandName.trim().toLowerCase() === "template municipality") {
    uiBrandName = defaultTenant.uiBrandName;
  }

  let municipalityName =
    getEnv("VITE_MUNICIPALITY_NAME") || uiBrandName || defaultTenant.municipalityName;
  if (municipalityName.trim().toLowerCase() === "template municipality") {
    municipalityName = defaultTenant.municipalityName;
  }

  const uiBrandSubtitle =
    getEnv("VITE_UI_BRAND_SUBTITLE") || defaultTenant.uiBrandSubtitle;

  const tenantId =
    getEnv("VITE_TENANT_ID") || getEnv("VITE_MUNICIPALITY_CODE");

  const municipalityCode = tenantId || defaultTenant.municipalityCode;

  const supportEmail =
    getEnv("VITE_SUPPORT_EMAIL") || defaultTenant.supportEmail;

  const exampleEmail =
    getEnv("VITE_EXAMPLE_EMAIL") || defaultTenant.exampleEmail;

  const baseUrl = getEnv("VITE_BASE_URL") || defaultTenant.baseUrl;

  const apiBaseUrl = getEnv("VITE_API_URL") || defaultTenant.apiBaseUrl;

  const defaultTimezone =
    getEnv("VITE_DEFAULT_TIMEZONE") || defaultTenant.defaultTimezone;

  const locale = getEnv("VITE_LOCALE") || defaultTenant.locale;

  const dataRetentionDays = parseNumber(
    getEnv("VITE_DATA_RETENTION_DAYS"),
    defaultTenant.dataRetentionDays
  );

  const primary = getEnv("VITE_BRAND_PRIMARY") || defaultTenant.theme.primary;
  const primaryHover =
    getEnv("VITE_BRAND_PRIMARY_HOVER") || defaultTenant.theme.primaryHover;
  const primarySoft =
    getEnv("VITE_BRAND_PRIMARY_SOFT") || defaultTenant.theme.primarySoft;
  const primaryRing =
    getEnv("VITE_BRAND_PRIMARY_RING") || defaultTenant.theme.primaryRing;

  const logoPath = getEnv("VITE_BRAND_LOGO") || defaultTenant.assets.logoPath;
  const logoAlt =
    getEnv("VITE_BRAND_LOGO_ALT") || `${uiBrandName} logo`;

  return {
    municipalityName,
    municipalityCode,
    uiBrandName,
    uiBrandSubtitle,
    supportEmail,
    exampleEmail,
    baseUrl,
    apiBaseUrl,
    defaultTimezone,
    locale,
    dataRetentionDays,
    assets: {
      logoPath,
      logoAlt,
    },
    theme: {
      primary,
      primaryHover,
      primarySoft,
      primaryRing,
    },
  };
})();

const normalizeValue = (value: string): string => value.trim().toLowerCase();

const isTemplateValue = (value: string, template: string): boolean =>
  normalizeValue(value) === normalizeValue(template);

export const validateTenantConfig = (): void => {
  const issues: string[] = [];
  const tenantId = getEnv("VITE_TENANT_ID") || getEnv("VITE_MUNICIPALITY_CODE");

  if (!tenantId) {
    issues.push("Sätt VITE_TENANT_ID (eller VITE_MUNICIPALITY_CODE).");
  }

  const usesTemplateIdentity = [
    isTemplateValue(tenant.municipalityCode, defaultTenant.municipalityCode),
    isTemplateValue(tenant.municipalityName, defaultTenant.municipalityName),
    isTemplateValue(tenant.uiBrandName, defaultTenant.uiBrandName),
  ].some(Boolean);

  if (usesTemplateIdentity) {
    issues.push(
      "Templatevärden är endast tillåtna i utveckling. Sätt VITE_MUNICIPALITY_NAME och VITE_UI_BRAND_NAME."
    );
  }

  if (isTemplateValue(tenant.supportEmail, defaultTenant.supportEmail)) {
    issues.push("Sätt VITE_SUPPORT_EMAIL.");
  }

  if (import.meta.env.PROD && tenant.apiBaseUrl && !tenant.apiBaseUrl.startsWith('https://')) {
    issues.push("API-URL måste använda HTTPS i produktion.");
  }

  if (issues.length === 0) return;

  const message = [
    "Tenant-konfiguration saknas eller är ogiltig.",
    ...issues.map(issue => `- ${issue}`),
    `Aktuellt: municipalityCode="${tenant.municipalityCode}", municipalityName="${tenant.municipalityName}", uiBrandName="${tenant.uiBrandName}", supportEmail="${tenant.supportEmail}"`,
  ].join("\n");

  if (import.meta.env.PROD) {
    throw new Error(message);
  }

  console.warn(message);
};

export const applyTenantTheme = (): void => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--tenant-brand", tenant.theme.primary);
  root.style.setProperty("--tenant-brand-hover", tenant.theme.primaryHover);
  root.style.setProperty("--tenant-brand-soft", tenant.theme.primarySoft);
  root.style.setProperty("--tenant-brand-ring", tenant.theme.primaryRing);
};
