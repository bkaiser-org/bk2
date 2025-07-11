/**
 * This script is preloaded using Node's --require flag
 * to set up a global JSDOM environment before the Angular build process starts.
 * This version (v7) performs a comprehensive copy while explicitly preventing
 * the cyclic references that cause the "Cyclic __proto__ value" error.
 */
const { JSDOM } = require('jsdom');

console.log('--- [SSR Preload] Initializing JSDOM Mock (v7 - Cycle Prevention) ---');

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost',
});

const g = global;

// Eine Liste von Eigenschaften, die bekanntermaßen Zyklen verursachen.
// Diese werden wir überspringen.
const propertiesToSkip = new Set(['window', 'self', 'top', 'parent']);

// Kopiere dynamisch alle Eigenschaften, außer den problematischen.
Object.getOwnPropertyNames(dom.window)
  .filter(prop => typeof g[prop] === 'undefined' && !propertiesToSkip.has(prop))
  .forEach(prop => {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(dom.window, prop);
      if (descriptor) {
        Object.defineProperty(g, prop, descriptor);
      }
    } catch (e) {
      console.warn(`Skipping property ${prop} due to error:`, e.message);
    }
  });

// Der entscheidende Schritt: Setze `window` manuell auf das globale Objekt,
// um das Browser-Verhalten korrekt nachzuahmen, OHNE den Zyklus von JSDOM einzuführen.
g.window = g;

// Mock für `whenDefined`, falls es benötigt wird.
if (g.customElements && !g.customElements.whenDefined) {
  g.customElements.whenDefined = (name) => Promise.resolve();
}

console.log('--- [SSR Preload] JSDOM Mock Initialized (v7 - Cycle Prevention) ---');