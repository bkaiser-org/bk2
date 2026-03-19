import { isPlatformBrowser } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { APP_BOOTSTRAP_LISTENER, ApplicationConfig, importProvidersFrom, inject, Injector, isDevMode, PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, RouteReuseStrategy, withComponentInputBinding } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { VersionCheckService } from '@bk2/shared-util-angular';
import { environment } from '../environments/environment';

import { appRoutes } from './app.routes';

// plain firebase with rxfire
import { initializeApp } from 'firebase/app';

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
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ useSetInputAPI: true, innerHTMLTemplatesEnabled: true }),
    // provideClientHydration disabled - Ionic doesn't fully support SSR hydration yet
    provideRouter(appRoutes, withComponentInputBinding()),

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

    // this provider is to safely initialize browser-only services AFTER the app has rendered.
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (platformId: object) => {
        const versionCheck = inject(VersionCheckService);
        return () => {
          if (!isPlatformBrowser(platformId)) return;
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
          if (isPlatformBrowser(platformId)) {
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
  ],
};
