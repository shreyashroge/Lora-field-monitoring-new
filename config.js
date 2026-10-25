// Backend base URL (no trailing slash).
//
//  ''                                  -> same server as this page (npm start, or Render serving the site).
//                                         On GitHub Pages there is no backend, so the page runs in
//                                         local DEMO mode automatically.
//  'https://your-app.onrender.com'     -> use this when the page is on GitHub Pages but the backend is
//                                         deployed on Render. The page then shows LIVE data.
window.API_BASE = '';
