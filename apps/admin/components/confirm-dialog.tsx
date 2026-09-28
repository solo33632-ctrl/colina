'use client';

import { useEffect, useId, useRef } from 'react';
import type { MouseEvent } from 'react';
import { Button } from '@colina/ui';
import { Icon } from './icons';

// Confirmation dialog for destructive actions, built on the native
// `<dialog>` element: no dependency, and the platform already does the parts
// that are easy to get wrong — `showModal()` moves the dialog into the top
// layer, traps focus inside it, makes the rest of the page inert, and closes
// on Escape.
//
// Two things the platform does not do, handled here:
//   - Backdrop click. The dialog is a box floating over the page, so a click
//     that lands outside its border box arrives as a click on the dialog
//     element itself; the coordinates are what tell the two apart.
//   - Focus return. The element focused when the dialog opened is remembered
//     and focused again on close, so keyboard users are not dropped at the top
//     of the document.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy = false,
  busyLabel,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  /** Shown on the confirm button while the action is running. */
  busyLabel?: string;
  /** Failure to report inside the dialog, e.g. a blocked delete. */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const messageId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open) {
      if (!dialog.open) {
        returnFocusRef.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        dialog.showModal();
      }
      return;
    }
    if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Runs on every close, whether from Escape, the backdrop or the buttons.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    function handleClose() {
      onClose();
      returnFocusRef.current?.focus();
    }
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) {
      return;
    }
    const box = dialog.getBoundingClientRect();
    const outside =
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom;
    if (outside) {
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={error ? undefined : messageId}
      onClick={handleBackdropClick}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-stone-200 bg-white p-6 text-start text-stone-900 shadow-xl backdrop:bg-stone-900/50"
    >
      {/* Rendered only while open: a list puts one of these on every row, and
          a closed <dialog> is display:none, so its text would sit in the DOM
          as markup nothing can reach — dead weight in the payload and a second
          match for any text lookup on the page. */}
      {open ? (
        <>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
              <Icon name="trash" className="h-5 w-5" />
            </span>
            <h2 id={titleId} className="pt-1 text-lg font-semibold">
              {title}
            </h2>
          </div>
          <p id={messageId} className="mt-3 text-sm text-stone-600">
            {message}
          </p>
          {error ? (
            <p
              id={errorId}
              role="alert"
              className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              autoFocus
            >
              {cancelLabel}
            </Button>
            <Button type="button" onClick={onConfirm} disabled={busy}>
              {busy && busyLabel ? busyLabel : confirmLabel}
            </Button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
