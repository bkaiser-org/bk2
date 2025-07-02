import { APP_BOOTSTRAP_LISTENER, ApplicationConfig, importProvidersFrom, isDevMode, PLATFORM_ID, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { PreloadAllModules, RouteReuseStrategy, provideRouter, withComponentInputBinding, withEnabledBlockingInitialNavigation, withPreloading } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { appRoutes } from './app.routes';

// plain firebase with rxfire
import { getApp, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

import { ENV } from '@bk2/shared/config';
import { environment } from '../environments/environment';

// i18n with transloco
import { provideTransloco } from '@jsverse/transloco';
import { TranslateModule } from '@ngx-translate/core';
import { I18nService, TranslocoHttpLoader } from '@bk2/shared/i18n';

// Initialize Firebase. This is safe to run on the server.
try {
  initializeApp(environment.firebase);
} catch (e) {
  // This can happen with HMR, ignore "already exists" error.
  console.error('Firebase initialization error (can happen with HMR, ignore "already exists" error', e);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    { provide: ENV, useValue: environment },
    provideAnimations(),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ useSetInputAPI: true }),
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withPreloading(PreloadAllModules),
      withEnabledBlockingInitialNavigation()
    ),

    importProvidersFrom(TranslateModule.forRoot()),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: ['en', 'de', 'fr', 'es', 'it'],
        defaultLang: 'de',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    I18nService,

    // this provider is to safely initializes browser-only services AFTER the app has rendered.
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (platformId: object) => {
        return () => {
          // This factory returns a function that runs after the app is bootstrapped.
          // It checks if the platform is a browser and initializes App Check.
          // This is necessary because App Check should only be initialized in the browser environment.
          if (isPlatformBrowser(platformId)) {
            if (isDevMode()) {
              // in development, set the debug token
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (<any>window).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
            }
            // Initialize App Check only on the client
            initializeAppCheck(getApp(), {
              provider: new ReCaptchaEnterpriseProvider(
                environment.services.appcheckRecaptchaEnterpriseKey
              ),
              isTokenAutoRefreshEnabled: true,
            });

          }
        };
      },
      deps: [PLATFORM_ID],
      multi: true,
    },
  ],
};
