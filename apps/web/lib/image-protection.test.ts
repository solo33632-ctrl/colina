import { describe, expect, it, vi } from 'vitest';
import {
  installImageProtection,
  isProtectedImageTarget,
  PROTECTED_IMAGE_ATTRIBUTE,
} from './image-protection';

type FakeDocument = {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
  removeEventListener: (type: string, listener: (event: Event) => void) => void;
};

/** A target whose `closest` answers exactly as a DOM element would. */
function targetInsideProtectedImage(protectedImage: boolean) {
  return {
    closest: vi.fn((selector: string) =>
      protectedImage && selector === `[${PROTECTED_IMAGE_ATTRIBUTE}]`
        ? {}
        : null
    ),
  } as unknown as EventTarget & {
    closest: (selector: string) => Element | null;
  };
}

function fakeDocument() {
  const listeners = new Map<string, Set<(event: Event) => void>>();

  const doc: FakeDocument = {
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
  };

  return { doc, listeners };
}

describe('isProtectedImageTarget', () => {
  it('accepts a target inside a protected image', () => {
    expect(isProtectedImageTarget(targetInsideProtectedImage(true))).toBe(
      true
    );
  });

  it('rejects a target outside every protected image', () => {
    expect(isProtectedImageTarget(targetInsideProtectedImage(false))).toBe(
      false
    );
  });

  it('rejects a missing target and non-elements', () => {
    expect(isProtectedImageTarget(null)).toBe(false);
    expect(isProtectedImageTarget({} as EventTarget)).toBe(false);
    expect(isProtectedImageTarget(new EventTarget())).toBe(false);
  });

  it('asks for the shared attribute, not a component-specific one', () => {
    const target = targetInsideProtectedImage(false);
    isProtectedImageTarget(target);
    expect(target.closest).toHaveBeenCalledWith(
      `[${PROTECTED_IMAGE_ATTRIBUTE}]`
    );
  });
});

describe('installImageProtection', () => {
  it('prevents dragstart and contextmenu only on protected targets', () => {
    const { doc, listeners } = fakeDocument();
    installImageProtection(doc as unknown as Document);

    const protectedTarget = targetInsideProtectedImage(true);
    const textTarget = targetInsideProtectedImage(false);

    for (const type of ['dragstart', 'contextmenu']) {
      const listener = [...listeners.get(type)!][0];

      const protectedEvent = {
        target: protectedTarget,
        preventDefault: vi.fn(),
      } as unknown as Event;
      listener(protectedEvent);
      expect(protectedEvent.preventDefault).toHaveBeenCalledTimes(1);

      const textEvent = {
        target: textTarget,
        preventDefault: vi.fn(),
      } as unknown as Event;
      listener(textEvent);
      expect(textEvent.preventDefault).not.toHaveBeenCalled();
    }
  });

  it('removes both listeners on cleanup', () => {
    const { doc, listeners } = fakeDocument();
    const cleanup = installImageProtection(doc as unknown as Document);

    expect(listeners.get('dragstart')?.size).toBe(1);
    expect(listeners.get('contextmenu')?.size).toBe(1);

    cleanup();

    expect(listeners.get('dragstart')?.size).toBe(0);
    expect(listeners.get('contextmenu')?.size).toBe(0);
  });
});
