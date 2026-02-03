# Adeptus Astartes - Mission Debrief Calculator

A Progressive Web App (PWA) for calculating mission debriefing scores.

## Features

- Mission score calculation with customizable modifiers
- Support for up to 3 players
- Screenshot OCR to automatically extract stats from game screenshots
- Geneseed and Armoury data tracking
- Export to CSV and PNG formats
- Save up to 4 Missions in local Storage
- Aggregate Missions results
- Retro CRT-style interface
- Works offline (PWA)

## Screenshot OCR Setup

The app uses OCR (Optical Character Recognition) by https://ocr.space to automatically read your mission stats from screenshots.

## How to Use

1. Upload screenshots from your Space Marine 2 mission debrief screen
2. Review the detected values and make any corrections
3. Click "Apply Values" to fill in the form
4. Adjust modifiers and other settings as needed
5. Save up to 4 results and aggregate them
6. Export your results as png and text message

## Technology

- Pure HTML5, CSS3, and JavaScript (no frameworks)
- OCR powered by [OCR.space](https://ocr.space) API (Engine 2 for best number recognition)
- Service Worker for offline functionality
- Google Fonts (VT323 for retro styling)

## Development

This is a static site with no build process required. Simply serve the files with any HTTP server:

```bash
python -m http.server 5000
```

## Version Management

The version number is managed centrally in the `VERSION` file. 

**To update the version:**
1. Edit the `VERSION` file with the new version number (e.g., `6.1 Alpha1`)
2. Commit and push the change
3. GitHub Actions will automatically update all files

The version is synchronized across:
- `service-worker.js` - Cache name
- `index.html` - Header display
- `script.js`- Header

## Data Storage & Export

### Internal Data Bank
- Save up to 4 mission results in browser memory (LocalStorage)
- Aggregate stored missions for squad statistics  
- Export aggregated data as PNG for sharing

### CSV Export (Debug/Backup)
The calculator can export mission data as CSV files for:
- Debugging and troubleshooting
- External analysis in Excel/Google Sheets
- Long-term backup outside the browser

**CSV Format:**
- ✅ RFC 4180 compliant (handles special characters correctly)
- ✅ Player names with commas: "Smith, John"
- ✅ Mission names with quotes: The "Last Stand" Mission  
- ✅ Compatible with all major spreadsheet applications

**Note:** CSV import is not currently supported. Use the Internal Data Bank (3 mission slots) for multi-mission aggregation within the app.

## License

For personal use.

## Credits
- Development & Implementation: burni2001 (Börni)
- Development Tools: Replit AI, Gemini and Claude
- Scoring System & Event Concept: gilzvit (Gideon)

Joins us on Discord: [Lightning Fist](https://Discord.gg/KtJDBvpBRR) • For the Emperor!
