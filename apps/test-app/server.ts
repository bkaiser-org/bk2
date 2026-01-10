import { AngularNodeAppEngine, createNodeRequestHandler, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

// Load manifests and set them globally before creating the engine
const { default: angularAppManifest } = await import(new URL('./angular-app-manifest.mjs', import.meta.url).href);
const { default: angularAppEngineManifest } = await import(new URL('./angular-app-engine-manifest.mjs', import.meta.url).href);

// Set manifests globally (required by AngularNodeAppEngine)
(globalThis as any).ɵgetAngularAppManifest = () => angularAppManifest;
(globalThis as any).ɵgetAngularAppEngineManifest = () => angularAppEngineManifest;

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Serve static files from /browser
 */
app.use(express.static(browserDistFolder, {
  maxAge: '1y',
  index: false,
}));

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('*', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
const port = process.env['PORT'] || 4000;
const host = '0.0.0.0'; // Cloud Run requires listening on all interfaces
app.listen(Number(port), host, () => {
  console.log(`Node Express server listening on http://${host}:${port}`);
});

/**
 * The request handler used by the Angular CLI (dev-server and during build).
 */
export const reqHandler = createNodeRequestHandler(app);
