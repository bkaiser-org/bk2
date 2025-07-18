/***************************************************************************************************
 * zone.js/node is a special version of Zone.js specifically for Node.js environments (like for SSR and pre-rendering).
 * It patches Node.js-specific asynchronous APIs.
 * Server-side rendering (SSR) polyfills are handled by IonicServerModule.
 ***************************************************************************************************/
import 'zone.js/node';
import { bootstrapApplication } from '@angular/platform-browser';
import { ApplicationRef } from '@angular/core';  // Import for explicit typing
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

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

// Explicitly type bootstrap to avoid broad 'Function' inference
const bootstrap: () => Promise<ApplicationRef> = () =>
  bootstrapApplication(AppComponent, config).catch((err) => {
    console.error('Bootstrap Error:', err);
    console.error('Stack Trace:', err.stack);
    return Promise.reject(err instanceof Error ? err : new Error(String(err))); // Ensure the rejection reason is always an Error
  });

export default bootstrap;