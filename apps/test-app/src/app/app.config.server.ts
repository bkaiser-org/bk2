import { ApplicationConfig, importProvidersFrom, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { IonicServerModule } from '@ionic/angular-server';  // Import for SSR support
import { appConfig } from './app.config';  // Your client-side config (e.g., with provideIonicAngular)
import { provideClientHydration, withHttpTransferCacheOptions, withIncrementalHydration } from '@angular/platform-browser';

/**
 * Server-side configuration for the Angular application.
 * This configuration merges the base application configuration with server-specific settings.
 * It includes the provider for server-side rendering.
 */
const serverConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(IonicServerModule),  // Handles Ionic SSR mocks (customElements, etc.)
    provideClientHydration(
      withIncrementalHydration(),
      withHttpTransferCacheOptions({
        includePostRequests: true,
      }),
    ),
    provideServerRendering()
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);