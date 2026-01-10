import { AngularNodeAppEngine, createNodeRequestHandler, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

// Async initialization to load manifests before starting server
async function startServer() {
  // Load manifests dynamically at runtime
  const [{ default: angularAppManifest }, { default: angularAppEngineManifest }] = await Promise.all([
    import(`${serverDistFolder}/angular-app-manifest.mjs`),
    import(`${serverDistFolder}/angular-app-engine-manifest.mjs`)
  ]);

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

  return app;
}

// Start the server and catch any errors
startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

/**
 * Export for Angular CLI dev-server (won't be used in production)
 */
export const reqHandler = createNodeRequestHandler(express());
