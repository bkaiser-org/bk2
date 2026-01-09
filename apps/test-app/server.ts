import 'zone.js/node';
import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr/node';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = join(serverDistFolder, 'index.server.html');

  const commonEngine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  // Serve static files from /browser
  server.get('*.*', express.static(browserDistFolder, {
    maxAge: '1y'
  }));

  // All regular routes use the Angular engine
  server.get('*', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    commonEngine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
      })
      .then((html) => res.send(html))
      .catch((err: Error) => next(err));
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;
  const host = '0.0.0.0'; // Listen on all interfaces for Cloud Run

  // Load manifests at runtime
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  Promise.all([
    import(join(serverDistFolder, 'angular-app-manifest.mjs')),
    import(join(serverDistFolder, 'angular-app-engine-manifest.mjs'))
  ]).then(([appManifest, engineManifest]) => {
    // Set the manifests globally (required by CommonEngine)
    (globalThis as any).ɵgetAngularAppManifest = () => appManifest.default;
    (globalThis as any).ɵgetAngularAppEngineManifest = () => engineManifest.default;

    // Start up the Node server
    const server = app();
    server.listen(Number(port), host, () => {
      console.log(`Node Express server listening on http://${host}:${port}`);
    });
  }).catch(err => {
    console.error('Failed to load Angular manifests:', err);
    process.exit(1);
  });
}

run();
