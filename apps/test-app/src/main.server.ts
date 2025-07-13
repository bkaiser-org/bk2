/***************************************************************************************************
 * BROWSER-POLYFILLS FÜR DIE NODE.JS-UMGEBUNG
 *
 * Diese müssen als ALLERERSTES importiert werden, damit globale Objekte wie `window`,
 * `document` und `customElements` für den SSR/Prerender-Prozess verfügbar sind.
 ***************************************************************************************************/
import './ssr.mocks';

/***************************************************************************************************
 * Zone.js für den Server
 *
 * Muss NACH den DOM-Polyfills importiert werden.
 ***************************************************************************************************/
import 'zone.js/node';


import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

const bootstrap = () => bootstrapApplication(AppComponent, config);

export default bootstrap;