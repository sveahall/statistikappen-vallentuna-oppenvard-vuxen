# Admin Manual

## Create invite
1. Navigate to **Admin** → **Skapa inbjudan**.
2. Copy the link via **Kopiera länk**.

## Accept invite
1. Recipient opens `/invite/<token>` while logged out.
2. Set name and password; after submission you are redirected to `/login`.

## Reset password
Lösenord hashas med bcrypt i backend. Antalet rounds styrs av miljövariabeln `BCRYPT_ROUNDS` (se `.env`).

Föredraget sätt för återställning:

1) Admin genererar återställningslänk i Admin → Behandlare (eller via `POST /api/handlers/:id/generate-reset-link`).
2) Användaren öppnar länken och sätter nytt lösenord (backend: `POST /api/auth/reset-password`).

Detta säkerställer att lösenordet hashas korrekt med bcrypt och att processen loggas.

## Radering vs avaktivering

- Kunder:
  - “Radera kund” i UI innebär avaktivering (soft delete) och permanent anonymisering av initialer (initials sätts till `ANONYM`).
  - Övrig kunddata bevaras för statistik. Inaktiva kunder kan visas via filter “Inkludera inaktiva”.

- Insatser (efforts) och behandlare (handlers):
  - Hård radering stöds inte via API/UI. Endast avaktivera/återaktivera.
  - `DELETE` på dessa resurser returnerar `405 Method Not Allowed` i API:et.
  - Detta skyddar statistik och historik samt förhindrar oavsiktlig dataförlust.

## Common errors
- `invalid_token`: Token not found or malformed.
- `expired_token`: Token has passed its expiry.
- `already_used`: Token was already used.
