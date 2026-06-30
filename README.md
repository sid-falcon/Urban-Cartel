# Live MART

A web app for marketplace/store browsing, orders, and retailer/wholesaler dashboards, built with vanilla JS, Tailwind CSS, Leaflet (maps), and Firebase.

## Tech stack

- HTML / vanilla JS (ES modules)
- Tailwind CSS (via CDN)
- Leaflet.js for maps
- Lucide icons
- Firebase (auth/data backend)

## Getting started

1. Clone the repo
2. Copy the Firebase config template and add your own project keys:
   ```bash
   cp js/firebase-config.example.js js/firebase-config.js
   ```
   Then edit `js/firebase-config.js` with your Firebase project's keys.
3. Serve the folder with any static server (e.g. VS Code "Live Server" extension, or):
   ```bash
   npx serve .
   ```
4. Open `index.html` in the browser.

## Project structure

```
.
├── index.html              # Main entry point
├── app.js                  # Main application logic
├── css/
│   └── styles.css          # Custom styles (Tailwind loaded via CDN in index.html)
├── js/
│   ├── firebase-config.js          # Your local Firebase keys (gitignored)
│   └── firebase-config.example.js  # Template - copy this to firebase-config.js
├── images/                 # Logo, icons, static assets
└── archive/                 # Older drafts of app.js kept for reference, not used by the app
```

## Notes

- `archive/` contains earlier in-progress versions of the app/CSS logic from development; not wired into `index.html`.
- The Firebase config in `js/firebase-config.js` is gitignored — don't commit real project keys.
