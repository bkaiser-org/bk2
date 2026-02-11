import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { IonicServerModule } from '@ionic/angular-server';
import { appConfig } from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    IonicServerModule
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
