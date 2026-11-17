'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';
import { resetEditorPassword } from '@/lib/actions/users';
import { ADMIN_PASSWORD_MIN_LENGTH } from '@/lib/schemas';
import { inputClasses } from './form-fields';

/**
 * Per-row password reset. The new password is sent to the Server Action and
 * never rendered back or stored anywhere in the page.
 */
export function ResetPasswordButton({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const t = useTranslations('Users');
  const common = useTranslations('Common');
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    function handleClose() {
      setOpen(false);
      setPassword('');
      setError(null);
      setSuccess(false);
      router.refresh();
      returnFocusRef.current?.focus();
    }
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [router]);

  async function submit() {
    setError(null);
    setBusy(true);
    const result = await resetEditorPassword({ id: userId, password });
    setBusy(false);
    if (result.ok) {
      setPassword('');
      setSuccess(true);
      return;
    }
    if (result.error === 'validation_failed' && result.issues?.[0]) {
      setError(result.issues[0].message);
      return;
    }
    setError(
      result.error === 'unauthorized'
        ? common('errors.sessionExpired')
        : result.error === 'not_found'
          ? common('errors.notFound')
          : result.error === 'protected_account'
            ? t('deleteDialog.protectedAccount')
            : t('resetDialog.failed')
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        aria-label={t('actions.reset') + ` — ${email}`}
      >
        {t('actions.reset')}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-stone-200 bg-white p-6 text-start text-stone-900 shadow-xl backdrop:bg-overlay/50"
      >
        {open ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <h2 id={titleId} className="text-lg font-semibold">
              {t('resetDialog.title')}
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              {t('resetDialog.description', { email })}
            </p>

            {success ? (
              <>
                <p
                  role="status"
                  className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-900"
                >
                  {t('resetDialog.success')}
                </p>
                <div className="mt-6 flex justify-end">
                  <Button type="button" onClick={() => setOpen(false)}>
                    {common('close')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4">
                  <label
                    htmlFor="reset-password"
                    className="mb-1 block text-sm font-medium text-stone-700"
                  >
                    {t('resetDialog.password')}
                  </label>
                  <input
                    id="reset-password"
                    type="password"
                    dir="ltr"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={inputClasses}
                    autoFocus
                  />
                  <p className="mt-1 text-xs text-stone-500">
                    {t('resetDialog.passwordHint', {
                      min: ADMIN_PASSWORD_MIN_LENGTH,
                    })}
                  </p>
                </div>
                {error ? (
                  <p
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
                    onClick={() => setOpen(false)}
                  >
                    {common('cancel')}
                  </Button>
                  <Button type="submit" disabled={busy || password === ''}>
                    {busy ? t('resetDialog.busy') : t('resetDialog.confirm')}
                  </Button>
                </div>
              </>
            )}
          </form>
        ) : null}
      </dialog>
    </>
  );
}
