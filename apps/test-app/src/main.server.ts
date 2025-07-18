/***************************************************************************************************
 * zone.js/node is a special version of Zone.js specifically for Node.js environments (like for SSR and pre-rendering).
 * It patches Node.js-specific asynchronous APIs.
 * Server-side rendering (SSR) polyfills are handled by IonicServerModule.
 ***************************************************************************************************/
import 'zone.js/node';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

global['customElements'] = {
  get: (name: string) => {
    console.log(`Attempting to get custom element: ${name}`);
    return undefined;  // Or mock class
  },
  define: (name: string, ctor: CustomElementConstructor) => {
    console.log(`Defining custom element: ${name}`);
  },
  getName: (constructor: Function) => {
    console.log(`Getting name for constructor: ${constructor.name}`);
    return null;
  },
  upgrade: (root: Node) => {
    console.log('Upgrading custom elements in:', root);
  },
  whenDefined: (name: string) => {
    console.log(`whenDefined called for: ${name}`);
    return Promise.resolve(undefined as unknown as CustomElementConstructor);
  }
};

// Add global error handlers for more context
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (reason instanceof Error) {
    console.error('Stack Trace:', reason.stack);  // Prints full context, often showing the custom element
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  console.error('Stack Trace:', err.stack);  // Key for identifying the component (e.g., ion-tabs in Ionic code)
  process.exit(1);  // Optional: Exit to prevent hanging
});

const bootstrap = () => bootstrapApplication(AppComponent, config).catch((err) => {
  console.error('Bootstrap Error:', err);
  console.error('Stack Trace:', err.stack);
});

export default bootstrap;