import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { tenant } from '@/config/tenant';

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  route?: string; // target route for this step
  selector?: string; // css selector for target element (uses data-tour in many cases)
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: { label: string; type: 'click-selector' | 'navigate' | 'none'; selector?: string; route?: string };
};

type OnboardingContextType = {
  active: boolean;
  stepIndex: number;
  steps: OnboardingStep[];
  start: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  complete: () => void;
  goTo: (index: number) => void;
  reset: () => void;
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export const useOnboarding = () => {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
};

function storageKeys(userId?: number) {
  const id = userId ?? 0;
  return {
    completed: `onboarding_${id}_completed`,
    step: `onboarding_${id}_step`,
    snoozeUntil: `onboarding_${id}_snooze_until`,
  };
}

// Define the guided tour steps here to keep them centralized
const baseSteps: OnboardingStep[] = [
  // 1. Startsidan
  {
    id: 'welcome',
    title: `Välkommen till ${tenant.uiBrandName}`,
    description: 'Vi guidar dig igenom de viktigaste delarna. Du kan alltid öppna guiden igen via Guide-knappen.',
    route: '/dashboard',
    placement: 'center',
  },
  {
    id: 'quick-actions',
    title: 'Startsida – Snabbåtgärder',
    description: 'Här finns snabbåtgärder för att snabbt lägga till en ny kund, registrera en insats, registrera tid  och ta ut statistik.',
    route: '/dashboard',
    selector: '[data-tour="quick-actions"]',
    placement: 'bottom',
  },
  {
    id: 'dashboard-chart',
    title: 'Startsida – Besöksstatistik',
    description: 'Snabb överblick över månadens besök och kunder per insatsyp.',
    route: '/dashboard',
    selector: '[data-tour="chart-section"]',
    placement: 'top',
  },

  // 2. Kunder sidan
  {
    id: 'customers-add',
    title: 'Kunder – Lägg till ny kund',
    description: 'Börja med att registrera din kund. Därefter kan du skapa insatser och registrera tider. Du kan även lägga till flera kunder samtidigt.',
    route: '/kunder',
    selector: '[data-tour="customers-add-btn"]',
    placement: 'bottom',
  },
  {
    id: 'customers-list',
    title: 'Kunder – Kundlistan',
    description: 'Här ser du alla kunder. Inaktiva kunder kan visas och anonymiseras i listan. Klicka på en rad för att öppna kundprofilen.',
    route: '/kunder',
    selector: '[data-tour="customers-table"]',
    placement: 'center',
  },
  {
    id: 'customers-profile-note',
    title: 'Kundprofil',
    description: 'I kundprofilen visas alla uppgifter, insatser och tidsregistreringar för kunden.',
    route: '/kunder',
    placement: 'center',
  },

  // 3. Registrera tid
  {
    id: 'time-section',
    title: 'Registrera tid – Tidsregistreringar',
    description: 'Enkelt och snabbt: Välj insats, datum, timmar och status. Observera att kunden måste ha en registrerad insats först.',
    route: '/registrera-tid',
    selector: '[data-tour="time-section"]',
    placement: 'bottom',
  },
  {
    id: 'time-case',
    title: 'Välj insats',
    description: 'Börja med att välja rätt insats här.',
    route: '/registrera-tid',
    selector: '[data-tour="time-case-select"]',
    placement: 'bottom',
  },
  {
    id: 'time-date',
    title: 'Datum',
    description: 'Ange datum för besöket.',
    route: '/registrera-tid',
    selector: '[data-tour="time-date-input"]',
    placement: 'bottom',
  },
  {
    id: 'time-hours',
    title: 'Timmar',
    description: 'Ange antal timmar (kan anges i halvtimmar).',
    route: '/registrera-tid',
    selector: '[data-tour="time-hours-input"]',
    placement: 'bottom',
  },
  {
    id: 'time-status',
    title: 'Status',
    description: 'Välj om tiden är Utförd eller Avbokad.',
    route: '/registrera-tid',
    selector: '[data-tour="time-status-select"]',
    placement: 'bottom',
  },
  {
    id: 'time-add-more',
    title: 'Flera rader',
    description: 'Behöver du registrera flera tider? Lägg till fler rader här.',
    route: '/registrera-tid',
    selector: '[data-tour="time-add-btn"]',
    placement: 'top',
  },
  {
    id: 'time-save',
    title: 'Spara',
    description: 'Spara dina registreringar. Om du har flera rader kan du använda “Spara alla”.',
    route: '/registrera-tid',
    selector: '[data-tour="time-save-all-btn"], [data-tour="time-save-btn"]',
    placement: 'left',
  },
  {
    id: 'create-case',
    title: 'Registrera ny insats för kund',
    description: 'Om insats saknas kan du snabbt skapa det här och därefter registrera tid direkt.',
    route: '/registrera-tid',
    selector: '[data-tour="create-case-toggle"]',
    placement: 'top',
  },
  {
    id: 'time-history',
    title: 'Registrerade tider',
    description: 'Översikt över alla tidsregistreringar. Klicka på en rad för att enkelt ändra om något blivit fel.',
    route: '/registrera-tid',
    selector: '[data-tour="time-history-table"]',
    placement: 'top',
  },

  // 4. Insatslista
  {
    id: 'cases-overview',
    title: 'Insatslista – Översikt',
    description: 'Snabb översikt av alla insatser. Du kan även visa inaktiva insatser.',
    route: '/arendelista',
    selector: '[data-tour="cases-filter"]',
    placement: 'bottom',
  },
  {
    id: 'cases-table',
    title: 'Insatslista – Lista',
    description: 'Klicka på en rad för att se kundprofil och dess insatser.',
    route: '/arendelista',
    selector: '[data-tour="cases-table"]',
    placement: 'top',
  },

  // 5. Statistik
  {
    id: 'stats-filter',
    title: 'Statistik – Filter',
    description: 'Flera filter hjälper dig att få ut precis den statistik du önskar.',
    route: '/statistik',
    selector: '[data-tour="stats-filter"]',
    placement: 'bottom',
  },
  {
    id: 'stats-chart',
    title: 'Statistik – Diagram',
    description: 'Besök och kunder per insatsyp. Hovra för detaljer och exportera vid behov.',
    route: '/statistik',
    selector: '[data-tour="stats-chart"]',
    placement: 'top',
  },
  {
    id: 'stats-export',
    title: 'Statistik – Export',
    description: 'Exportera resultat som PDF eller Excel.',
    route: '/statistik',
    selector: '[data-tour="stats-export-pdf"], [data-tour="stats-export-excel"]',
    placement: 'top',
  },

  // 6. Min profil
  {
    id: 'profile',
    title: 'Min profil',
    description: 'Se dina uppgifter, insatser och logga ut. Vill du ändra info eller har glömt lösenord – kontakta admin.',
    route: '/min-profil',
    placement: 'center',
  },
  {
    id: 'done',
    title: 'Klart! 🎉',
    description: 'Du är redo att använda systemet. Du kan öppna guiden när som helst från hjälpmenyn.',
    route: '/dashboard',
    placement: 'center',
  },
];

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const steps = useMemo(() => baseSteps, []);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Keep route in sync with step
  useEffect(() => {
    if (!active) return;
    const step = steps[stepIndex];
    if (!step) return;
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
  }, [active, stepIndex, steps, location.pathname, navigate]);

  // Load persisted progress when user changes
  useEffect(() => {
    if (!user) return;
    const frame = requestAnimationFrame(() => {
      const keys = storageKeys(user.id);
      const completed = localStorage.getItem(keys.completed) === 'true';
      const savedIndex = Number(localStorage.getItem(keys.step) ?? '0');
      const snoozeRaw = localStorage.getItem(keys.snoozeUntil);
      const snoozedUntil = snoozeRaw ? Number(snoozeRaw) : 0;
      const now = Date.now();

      // Only auto-start for handlers and only if not completed
      if (!completed && user.role === 'handler' && now > snoozedUntil) {
        setStepIndex(Number.isNaN(savedIndex) ? 0 : Math.max(0, Math.min(savedIndex, steps.length - 1)));
        setActive(true);
      } else {
        setActive(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [user, steps.length]);

  // Persist progress per user
  useEffect(() => {
    if (!user) return;
    const keys = storageKeys(user.id);
    localStorage.setItem(keys.step, String(stepIndex));
  }, [stepIndex, user]);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex(i => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const prev = useCallback(() => {
    setStepIndex(i => Math.max(i - 1, 0));
  }, []);

  const skip = useCallback(() => {
    if (user) {
      const keys = storageKeys(user.id);
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem(keys.snoozeUntil, String(Date.now() + weekMs));
    }
    setActive(false);
  }, [user]);

  const complete = useCallback(() => {
    if (user) {
      const keys = storageKeys(user.id);
      localStorage.setItem(keys.completed, 'true');
    }
    setActive(false);
  }, [user]);

  const goTo = useCallback((index: number) => {
    setStepIndex(Math.max(0, Math.min(index, steps.length - 1)));
    setActive(true);
  }, [steps.length]);

  const reset = useCallback(() => {
    if (user) {
      const keys = storageKeys(user.id);
      localStorage.removeItem(keys.completed);
      localStorage.removeItem(keys.step);
    }
    setStepIndex(0);
    setActive(true);
  }, [user]);

  const value: OnboardingContextType = {
    active,
    stepIndex,
    steps,
    start,
    next,
    prev,
    skip,
    complete,
    goTo,
    reset,
  };

  return (
    <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
  );
};
