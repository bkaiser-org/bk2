/**
 * Polyfills für die serverseitige (Node.js) Umgebung.
 * Wird vor der Server-Anwendung geladen, um Browser-APIs zu simulieren,
 * die für SSR/Prerendering von Angular mit Web Components (Ionic) benötigt werden.
 */
import { JSDOM } from 'jsdom';

console.log('--- Loading Server-Side DOM Polyfills into main.server.ts ---');

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost',
});

const { window } = dom;

Object.keys(window).forEach(key => {
  if (typeof (global as any)[key] === 'undefined' && key !== 'global' && key !== 'process') {
    (global as any)[key] = (window as any)[key];
  }
});

(global as any).window = window;
(global as any).document = window.document;
(global as any).navigator = window.navigator;
(global as any).customElements = window.customElements;
(global as any).HTMLElement = window.HTMLElement;
(global as any).Event = window.Event;
(global as any).Node = window.Node;
(global as any).Window = window.constructor;

(global as any).requestAnimationFrame = (callback: FrameRequestCallback): number => {
  return setTimeout(() => callback(Date.now()), 0) as any;
};

(global as any).cancelAnimationFrame = (id: number) => {
  clearTimeout(id);
};

/***************************************************************************************************
 * zone.js/node is a special version of Zone.js specifically for Node.js environments (like for SSR and pre-rendering).
 * It patches Node.js-specific asynchronous APIs.
 ***************************************************************************************************/
import 'zone.js/node';


import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

const bootstrap = () => bootstrapApplication(AppComponent, config);

export default bootstrap;