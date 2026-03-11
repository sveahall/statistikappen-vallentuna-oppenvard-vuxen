# Onboarding Tour Guide

## Översikt

Onboarding-touren är en interaktiv guide som hjälper nya behandlare att förstå hur systemet fungerar. Den visas automatiskt för nya användare och kan startas om manuellt via hjälpknappen.

## Funktioner

### Automatisk start
- Touren startar automatiskt för nya användare efter 1 sekund
- Visas endast en gång per användare (sparas i localStorage)
- Anpassad för kommunala handläggare

### Manuell start
- Hjälpknapp i dashboard för att starta om touren
- Användbar för både nya och befintliga användare

## Steg i touren

1. **Välkommen** - Introduktion till systemet
2. **Dashboard översikt** - Förklaring av dashboard-korten
3. **Snabbåtgärder** - Guide genom huvudfunktionerna
4. **Kundhantering** - Hur man hanterar kunder
5. **Insatsshantering** - Skapa och hantera insatsen
6. **Tidsregistrering** - Logga arbetstid

## Teknisk implementation

### Komponenter
- `OnboardingTour.tsx` - Huvudkomponenten
- Integrerad i `MainContent.tsx`

### Props
```typescript
interface OnboardingTourProps {
  isVisible?: boolean;      // Extern kontroll av synlighet
  onClose?: () => void;     // Callback när touren stängs
  forceShow?: boolean;      // Tvinga visning även för gamla användare
}
```

### State management
- Använder localStorage för att spåra om användaren har sett touren
- Stödjer både intern och extern kontroll av synlighet
- Automatisk start för nya användare

### Styling
- Använder Tailwind CSS
- Följer systemets design med tenant-färger (`var(--tenant-brand)`)
- Responsiv design för olika skärmstorlekar

## Anpassning

### Lägga till nya steg
1. Uppdatera `steps`-arrayen i `OnboardingTour.tsx`
2. Lägg till relevant innehåll och ikoner
3. Uppdatera stegräknaren

### Ändra design
- Uppdatera färger via `src/config/tenant.ts` och `bg-[var(--tenant-brand)]`-klasser
- Modifiera ikoner från Lucide React
- Justera layout och spacing

### Lokalisering
- All text är på svenska
- Enkelt att översätta genom att uppdatera strängarna i `steps`

## Framtida förbättringar

- [ ] Ljudkommentarer
- [ ] Interaktiva övningar
- [ ] Anpassning baserat på användarroll
- [ ] Spara användarens framsteg
- [ ] A/B-testning av olika tour-versioner

## Felsökning

### Touren visas inte
- Kontrollera att `OnboardingTour` är importerad
- Verifiera att `useAuth` fungerar korrekt
- Kolla localStorage för tour-status

### Touren kan inte stängas
- Kontrollera att `onClose` callback fungerar
- Verifiera state-hantering i föräldrakomponenten

### Performance-problem
- Touren laddas endast när den behövs
- Använder `useEffect` för att undvika onödiga renderingar
- Minimala re-renders genom optimerad state-hantering
