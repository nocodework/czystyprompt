// CzystyPrompt — pseudonimizacja polskich danych osobowych przed wysłaniem tekstu do AI.
// Wszystko działa lokalnie, bez sieci.
export { Session, DEFAULT_OPTIONS, parseTerms, sensitiveWarnings } from './session.js';
export { CATEGORIES, detectStructured, validPesel, validNip, validRegon, validIban, validIdCard } from './detectors.js';
export { paradigm, CASES } from './declension.js';
export { parseList, detectPeople } from './people.js';
export { detectTable, columnTag } from './table.js';
export const VERSION = '0.2.0';
