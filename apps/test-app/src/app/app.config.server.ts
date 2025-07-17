import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';
import { IonicServerModule } from '@ionic/angular-server';  // Import for SSR support

/**
 * Server-side configuration for the Angular application.
 * This configuration merges the base application configuration with server-specific settings.
 * It includes the provider for server-side rendering.
 */
const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    IonicServerModule  // Adds Ionic SSR mocks/polyfills (e.g., customElements)
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
