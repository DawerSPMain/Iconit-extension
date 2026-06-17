// content.js - Icon!t Engine v3.0 (normalización Unicode + fallback para Facebook)

let packs = [];

const TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]';

// --------------------------------------------------------------
// 1. MAPEO DE VARIANTES UNICODE A ASCII
// --------------------------------------------------------------
// Mapa de caracteres estilizados comunes a su letra base
const styleMap = new Map();

// Función para añadir un rango de estilo (mayúsculas y minúsculas)
function addRange(upperStart, lowerStart, offset) {
  for (let i = 0; i < 26; i++) {
    styleMap.set(String.fromCodePoint(upperStart + i), String.fromCharCode(65 + i)); // A-Z
    styleMap.set(String.fromCodePoint(lowerStart + i), String.fromCharCode(97 + i)); // a-z
  }
}

// Mathematical Alphanumeric Symbols (los más comunes)
addRange(0x1D400, 0x1D41A, 0); // Bold
addRange(0x1D434, 0x1D44E, 0); // Italic
addRange(0x1D468, 0x1D482, 0); // Bold Italic
addRange(0x1D49C, 0x1D4B6, 0); // Script
addRange(0x1D4D0, 0x1D4EA, 0); // Bold Script
addRange(0x1D504, 0x1D51E, 0); // Fraktur
addRange(0x1D538, 0x1D552, 0); // Bold Fraktur (mayúsculas)
addRange(0x1D56C, 0x1D586, 0); // Bold Fraktur (minúsculas) - realmente 1D56C es para mayúsculas, 1D586 para minúsculas
addRange(0x1D5A0, 0x1D5BA, 0); // Sans-serif
addRange(0x1D5D4, 0x1D5EE, 0); // Sans-serif bold
addRange(0x1D608, 0x1D622, 0); // Sans-serif italic
addRange(0x1D63C, 0x1D656, 0); // Sans-serif bold italic
addRange(0x1D670, 0x1D68A, 0); // Monospace

// También incluir los "mathematical bold" específicos (pueden solaparse, pero por si acaso)
addRange(0x1D5D4, 0x1D5EE, 0); // Ya están, pero reafirmamos
addRange(0x1D608, 0x1D622, 0);
addRange(0x1D63C, 0x1D656, 0);

// Añadir variantes de "doble raya" (double-struck) si aparecen
addRange(0x1D538, 0x1D552, 0); // Double-struck (mayúsculas)
addRange(0x1D552, 0x1D56C, 0); // (minúsculas) corregir

// Normalizar una cadena a ASCII
function normalizeToASCII(text) {
  let result = '';
  for (const ch of text) {
    result += styleMap.get(ch) || ch;
  }
  return result;
}

// --------------------------------------------------------------
// 2. INICIALIZACIÓN
// --------------------------------------------------------------
(async function init() {
  const result = await chrome.storage.local.get('packs');
  packs = result.packs || [];
  if (packs.length > 0) {
    processDocument();
    observeMutations();
  }
})();

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'updatePacks') {
    chrome.storage.local.get('packs', (result) => {
      packs = result.packs || [];
      processDocument();
    });
  }
});

// --------------------------------------------------------------
// 3. PROCESAMIENTO DE TEXTO MEJORADO
// --------------------------------------------------------------
function processDocument() {
  const tweetElements = document.querySelectorAll(TWEET_TEXT_SELECTOR);

  tweetElements.forEach(processTweetTextElement);
}

function processTweetTextElement(tweetElement) {
  const walker = document.createTreeWalker(
    tweetElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;

        if (!parent) {
          return NodeFilter.FILTER_REJECT;
        }

        if (
          parent.closest(
            'script, style, noscript, .icon-it-processed'
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return node.textContent.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  const nodesToProcess = [];
  let node;

  while ((node = walker.nextNode())) {
    nodesToProcess.push(node);
  }

  nodesToProcess.forEach(processTextNode);
}

function processTextNode(textNode) {
  const originalText = textNode.textContent;
  if (!originalText.trim()) return;

  // Normalizar el texto para comparación
  const normalizedText = normalizeToASCII(originalText);
  let modified = false;
  // Array de rangos a reemplazar: {start, end, replacementHTML}
  const replacements = [];

  // Recorremos los packs en orden (prioridad)
  for (const pack of packs) {
    if (!pack.words || pack.words.length === 0) continue;
    // Construir una expresión regular con todas las palabras del pack, insensible a mayúsculas
    const escapedWords = pack.words.map(w => escapeRegExp(w));
    const regex = new RegExp('\\b(' + escapedWords.join('|') + ')\\b', 'gi');
    
    // Buscar coincidencias en el texto NORMALIZADO
    let match;
    while ((match = regex.exec(normalizedText)) !== null) {
      // match.index está en el texto normalizado, pero necesitamos la posición en el original
      // Como la normalización es 1:1 (mismo número de caracteres), el índice coincide.
      const start = match.index;
      const end = start + match[0].length;
      
      // Verificar que este rango no haya sido ya reemplazado por un pack de mayor prioridad
      const overlapping = replacements.some(r => start < r.end && end > r.start);
      if (overlapping) continue;
      
      const matchedOriginal = originalText.substring(start, end);
      let iconHtml = '';
      if (pack.icon) {
        iconHtml = `<img src="${pack.icon}" class="icon-it-icon" style="height:1.2em; vertical-align:middle; margin-right:2px;">`;
      }
      const colorStyle = pack.color ? `color:${pack.color};` : '';
      const replacementHTML = `<span class="icon-it-highlight icon-it-processed" style="${colorStyle}">${iconHtml}${matchedOriginal}</span>`;
      
      replacements.push({ start, end, replacementHTML });
      modified = true;
    }
    // Si este pack ha producido modificaciones, paramos (por prioridad)
    if (modified) break;
  }

  if (modified) {
    // Ordenar reemplazos por inicio para no descuadrar índices
    replacements.sort((a, b) => a.start - b.start);
    let resultHTML = '';
    let lastIndex = 0;
    for (const rep of replacements) {
      resultHTML += escapeHTML(originalText.substring(lastIndex, rep.start));
      resultHTML += rep.replacementHTML;
      lastIndex = rep.end;
    }
    resultHTML += escapeHTML(originalText.substring(lastIndex));
    
    const fragment = document.createRange().createContextualFragment(resultHTML);
    textNode.parentNode.replaceChild(fragment, textNode);
  }
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --------------------------------------------------------------
// 4. OBSERVER FOR DYNAMIC X CONTENT
// --------------------------------------------------------------
function observeMutations() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            processSubtree(node);
          }
        });
      }
      if (mutation.type === 'characterData') {
        const parent = mutation.target.parentNode;
        if (parent && !parent.closest('.icon-it-processed')) {
          processTextNode(mutation.target);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // Fallback para sitios como Facebook que cargan contenido dinámicamente sin mutaciones claras
  setInterval(() => {
    if (packs.length > 0) {
      processDocument();
    }
  }, 2000); // revisa cada 2 segundos
}

function processSubtree(rootElement) {
  if (!(rootElement instanceof Element)) {
    return;
  }

  const tweetElements = new Set();

  const containingTweet = rootElement.closest(TWEET_TEXT_SELECTOR);

  if (containingTweet) {
    tweetElements.add(containingTweet);
  }

  if (rootElement.matches(TWEET_TEXT_SELECTOR)) {
    tweetElements.add(rootElement);
  }

  rootElement
    .querySelectorAll(TWEET_TEXT_SELECTOR)
    .forEach((tweetElement) => {
      tweetElements.add(tweetElement);
    });

  tweetElements.forEach(processTweetTextElement);
}