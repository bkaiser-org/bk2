import 'zone.js/node';
import { AngularNodeAppEngine } from '@angular/ssr/node';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const angularApp = new AngularNodeAppEngine();

  // Serve static files from /browser
  server.get('*.*', express.static(browserDistFolder, {
    maxAge: '1y'
  }));

  // All other routes use Angular SSR
  server.get('*', (req, res, next) => {
    angularApp
      .handle(req)
      .then((response) => {
        if (response) {
          response.arrayBuffer().then((buffer) => {
            res.setHeader('Content-Type', response.headers.get('Content-Type') || 'text/html');
            res.send(Buffer.from(buffer));
          });
        } else {
          next();
        }
      })
      .catch(next);
  });

  return server;
}

function run(): void {
  const port = process.env['PORT'] || 4000;
  const host = '0.0.0.0';

  const server = app();
  server.listen(Number(port), host, () => {
    console.log(`Node Express server listening on http://${host}:${port}`);
  });
}

run();
