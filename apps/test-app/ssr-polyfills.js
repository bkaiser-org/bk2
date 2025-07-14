/**
 * This file is required by the build process to polyfill browser-specific APIs
 * for the Node.js environment used during Server-Side Rendering (SSR) and prerendering.
 * It is loaded using the NODE_OPTIONS='--require ./path/to/this/file.js' environment variable.
 */
const { JSDOM } = require('jsdom');

// Guard to prevent the polyfills from being loaded multiple times in different workers.
if (global.window) {
  // The DOM has already been mocked, so we can exit.
  return;
}

console.log('--- [SSR] Loading DOM polyfills via --require ---');

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
  url: 'http://localhost',
});

const { window } = dom;

global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.customElements = window.customElements;
global.HTMLElement = window.HTMLElement;
global.Event = window.Event;
global.Node = window.Node;
global.Window = window.constructor;

global.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

console.log('--- [SSR] DOM polyfills loaded successfully. ---');