import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app.component';

/**
 * Server-side configuration for the Angular application.
 * This configuration merges the base application configuration with server-specific settings.
 * It includes the provider for server-side rendering.
 */
const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);

// Create and export the bootstrap function
export const bootstrap = () => bootstrapApplication(AppComponent, config);