import { isPlatformBrowser } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { APP_BOOTSTRAP_LISTENER, ApplicationConfig, importProvidersFrom, inject, isDevMode, PLATFORM_ID, provideZonelessChangeDetection } from '@angular/core';
import { PreloadAllModules, provideRouter, RouteReuseStrategy, withComponentInputBinding, withPreloading } from '@angular/router';
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
    provideRouter(appRoutes, withComponentInputBinding(), withPreloading(PreloadAllModules)),

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
          // This factory returns a function that runs after the app is bootstrapped.
          if (isPlatformBrowser(platformId)) {
            // Check app version after a short delay
            setTimeout(() => versionCheck.checkVersion(), 1000);
          }
        };
      },
      deps: [PLATFORM_ID],
      multi: true,
    },
  ],
};
