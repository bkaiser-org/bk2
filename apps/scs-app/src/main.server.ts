import { bootstrapApplication } from '@angular/platform-browser';
import { BkRoot } from './app/bk-root';
import { config } from './app/app.config.server';

const bootstrap = () => bootstrapApplication(BkRoot, config);

export default bootstrap;
