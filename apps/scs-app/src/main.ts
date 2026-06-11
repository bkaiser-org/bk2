import { bootstrapApplication } from '@angular/platform-browser';
import { BkRoot } from './app/bk-root';
import { appConfig } from './app/app.config';
import { getApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from 'firebase/app-check';
import { environment } from './environments/environment';

// Initialize App Check and wait for token BEFORE bootstrapping the app
async function initializeApp() {
  if (typeof window !== 'undefined') {
    // Only use debug token in development (NOT in production)
    if (!environment.production) {
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
      if (!environment.production) {
        console.warn('App Check token failed in development - continuing anyway.');
        console.warn('To fix: Copy the debug token from console and add it in Firebase Console → App Check → Manage debug tokens');
      } else {
        console.error('App Check token failed:', error);
      }
      // Continue bootstrapping even if App Check fails
    }
  }

  // Bootstrap the app after App Check initialization (even if it failed)
  bootstrapApplication(BkRoot, appConfig).catch(err => console.error(err));
}

initializeApp();

// firebase-messaging-sw.js is auto-registered by the Firebase Messaging SDK at scope
// /firebase-cloud-messaging-push-scope/ on the first getToken() call inside FcmService.
// No manual registration here — leaving root scope (/) free for ngsw-worker.js (see
// docs/16_spec-pwa-caching.md §5.1).