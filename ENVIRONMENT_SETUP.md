# Miljövariabler - Setup Guide

## Krävda miljövariabler

För att applikationen ska fungera korrekt behöver du skapa en `.env`-fil i projektets rot med följande variabler:

```bash
# API URL för backend
VITE_API_URL=http://localhost:4000/api

# Tenant-identitet (krävs i produktion)
VITE_TENANT_ID=vallentuna-oppenvard-vuxen # alternativt VITE_MUNICIPALITY_CODE

# Kommunens namn och UI-branding
VITE_MUNICIPALITY_NAME=Vallentuna kommun
VITE_UI_BRAND_NAME=Vallentuna kommun

# Supportkontakt som visas i UI
VITE_SUPPORT_EMAIL=support@vallentuna.se
```

> OBS: I produktion måste tenant‑värden vara satta (templatevärden är endast tillåtna i utveckling).

## Hur du skapar .env-filen

1. Skapa en ny fil som heter `.env` i projektets rot (samma nivå som package.json)
2. Lägg till innehållet ovan
3. Starta om utvecklingsservern

## Felsökning

Om du får felmeddelande om saknade miljövariabler:

1. Kontrollera att `.env`-filen finns i rätt mapp
2. Kontrollera att variablerna är korrekt namngivna (VITE_ prefix krävs)
3. Starta om utvecklingsservern
4. Kontrollera att det inte finns mellanslag runt `=`-tecknet

## Exempel för olika miljöer

### Utveckling
```bash
VITE_API_URL=http://localhost:4000/api
VITE_TENANT_ID=vallentuna-oppenvard-vuxen
VITE_MUNICIPALITY_NAME=Vallentuna kommun
VITE_UI_BRAND_NAME=Vallentuna kommun (Dev)
VITE_SUPPORT_EMAIL=support@vallentuna.se
```

### Staging
```bash
VITE_API_URL=https://staging-api.example.com/api
VITE_TENANT_ID=example
VITE_MUNICIPALITY_NAME=Example Kommun
VITE_UI_BRAND_NAME=Example Kommun (Staging)
VITE_SUPPORT_EMAIL=support@example.com
```

### Produktion
```bash
VITE_API_URL=https://api.example.com/api
VITE_TENANT_ID=example
VITE_MUNICIPALITY_NAME=Example Kommun
VITE_UI_BRAND_NAME=Example Kommun
VITE_SUPPORT_EMAIL=support@example.com
```

## Valfria miljövariabler (branding)

```bash
VITE_UI_BRAND_SUBTITLE=Tidsregistrering och Statistik
VITE_BRAND_LOGO=/municipality-logo.svg
VITE_BRAND_PRIMARY=#17694c
VITE_BRAND_PRIMARY_HOVER=#145c41
VITE_BRAND_PRIMARY_SOFT=#eaf6f1
```
