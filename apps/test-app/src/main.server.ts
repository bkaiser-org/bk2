/***************************************************************************************************
 * zone.js/node is a special version of Zone.js specifically for Node.js environments (like for SSR and pre-rendering).
 * It patches Node.js-specific asynchronous APIs.
 * Server-side rendering (SSR) polyfills are handled by IonicServerModule.
 ***************************************************************************************************/
import 'zone.js/node';

global['customElements'] = {
  define: () => {},
  get: () => undefined,
  getName: () => null,
  upgrade: () => {},
  whenDefined: () => Promise.resolve(class extends HTMLElement {})
};

import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

const bootstrap = () => bootstrapApplication(AppComponent, config);

export default bootstrap;
