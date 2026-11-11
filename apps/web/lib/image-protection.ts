// Copy deterrent for public content photos (Stage 28b).
//
// This is a deterrent, not protection. It stops the browser's native image
// drag and the context menu on a marked photo; screenshots, DevTools, the
// network tab and opening an image URL directly all still work. A visible
// watermark is the only stronger option, and that is a content decision.
//
// One delegated pair of listeners on `document` serves every photo on the
// page. They call `preventDefault()` ONLY when the event target is (or is
// inside) an element carrying `data-protected-image`; text, links and every
// other element keep their normal drag/context-menu behavior. Opening the
// lightbox, the magnifier, thumbnails, swipe and keyboard navigation are
// pointer/click/keyboard flows and are untouched.
export const PROTECTED_IMAGE_ATTRIBUTE = 'data-protected-image';

const PROTECTED_IMAGE_SELECTOR = `[${PROTECTED_IMAGE_ATTRIBUTE}]`;

/**
 * Whether an event target belongs to (or sits inside) a protected photo.
 *
 * Structural rather than `instanceof Element` so the decision is testable in
 * the project's Node-environment unit tests; real DOM targets always have
 * `closest`.
 */
export function isProtectedImageTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') {
    return false;
  }
  return (target as Element).closest(PROTECTED_IMAGE_SELECTOR) !== null;
}

/**
 * Installs the delegated `dragstart`/`contextmenu` deterrent on a document
 * and returns the cleanup that removes both listeners.
 */
export function installImageProtection(doc: Document): () => void {
  const blockProtected = (event: Event) => {
    if (isProtectedImageTarget(event.target)) {
      event.preventDefault();
    }
  };

  doc.addEventListener('dragstart', blockProtected);
  doc.addEventListener('contextmenu', blockProtected);

  return () => {
    doc.removeEventListener('dragstart', blockProtected);
    doc.removeEventListener('contextmenu', blockProtected);
  };
}
