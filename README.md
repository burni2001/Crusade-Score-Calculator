# Adeptus Astartes - Mission Debrief Calculator

A Progressive Web App (PWA) for calculating Warhammer 40K Space Marine 2 mission debriefing scores.

## Features

- Mission score calculation with customizable modifiers
- Support for up to 3 players
- Screenshot OCR to automatically extract stats from game screenshots
- Geneseed and Armoury data tracking
- Export to CSV and PNG formats
- Retro CRT-style interface
- Works offline (PWA)

## Screenshot OCR Setup

The app uses OCR (Optical Character Recognition) by https://ocr.space to automatically read your mission stats from screenshots.

## How to Use

1. Upload screenshots from your Space Marine 2 mission debrief screen
2. Review the detected values and make any corrections
3. Click "Apply Values" to fill in the form
4. Adjust modifiers and other settings as needed
5. Export your results as CSV or PNG

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
