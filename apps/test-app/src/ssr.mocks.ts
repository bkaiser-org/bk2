/**
 * Polyfills für die serverseitige (Node.js) Umgebung.
 * Wird vor der Server-Anwendung geladen, um Browser-APIs zu simulieren,
 * die für SSR/Prerendering von Angular mit Web Components (Ionic) benötigt werden.
 */
// WICHTIG: 'zone.js/node' hier nicht importieren. Es wird in `main.server.ts` importiert,
// NACHDEM diese Mocks eingerichtet wurden.
import { JSDOM } from 'jsdom';

console.log('--- Loading Server-Side DOM Polyfills ---');

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost',
});

// Das JSDOM-Fensterobjekt
const { window } = dom;

// Kopieren Sie alle Eigenschaften aus dem JSDOM-Fenster in das globale Node.js-Objekt.
// Dies macht Browser-APIs wie `document`, `navigator` usw. global verfügbar.
// Wir müssen sicherstellen, dass wir keine zirkulären Referenzen kopieren.
Object.keys(window).forEach(key => {
  if (typeof (global as any)[key] === 'undefined' && key !== 'global' && key !== 'process') {
    (global as any)[key] = (window as any)[key];
  }
});

// Explizite Zuweisung für kritische APIs, die möglicherweise nicht korrekt kopiert werden.
(global as any).window = window;
(global as any).document = window.document;
(global as any).navigator = window.navigator;
(global as any).customElements = window.customElements;
(global as any).HTMLElement = window.HTMLElement;
(global as any).Event = window.Event;
(global as any).Node = window.Node;
(global as any).Window = window.constructor;

// Mock für requestAnimationFrame, der oft von UI-Bibliotheken für Animationen verwendet wird.
(global as any).requestAnimationFrame = (callback: FrameRequestCallback): number => {
  return setTimeout(() => callback(Date.now()), 0) as any;
};

(global as any).cancelAnimationFrame = (id: number) => {
  clearTimeout(id);
};

console.log('--- Server-Side DOM Polyfills loaded successfully. ---');