import { tenant, validateTenantConfig } from "./tenant";

// Environment validation för att säkerställa att alla nödvändiga variabler finns
export const validateEnv = (): void => {
  const requiredVars = [
    'VITE_API_URL'
  ];

  const missingVars: string[] = [];

  for (const varName of requiredVars) {
    if (!import.meta.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    const errorMessage = `Saknade miljövariabler: ${missingVars.join(', ')}. 
    Kontrollera att du har en .env-fil med rätt konfiguration.`;
    
    console.warn('Miljövariabler saknas:', missingVars);
    
    // I utvecklingsläge, visa en varning men låt appen starta
    if (import.meta.env.DEV) {
      console.warn('Appen startar med standardvärden för utveckling');
      console.warn('Skapa en .env-fil för att undvika denna varning');
    } else {
      // I produktion, kasta fel
      throw new Error(errorMessage);
    }
  }

  validateTenantConfig();
};

// Exportera validerade miljövariabler med fallbacks för utveckling
export const env = {
  API_URL: tenant.apiBaseUrl,
  APP_NAME: tenant.uiBrandName,
  IS_DEV: import.meta.env.DEV,
  IS_PROD: import.meta.env.PROD
};
