# Så pushar du till GitHub

Detta projekt har ett lokalt git-repo men ingen remote än. Så här kopplar du till GitHub:

## 1. Skapa ett nytt repo på GitHub

1. Gå till [GitHub](https://github.com/new).
2. **Repository name:** `statistikappen-vallentuna-oppenvard-vuxen` (eller valfritt namn).
3. Välj **Private** eller **Public**.
4. **Skapa INTE** README, .gitignore eller licens (projektet har redan allt).
5. Klicka **Create repository**.

## 2. Koppla och pusha

Kör i projektets rot (där du har den nya kopian):

```bash
cd /Users/admin/statistikappen-vallentuna-oppenvard-vuxen

# Lägg till din GitHub-repo-URL (ersätt med din faktiska URL)
git remote add origin https://github.com/DITT-ANVANDARNAMN/statistikappen-vallentuna-oppenvard-vuxen.git

# Alternativt med SSH:
# git remote add origin git@github.com:DITT-ANVANDARNAMN/statistikappen-vallentuna-oppenvard-vuxen.git

# Pusha (första gången)
git branch -M main
git push -u origin main
```

Om du vill behålla branchen `dev` och pusha den också:

```bash
git push -u origin dev
```

## 3. statistikappen-clean förblir oberoende

- **statistikappen-clean** (lokal och på GitHub) är kvar som ren mall för andra kommuner.
- **statistikappen-vallentuna-oppenvard-vuxen** är en egen kopia med eget repo och egen historik.
- Du kan fortsätta utveckla Vallentuna-projektet här och ta uppdateringar från mallen manuellt om du vill (t.ex. genom att jämföra filer eller cherry-pick).
