/**
 * This script provides a mock DOM environment for Node.js, which is necessary for
 * Server-Side Rendering (SSR) and prerendering of Angular applications that use
 * browser-specific APIs, especially those with Web Components (like Ionic).
 *
 * It must be loaded before Angular's server-side code runs.
 */
import { JSDOM } from 'jsdom';

console.log('--- Loading DOM Mock for Node.js ---');

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost',
});

// The JSDOM window object
const { window } = dom;

// Copy all properties from the JSDOM window to the Node.js global object.
// This makes browser APIs like `document`, `navigator`, etc., available globally.
Object.assign(global, window);

// --- CRITICAL FIX for "customElements is not defined" ---
// The 'customElements' API is not automatically assigned by Object.assign
// because it's a complex object on the window's prototype. We must assign it explicitly.
global.customElements = window.customElements;
global.Window = window.constructor; // Also polyfill the Window constructor
global.Event = window.Event; // Polyfill Event as well, often needed with custom elements

// Further common globals that might be missing
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;


// Mock for requestAnimationFrame, often used by UI libraries
global.requestAnimationFrame = (callback) => {
  return setTimeout(callback, 0);
};

global.cancelAnimationFrame = (id) => {
  clearTimeout(id);
};

console.log('--- DOM Mock loaded successfully. `customElements` is now defined. ---');