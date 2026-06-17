import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { APP_BOOTSTRAP_LISTENER, ApplicationConfig, ErrorHandler, importProvidersFrom, inject, isDevMode, PLATFORM_ID, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { PreloadAllModules, provideRouter, Router, RouteReuseStrategy, withComponentInputBinding, withPreloading } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import * as Sentry from '@sentry/angular';
import { ENV } from '@bk2/shared-config';
import { isBrowser, httpBreadcrumbInterceptor, VersionCheckService } from '@bk2/shared-util-angular';
import { SentryContextService } from '@bk2/shared-feature';
import { PersonEditModal } from '@bk2/subject-person-feature';
import { PERSON_EDIT_MODAL } from '@bk2/subject-person-ui';
import { environment } from '../environments/environment';

import { appRoutes } from './app.routes';

// plain firebase with rxfire
import { getApp, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

// i18n with transloco
import { I18nService, TranslocoHttpLoader } from '@bk2/shared-i18n';
import { provideTransloco } from '@jsverse/transloco';
import { TranslateModule } from '@ngx-translate/core';

// Initialize Firebase. This is safe to run on the server.
try {
  initializeApp(environment.firebase);
} catch (e) {
  // This can happen with HMR, ignore "already exists" error.
  console.error('Firebase initialization error (can happen with HMR, ignore "already exists" error', e);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    { provide: ENV, useValue: environment },
    { provide: PERSON_EDIT_MODAL, useValue: PersonEditModal },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ useSetInputAPI: true, innerHTMLTemplatesEnabled: true }),
    // provideClientHydration disabled - Ionic doesn't fully support SSR hydration yet
    provideRouter(appRoutes, withComponentInputBinding(), withPreloading(PreloadAllModules)),

    importProvidersFrom(TranslateModule.forRoot()),
    provideHttpClient(withInterceptors([httpBreadcrumbInterceptor])),

    // Sentry: route uncaught Angular errors through Sentry's ErrorHandler.
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler({ showDialog: false }) },
    // Sentry: record router navigations as spans.
    { provide: Sentry.TraceService, deps: [Router] },
    provideAppInitializer(() => { inject(Sentry.TraceService); }),

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

    // this provider is to safely initialize browser-only services AFTER the app has rendered.
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (platformId: object) => {
        const versionCheck = inject(VersionCheckService);
        return () => {
          // This factory returns a function that runs after the app is bootstrapped.
          // It checks if the platform is a browser and initializes App Check.
          // This is necessary because App Check should only be initialized in the browser environment.
          if (isBrowser(platformId)) {
            if (isDevMode()) {
              // in development, set the debug token
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (<any>window).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
            }
            // Initialize App Check only on the client
            initializeAppCheck(getApp(), {
              provider: new ReCaptchaEnterpriseProvider(environment.services.appcheckRecaptchaEnterpriseKey),
              isTokenAutoRefreshEnabled: true,
            });

            // Check app version
            versionCheck.checkVersion();
          }
        };
      },
      deps: [PLATFORM_ID],
      multi: true,
    },

    // Sentry: start pushing pseudonymous user/tenant/role context after bootstrap (browser only).
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (platformId: object) => {
        const sentryContext = inject(SentryContextService);
        return () => {
          if (!isBrowser(platformId)) return;
          // touch the service so its effect is created
          void sentryContext;
        };
      },
      deps: [PLATFORM_ID],
      multi: true,
    },
  ],
};
