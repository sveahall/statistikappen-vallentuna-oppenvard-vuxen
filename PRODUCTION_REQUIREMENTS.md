# 🚀 PRODUKTIONSKRAV - Vallentuna öppenvård vuxen

## 📊 SYSTEMÖVERSIKT

**Vad**: Tidsregistreringssystem för Vallentuna öppenvård vuxen
**Användare**: Handläggare, administratörer, chefer
**Data**: Kunder, insatser, tidsregistrering, statistik

## 👥 ANVÄNDARANTAL

- **Aktiva användare**: 15-25 personer
- **Samtidiga användare**: 5-10 personer
- **Total användarbas**: 30-40 personer (inklusive inaktiva)

## 💾 DATA-MÄNGD

### **Nuvarande data:**
- **Kunder**: ~500-1000 personer
- **insatser**: ~2000-5000 insatser
- **Tidsregistreringar**: ~10000-20000 poster
- **Användare**: ~30-40 personer

### **Förväntad tillväxt:**
- **Per år**: 20-30% ökning
- **5 års perspektiv**: 3-5x nuvarande mängd

## ⏰ TILLGÄNGLIGHET

- **Arbetstid**: Måndag-Fredag 08:00-17:00
- **Efter arbetstid**: Kan vara tillgängligt (24/7 rekommenderas)
- **Underhåll**: Helst söndagar 02:00-06:00

## 🗄️ TEKNISKA KRAV

### **Server-kapacitet:**
- **RAM**: Minst 4GB (8GB rekommenderas)
- **CPU**: Minst 2 kärnor (4 kärnor rekommenderas)
- **Disk**: Minst 50GB (100GB rekommenderas)
- **Nätverk**: Minst 100Mbps

### **Programvara som behövs:**
- **Operativsystem**: Linux (Ubuntu 20.04+ rekommenderas)
- **Node.js**: Version 18+ 
- **PostgreSQL**: Version 13+
- **Redis**: Version 6+ (för rate limiting)
- **Nginx**: För reverse proxy och SSL

### **Portar som behöver vara öppna:**
- **22**: SSH (för administration)
- **80**: HTTP (redirect till HTTPS)
- **443**: HTTPS (huvudport för systemet)
- **5432**: PostgreSQL (endast lokalt)

## 🔒 SÄKERHETSKRAV

- **SSL-certifikat**: Let's Encrypt eller betalt certifikat
- **Firewall**: Begränsa åtkomst till nödvändiga portar
- **Backup**: Daglig backup av databas (retention 30 days)
- **Monitoring**: Loggning av alla åtkomster
- **Rate limiting**: Skydda mot DDoS-attacker

## ✅ SECURITY BASELINE (kort)

- **Auth rate limiting**: per IP+konto och per IP (styrt av `LOGIN_RATE_LIMIT_*` och `LOGIN_IP_RATE_LIMIT_*`).
- **Brute force lockout**: konto låses temporärt efter X misslyckade försök (`LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`).
- **Security headers**: CSP baseline, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` med vanliga features avstängda.
- **Audit logging**: login success/failure samt admin‑ändringar för användare/roller/invites (fält: timestamp, actorId, action, targetId, ip, userAgent).

## 🌐 DOMÄN & NÄTVERK

- **Huvuddomän**: app.example.com (eller liknande)
- **Admin-domän**: admin.example.com (valfritt)
- **SSL**: Automatisk förnyelse av certifikat
- **CORS**: Endast tillåtna domäner

## 📈 SKALBARHET

- **Kortsiktig**: Hantera 50 samtidiga användare
- **Långsiktig**: Hantera 200+ samtidiga användare
- **Data**: Hantera 100k+ poster utan prestandaproblem

## 🚨 KRITISKA KOMPONENTER

1. **Databas**: Måste vara tillgänglig 99.9% av tiden
2. **API**: Måste svara inom 2 sekunder
3. **Backup**: Måste fungera automatiskt
4. **Monitoring**: Måste varna vid problem

## 💰 KOSTNADSESTIMAT

- **Server-hosting**: 200-500 kr/månad
- **SSL-certifikat**: 0-2000 kr/år
- **Domän**: 100-200 kr/år
- **Underhåll**: 2-4 timmar/månad

## 📅 TIMELINE

- **Server-setup**: 1-2 veckor
- **Deployment**: 1 vecka
- **Testning**: 1 vecka
- **Live**: 3-4 veckor från nu

## ❓ FRÅGOR TILL KUNDANSVARIG

1. **Server-specifikationer**: Vad har ni för server?
2. **Nätverkskonfiguration**: Hur är nätverket uppsatt?
3. **Backup-strategi**: Hur gör ni backup av andra system?
4. **Monitoring**: Har ni redan monitoring-lösningar?
5. **Support**: Vem hjälper till vid problem?
6. **Timeline**: När kan vi börja med setup?
