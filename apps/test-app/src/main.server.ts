import '../dom.mock.js'; // IMPORTANT: Must be the first import

/***************************************************************************************************
 * Zone.js wird von Angular für die Change Detection benötigt (für SSR).
 * Es muss importiert werden, NACHDEM der DOM-Mock vorhanden ist.
 ***************************************************************************************************/
import 'zone.js/node';

import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

const bootstrap = () => bootstrapApplication(AppComponent, config);

export default bootstrap;