import 'zone.js/node';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bootstrap from './main.server.mjs';

const app = express();
const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const indexHtml = join(serverDistFolder, 'index.server.html');

const commonEngine = new CommonEngine();

app.set('view engine', 'html');
app.set('views', browserDistFolder);

/**
 * Serve static files from /browser
 */
app.use('*.*', express.static(browserDistFolder, {
  maxAge: '1y'
}));

/**
 * All routes use the Angular engine
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
