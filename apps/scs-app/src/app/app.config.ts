import { provideHttpClient } from '@angular/common/http';
import { APP_BOOTSTRAP_LISTENER, ApplicationConfig, importProvidersFrom, inject, Injector, isDevMode, PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideServiceWorker } from '@angular/service-worker';

import { ENV } from '@bk2/shared-config';
import { isBrowser, VersionCheckService } from '@bk2/shared-util-angular';
import { GroupEditModal } from '@bk2/subject-group-feature';
import { GROUP_EDIT_MODAL } from '@bk2/subject-group-ui';
import { PersonEditModal } from '@bk2/subject-person-feature';
import { PERSON_EDIT_MODAL } from '@bk2/subject-person-ui';
import { AnalyticsLoaderService } from '@bk2/consent-data-access';
import { environment } from '../environments/environment';

import { appRoutes } from './app.routes';

// plain firebase with rxfire
import { initializeApp } from 'firebase/app';

// i18n with transloco
import { APP_STORE_MIN, I18nOverrideService } from '@bk2/shared-data-access';
import { I18nService, TranslocoHttpLoader } from '@bk2/shared-i18n';
import { AppStore } from '@bk2/shared-feature';
import { provideTransloco } from '@jsverse/transloco';
import { TranslateModule } from '@ngx-translate/core';

// Initialize Firebase. This is safe to run on the server.
try {
  initializeApp(environment.firebase);
} catch (e) {
  // This can happen with HMR, ignore "already exists" error.
  console.error('Firebase initialization error (can happen with HMR, ignore "already exists" error', e);
}

// One-time cleanup of the stale root-scope FCM service worker registration.
// Older builds eagerly registered firebase-messaging-sw.js at scope '/', which now
// blocks ngsw from owning the root scope. This unregisters only that root-scoped FCM
// worker; the FCM SDK re-registers it under /firebase-cloud-messaging-push-scope/ on
// the next getToken() call. See docs/16_spec-pwa-caching.md §5.1.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs
      .filter(r => r.active?.scriptURL.endsWith('/firebase-messaging-sw.js') && r.scope.endsWith('/'))
      .forEach(r => r.unregister());
  }).catch(() => { /* ignore — cleanup is best-effort */ });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    { provide: ENV, useValue: environment },
    { provide: GROUP_EDIT_MODAL, useValue: GroupEditModal },
    { provide: PERSON_EDIT_MODAL, useValue: PersonEditModal },
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ useSetInputAPI: true, innerHTMLTemplatesEnabled: true }),
    // provideClientHydration disabled - Ionic doesn't fully support SSR hydration yet
    provideRouter(appRoutes, withComponentInputBinding()),

    // Register the Angular service worker (ngsw) to cache the app shell + static assets.
    // Deferred until the app is stable (or 30 s) so it stays off the critical path with
    // Matrix init (10 s deferred) and Analytics. The SSR guard keeps the registrar's
    // lifecycle code off the server render path. See docs/16_spec-pwa-caching.md §4.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && typeof window !== 'undefined',
      registrationStrategy: 'registerWhenStable:30000',
      scope: '/',
    }),

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
    { provide: APP_STORE_MIN, useExisting: AppStore },

    // Initialize I18n tenant overrides after the app has bootstrapped.
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (platformId: object) => {
        const overrideService = inject(I18nOverrideService);
        return () => {
          if (!isBrowser(platformId)) return;
          overrideService.init();
        };
      },
      deps: [PLATFORM_ID],
      multi: true,
    },

    // this provider is to safely initialize browser-only services AFTER the app has rendered.
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (platformId: object) => {
        const versionCheck = inject(VersionCheckService);
        return () => {
          if (!isBrowser(platformId)) return;
          // AppCheck is initialized in main.ts before bootstrapping — do not re-initialize here.
          versionCheck.checkVersion();
        };
      },
      deps: [PLATFORM_ID],
      multi: true,
    },

    // Initialize Matrix chat early (non-blocking, after user authentication).
    // Dynamic import ensures matrix-js-sdk is NOT in the initial bundle.
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (platformId: object, injector: Injector) => {
        return () => {
          if (isBrowser(platformId)) {
            // Skip Matrix init on public routes — matrix-js-sdk is ~700KB and not needed there.
            if (window.location.pathname.startsWith('/public')) return;
            // Delay Matrix init so the app renders and loads critical resources first.
            // matrix-js-sdk opens a long-poll sync connection that competes with startup traffic.
            setTimeout(async () => {
              const { MatrixInitializationService } = await import('@bk2/chat-feature');
              const service = injector.get(MatrixInitializationService);
              service.startEarlyInitialization();
            }, 10000);
          }
        };
      },
      deps: [PLATFORM_ID, Injector],
      multi: true,
    },

    // Initialize Analytics only after consent is granted.
    // firebase/analytics is NOT in the initial bundle — lazily imported by AnalyticsLoaderService.
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (platformId: object, injector: Injector) => {
        return () => {
          if (isBrowser(platformId)) {
            injector.get(AnalyticsLoaderService).init();
          }
        };
      },
      deps: [PLATFORM_ID, Injector],
      multi: true,
    },
  ],
};
