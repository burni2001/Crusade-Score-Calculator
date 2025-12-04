# Adeptus Astartes - Mission Debrief

## Overview
A Progressive Web App (PWA) calculator for Warhammer 40K Space Marine 2 mission debriefing scores. This static web application helps players track and calculate their mission performance across various metrics including kills, deaths, objectives, and more.

## Project Type
- Pure client-side static web application
- No backend or build process required
- Progressive Web App with offline capabilities

## Project Structure
```
.
├── index.html              # Main application file with embedded CSS and JavaScript
├── manifest.json           # PWA manifest for installability
├── service-worker.js       # Service worker for offline functionality and caching
├── version.json            # Central version storage (major.minor.patch)
├── bump-version.sh         # Script to automatically update version numbers
├── icons/                  # PWA icons for various devices
│   ├── icon-192x192.png
│   ├── icon-512x512.png
│   ├── icon-maskable-192x192.png
│   └── icon-maskable-512x512.png
└── replit.md              # This documentation file
```

## Version Management
Current version: **0.9.6**

To manually update version, edit `version.json`:
```json
{
  "major": 0,
  "minor": 9,
  "patch": 6
}
```

Then update:
- `service-worker.js` - Cache version (e.g., `v096`)
- `index.html` - Display version in header (e.g., `V 0.9.6`)

## Features
- Mission score calculation based on customizable modifiers
- Support for up to 3 players
- Difficulty level selection
- Objective completion tracking
- Geneseed and Armoury data tracking
- Export functionality (Text and CSV formats)
- Responsive design for mobile and desktop
- Retro CRT-style interface with green monochrome theme
- Offline functionality via Service Worker

## Technology Stack
- Pure HTML5
- CSS3 with custom retro styling
- Vanilla JavaScript (no frameworks)
- Service Worker API for PWA functionality
- Google Fonts (VT323)

## Running the Application
The application is served using Python's built-in HTTP server on port 5000. No build step is required.

## Recent Changes
- 2024-12-04: Fixed OCR name extraction and updated wording (v0.9) ✅ LATEST
  - **OCR name filtering**: Now filters out "[RIGHT]" and "[LEFT]" markers from player names
  - **Consistent wording**: Updated all labels to use "Special Kills" and "Damage Taken" throughout (GUI, OCR modal, CSV export)
  - **Result**: Clean player name extraction, no more "RIGHT" appearing as player names

- 2024-12-04: Dual-pass OCR with aggressive right-side crop (v0.9) ✅ STABLE
  - **Dual-pass OCR**: Left half for mission headers, right half (upscaled) for stats table
  - **Aggressive cropping**: Right side crops to 75% height (skip top 10%, bottom 15%) and 90% width (skip edges)
  - **Zero detection**: Treats "U" and "O" as "0" specifically on Incapacitations line
  - **Mission detection**: Finds mission names anywhere in OCR text (handles split lines)
  - **Result**: Very few missing data points, high accuracy on digits and stats
  - GUI wording updated: "Damage Taken" instead of "Damage", "Special Kills" instead of "Elite Kills"

- 2024-12-04: Embedded OCR API key for seamless user experience (v0.8.0)
  - API key now embedded in app (base64 obfuscated) - no user setup required
  - Removed API key input field from UI
  - Improved partial stats extraction: populates Player 1 even when OCR misses columns
  - Better armoury data detection from REWARDS section
  - Automatic image compression for large screenshots (>1MB)
  - Improved error messages for OCR failures

- 2024-12-04: Switched to OCR.space API for better accuracy (v0.7.0)
  - Replaced Tesseract.js with OCR.space cloud API
  - Uses Engine 2 which is optimized for numbers and special characters
  - Enabled table mode and image upscaling for better stats recognition
  - Added Tesseract.js fallback for basic OCR
  - Created README.md for GitHub with setup instructions

- 2024-12-03: OCR image preprocessing and debug export (v0.6.11)
  - Added image preprocessing before OCR: converts to high-contrast black/white
  - Enhances green text on dark background for better Tesseract recognition
  - Added "Export Debug Data" button in OCR review modal for troubleshooting
  - Debug export includes: detected values, raw OCR text, and line-by-line analysis
  - Multi-pattern stats extraction with OCR-tolerant regex variants
  - Better handling of garbled OCR output from game screenshots

- 2024-12-03: Added Class field and improved OCR name extraction (v0.5.38)
  - Added Class dropdown to Squad Performance Matrix (Tactical, Assault, Vanguard, Bulwark, Sniper, Heavy, Techmarine)
  - OCR now extracts both player names AND class from screenshots
  - Uses class mapping with fuzzy matching for OCR misreads (e.g., "ANGUARD" → Vanguard)
  - Stats extraction takes last 3 numbers on each row (skips XP badge numbers like "XB 10")
  - Class values are saved/loaded with localStorage and included in OCR review modal
  - Techmarine added in preparation for upcoming game update

- 2024-12-03: Major OCR parsing improvements (v0.5.35)
  - Fixed matrix layout bug where Damage row was missing its label cell
  - Heavy text normalization: removes stars, XP badges, normalizes unicode
  - Creates uppercase single-line version for more tolerant pattern matching
  - Player name extraction: scans lines for class names (BULWARK/VANGUARD/etc), takes previous line as name
  - Supports Unicode letters (Ö, Ü, etc) via \u00C0-\u024F range
  - Flexible regex patterns accept various separators (colons, equals, dashes, spaces)
  - Stats extraction uses tolerant patterns: "KILLS", "SPECIAL KILLS", "DAMAGE TAKEN", "INCAPACITATION"
  - Armoury data detected from "ARMOURY DATA" or REWARDS section
  - OCR review modal shows all detected values for manual verification

- 2024-12-03: Enhanced OCR functionality and added Clear Data button
  - OCR now shows review modal before applying values (instead of auto-filling)
  - Users can see detected values and raw OCR text for manual review
  - "Apply Values" button overwrites existing form data with OCR results
  - Added "Clear Mission Data" button (orange styling) that clears all fields except modifiers
  - Incremented service worker cache version to v4

- 2024-12-02: Added localStorage, input validation, and improved PNG export
  - Added localStorage to automatically save and restore all form inputs
  - Added input validation with min=0 constraints on player stat fields
  - Added inputmode="numeric" for better mobile keyboard experience
  - Updated PNG export to always render in wide desktop view (1100px) regardless of screen size
  - Incremented service worker cache version to v2

- 2024-12-02: Initial import and Replit environment setup
  - Configured Python HTTP server to serve static files
  - Set up workflow for automatic server start
  - Configured deployment for static site hosting

## Deployment
This is a static site that can be published directly to Replit's hosting without any build process.
