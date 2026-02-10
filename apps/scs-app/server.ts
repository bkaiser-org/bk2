import 'zone.js/node';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bootstrap from './src/main.server';

const app = express();
const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const indexHtml = join(serverDistFolder, 'index.server.html');

const commonEngine = new CommonEngine();

app.set('view engine', 'html');
app.set('views', browserDistFolder);

/**
 * Serve static files from /browser with proper MIME types
 * This must come BEFORE the catch-all route
 */
app.use(express.static(browserDistFolder, {
  maxAge: '1y',
  index: false, // Prevent serving index.html for directory requests
  setHeaders: (res, path) => {
    // Ensure correct MIME types for JavaScript modules
    if (path.endsWith('.js') || path.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

/**
 * Explicitly handle chunk files (lazy-loaded modules)
 */
app.get(/.*\.(js|mjs|css|json|ico|svg|png|jpg|jpeg|gif|woff|woff2|ttf|eot)$/, (req, res, next) => {
  res.sendFile(join(browserDistFolder, req.url), (err) => {
    if (err) {
      next(); // File not found, continue to SSR
    }
  });
});

/**
 * All other routes use the Angular engine (SPA fallback)
 */
app.get('*', (req, res, next) => {
  const { protocol, originalUrl, headers } = req;

  commonEngine
    .render({
      bootstrap,
      documentFilePath: indexHtml,
      url: `${protocol}://${headers.host}${originalUrl}`,
      publicPath: browserDistFolder,
      providers: [],
    })
    .then((html) => res.send(html))
    .catch((err) => next(err));
});

/**
 * Start the server.
 */
const port = process.env['PORT'] || 4000;
const host = '0.0.0.0';
app.listen(Number(port), host, () => {
  console.log(`Node Express server listening on http://${host}:${port}`);
});

export default app;
