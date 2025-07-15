/**
 * This file is required by the build process to polyfill browser-specific APIs
 * for the Node.js environment used during Server-Side Rendering (SSR) and prerendering.
 * It is loaded using the NODE_OPTIONS='--require ./path/to/this/file.js' environment variable.
 */
const domino = require('domino');
const fs = require('fs');
const path = require('path');

// Guard to prevent the polyfills from being loaded multiple times in different workers.
if (global.window) {
  // The DOM has already been mocked, so we can exit.
  return;
}

console.log('--- [SSR] Loading DOM polyfills via --require using domino ---');

// Use the actual index.html as a template for a more accurate DOM.
const template = fs.readFileSync(path.join(__dirname, 'src/index.html')).toString();
const window = domino.createWindow(template);

// Assign the domino-created window and document to the global scope.
global.window = window;
global.document = window.document;

// Manually polyfill other necessary browser APIs.
global.navigator = window.navigator;
global.Event = window.Event;
global.Node = window.Node;
global.HTMLElement = window.HTMLElement;
// A mock for customElements is often needed for Web Components (like Ionic).
global.customElements = window.customElements || {
    define: (tagName, constructor) => {
        // Basic define implementation
        if (!window.customElementsRegistry) {
            window.customElementsRegistry = {};
        }
        window.customElementsRegistry[tagName] = constructor;
    },
    get: (tagName) => {
        // Basic get implementation
        return window.customElementsRegistry ? window.customElementsRegistry[tagName] : undefined;
    },
    whenDefined: () => Promise.resolve()
};

global.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.Window = window.constructor;

console.log('--- [SSR] DOM polyfills loaded successfully. ---');