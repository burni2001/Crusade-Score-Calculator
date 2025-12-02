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
├── icons/                  # PWA icons for various devices
│   ├── icon-192x192.png
│   ├── icon-512x512.png
│   ├── icon-maskable-192x192.png
│   └── icon-maskable-512x512.png
└── replit.md              # This documentation file
```

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
- 2024-12-02: Initial import and Replit environment setup
  - Configured Python HTTP server to serve static files
  - Set up workflow for automatic server start
  - Configured deployment for static site hosting

## Deployment
This is a static site that can be published directly to Replit's hosting without any build process.
