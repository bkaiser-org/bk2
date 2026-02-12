import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check';
import { environment } from './environments/environment';
import { isDevMode } from '@angular/core';

// Initialize App Check and wait for token BEFORE bootstrapping the app
async function initializeApp() {
  if (typeof window !== 'undefined') {
    if (isDevMode()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (<any>window).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    
    const appCheck = initializeAppCheck(getApp(), {
      provider: new ReCaptchaEnterpriseProvider(environment.services.appcheckRecaptchaEnterpriseKey),
      isTokenAutoRefreshEnabled: true,
    });

    // Wait for App Check token to be ready
    try {
      await getToken(appCheck);
      console.log('App Check token ready');
    } catch (error) {
      console.warn('App Check token failed - continuing anyway. Add domain to reCAPTCHA Enterprise and Firebase Auth authorized domains:', error);
      // Continue bootstrapping even if App Check fails
      // In production, you might want to show an error message instead
    }
  }

  // Bootstrap the app after App Check initialization (even if it failed)
  bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
}

initializeApp();

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/firebase-messaging-sw.js')
    .then(registration => {
      console.log('Service Worker registered:', registration);
    })
    .catch(error => {
      console.error('Service Worker registration failed:', error);
    });
}