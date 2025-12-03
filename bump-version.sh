#!/bin/bash

# Version bumping script for Adeptus Astartes Mission Debrief
# Usage:
#   ./bump-version.sh minor   - Bump middle digit (0.5.28 -> 0.6.0) for bigger updates
#   ./bump-version.sh patch   - Bump last digits (0.5.28 -> 0.5.29) for smaller updates
#   ./bump-version.sh         - Same as patch (default)

VERSION_FILE="version.json"

if [ ! -f "$VERSION_FILE" ]; then
    echo "Error: version.json not found"
    exit 1
fi

MAJOR=$(grep -o '"major": [0-9]*' "$VERSION_FILE" | grep -o '[0-9]*')
MINOR=$(grep -o '"minor": [0-9]*' "$VERSION_FILE" | grep -o '[0-9]*')
PATCH=$(grep -o '"patch": [0-9]*' "$VERSION_FILE" | grep -o '[0-9]*')

OLD_VERSION="$MAJOR.$MINOR.$PATCH"

BUMP_TYPE="${1:-patch}"

case "$BUMP_TYPE" in
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        echo "Bumping minor version (bigger update)"
        ;;
    patch)
        PATCH=$((PATCH + 1))
        echo "Bumping patch version (smaller update)"
        ;;
    *)
        echo "Usage: $0 [minor|patch]"
        echo "  minor - Bump middle digit (bigger updates)"
        echo "  patch - Bump last digits (smaller updates, default)"
        exit 1
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

echo "Version: $OLD_VERSION -> $NEW_VERSION"

cat > "$VERSION_FILE" << EOF
{
  "major": $MAJOR,
  "minor": $MINOR,
  "patch": $PATCH
}
EOF

sed -i "s/V $OLD_VERSION/V $NEW_VERSION/g" index.html
sed -i "s/V [0-9]*\.[0-9]*\.[0-9]*/V $NEW_VERSION/g" index.html

CACHE_VERSION=$((MINOR * 100 + PATCH))
sed -i "s/mission-debrief-v[0-9]*/mission-debrief-v$CACHE_VERSION/g" service-worker.js

echo "Updated files:"
echo "  - version.json"
echo "  - index.html (display version)"
echo "  - service-worker.js (cache version: v$CACHE_VERSION)"
echo ""
echo "Don't forget to update replit.md with your changes!"
