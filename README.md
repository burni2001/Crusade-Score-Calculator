# Adeptus Astartes - Mission Debrief Calculator

A Progressive Web App (PWA) for calculating Warhammer 40K Space Marine 2 mission debriefing scores.

## Features

- Mission score calculation with customizable modifiers
- Support for up to 3 players
- Screenshot OCR to automatically extract stats from game screenshots
- Difficulty level and objective tracking
- Geneseed and Armoury data tracking
- Export to CSV and PNG formats
- Retro CRT-style interface
- Works offline (PWA)

## Screenshot OCR Setup

The app uses OCR (Optical Character Recognition) to automatically read your mission stats from screenshots. This requires a free API key:

1. **Get your free API key** at [ocr.space/ocrapi/freekey](https://ocr.space/ocrapi/freekey)
2. The free tier includes **25,000 scans per month** (more than enough for personal use)
3. Paste your key into the app - it's saved in your browser only

**Privacy:** Your API key is stored only in your browser's local storage and sent directly to OCR.space when processing screenshots. The app never sees, stores, or transmits your key anywhere else.

## How to Use

1. Enter your OCR API key (one-time setup)
2. Upload screenshots from your Space Marine 2 mission debrief screen
3. Review the detected values and make any corrections
4. Click "Apply Values" to fill in the form
5. Adjust modifiers and other settings as needed
6. Export your results as CSV or PNG

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

## License

For personal use.
