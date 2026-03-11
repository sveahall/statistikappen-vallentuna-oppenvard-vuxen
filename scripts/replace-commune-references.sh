#!/bin/bash
# Skript för att ersätta tenant-referenser med ny kommun
# Användning: ./scripts/replace-commune-references.sh "Ny Kommun" "ny-kommun" "support@ny-kommun.se"

set -euo pipefail

if [ $# -lt 3 ]; then
    echo "Användning: $0 \"Kommun Namn\" \"kommun-slug\" \"support@kommun.se\""
    echo "Exempel: $0 \"Stockholm Stad\" \"stockholm\" \"support@stockholm.se\""
    exit 1
fi

COMMUNE_NAME="$1"
COMMUNE_SLUG="$2"
SUPPORT_EMAIL="$3"
COMMUNE_DOMAIN="${SUPPORT_EMAIL#*@}"

echo "🔄 Ersätter template-referenser med $COMMUNE_NAME..."

# Ersätt i filer
find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.json" -o -name "*.md" -o -name "*.html" -o -name "*.sh" \) \
    ! -path "./node_modules/*" \
    ! -path "./.git/*" \
    ! -path "./dist/*" \
    ! -path "./backend/dist/*" \
    ! -path "./backend/node_modules/*" \
    -exec sed -i '' \
        -e "s/Template Municipality/$COMMUNE_NAME/g" \
        -e "s/municipality-template/$COMMUNE_SLUG/g" \
        -e "s/support@example\.com/$SUPPORT_EMAIL/g" \
        -e "s/admin@example\.com/admin@$COMMUNE_DOMAIN/g" \
        -e "s/exempel@example\.com/exempel@$COMMUNE_DOMAIN/g" \
        -e "s/app\.example\.com/app.$COMMUNE_DOMAIN/g" \
        -e "s/api\.example\.com/api.$COMMUNE_DOMAIN/g" \
        -e "s/admin\.example\.com/admin.$COMMUNE_DOMAIN/g" \
        -e "s/municipality-backend/$COMMUNE_SLUG-backend/g" \
        {} \;

echo "✅ Ersättning klar!"
echo ""
echo "⚠️  OBS: Kontrollera följande manuellt:"
echo "   - Logo-filer (public/municipality-logo.svg)"
echo "   - Färger i tenant-konfig (src/config/tenant.ts)"
echo "   - Sökvägar i DEPLOY_README.md (/srv/municipality-template/)"
echo "   - Miljövariabler i .env-filer"
