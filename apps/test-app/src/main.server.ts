/**
 * Server-side rendering (SSR) requires that customElements be polyfilled.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const polyfillPath = join(process.cwd(), 'ssr-polyfills.js');
if (existsSync(polyfillPath)) {
  require(polyfillPath);
}


/***************************************************************************************************
 * zone.js/node is a special version of Zone.js specifically for Node.js environments (like for SSR and pre-rendering).
 * It patches Node.js-specific asynchronous APIs.
 ***************************************************************************************************/
import 'zone.js/node';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

const bootstrap = () => bootstrapApplication(AppComponent, config);

export default bootstrap;