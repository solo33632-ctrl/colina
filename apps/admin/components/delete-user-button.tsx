'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';
import {
  deleteAdminUser,
  type DeleteAdminUserResult,
} from '@/lib/actions/users';
import { inputClasses } from './form-fields';
import { Icon } from './icons';

type DeleteMode = 'account' | 'account_and_audit';

/**
 * Account deletion with the two explicit modes plus the independent content
 * checkbox. Every rule shown here is re-checked by the Server Action; this
 * dialog only decides what to ask.
 */
export function DeleteUserButton({
  userId,
  email,
  machineCount,
  categoryCount,
}: {
  userId: string;
  email: string;
  machineCount: number;
  categoryCount: number;
}) {
  const t = useTranslations('Users');
  const common = useTranslations('Common');
  const locale = useLocale();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const modeName = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DeleteMode>('account');
  const [deleteContent, setDeleteContent] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DeleteAdminUserResult | null>(null);

  const needsEmail = mode === 'account_and_audit' || deleteContent;

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
      setMode('account');
      setDeleteContent(false);
      setConfirmEmail('');
      setError(null);
      setResult(null);
      if (result) {
        router.refresh();
      }
      returnFocusRef.current?.focus();
    }
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [result, router]);

  async function submit() {
    setError(null);
    setBusy(true);
    const response = await deleteAdminUser({
      id: userId,
      mode,
      deleteContent,
      confirmEmail,
    });
    setBusy(false);
    if (response.ok) {
      setResult({
        removedAuditRows: response.removedAuditRows,
        deletedMachines: response.deletedMachines,
        deletedCategories: response.deletedCategories,
        blockedCategories: response.blockedCategories,
      });
      return;
    }
    setError(
      response.error === 'email_mismatch'
        ? t('deleteDialog.emailMismatch')
        : response.error === 'self'
          ? t('deleteDialog.selfDelete')
          : response.error === 'last_admin'
            ? t('deleteDialog.lastAdmin')
            : response.error === 'protected_account'
              ? t('deleteDialog.protectedAccount')
              : response.error === 'unauthorized'
                ? common('errors.sessionExpired')
                : response.error === 'not_found'
                  ? common('errors.notFound')
                  : t('deleteDialog.failed')
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded text-sm font-medium text-red-700 hover:text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        aria-label={`${t('actions.delete')} — ${email}`}
      >
        {t('actions.delete')}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={result ? undefined : descriptionId}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-stone-200 bg-white p-6 text-start text-stone-900 shadow-xl backdrop:bg-overlay/50"
      >
        {open ? (
          result ? (
            <div>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <Icon name="check" className="h-5 w-5" />
                </span>
                <h2 id={titleId} className="pt-1 text-lg font-semibold">
                  {t('deleteDialog.resultTitle')}
                </h2>
              </div>
              <p className="mt-3 text-sm text-stone-700">
                {t('deleteDialog.resultCounts', {
                  auditRows: result.removedAuditRows,
                  machines: result.deletedMachines,
                  categories: result.deletedCategories,
                })}
              </p>
              {result.blockedCategories.length > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-900">
                    {t('deleteDialog.blockedTitle')}
                  </p>
                  <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-amber-900">
                    {result.blockedCategories.map((category) => (
                      <li key={`${category.nameEn}-${category.nameAr}`}>
                        {locale === 'ar'
                          ? category.nameAr || category.nameEn
                          : category.nameEn || category.nameAr}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-amber-800">
                    {t('deleteDialog.blockedHint')}
                  </p>
                </div>
              ) : null}
              <div className="mt-6 flex justify-end">
                <Button type="button" onClick={() => setOpen(false)}>
                  {t('deleteDialog.close')}
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
                  <Icon name="trash" className="h-5 w-5" />
                </span>
                <h2 id={titleId} className="pt-1 text-lg font-semibold">
                  {t('deleteDialog.title')}
                </h2>
              </div>
              <p id={descriptionId} className="mt-3 text-sm text-stone-600">
                {t('deleteDialog.description', { email })}
              </p>

              <fieldset className="mt-4 grid gap-3">
                <legend className="sr-only">{t('deleteDialog.title')}</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 p-3 hover:bg-stone-50">
                  <input
                    type="radio"
                    name={modeName}
                    value="account"
                    checked={mode === 'account'}
                    onChange={() => setMode('account')}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-stone-900">
                      {t('deleteDialog.modeAccount')}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-600">
                      {t('deleteDialog.modeAccountHint')}
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 p-3 hover:bg-stone-50">
                  <input
                    type="radio"
                    name={modeName}
                    value="account_and_audit"
                    checked={mode === 'account_and_audit'}
                    onChange={() => setMode('account_and_audit')}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-stone-900">
                      {t('deleteDialog.modeActivity')}
                    </span>
                    <span className="mt-0.5 block text-xs text-stone-600">
                      {t('deleteDialog.modeActivityHint')}
                    </span>
                  </span>
                </label>
              </fieldset>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 p-3 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={deleteContent}
                  onChange={(event) => setDeleteContent(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-stone-900">
                    {t('deleteDialog.deleteContent')}
                  </span>
                  <span className="mt-0.5 block text-xs text-stone-600">
                    {t('deleteDialog.deleteContentHint', {
                      machines: machineCount,
                      categories: categoryCount,
                    })}
                  </span>
                </span>
              </label>

              {needsEmail ? (
                <div className="mt-4">
                  <label
                    htmlFor="delete-user-confirm-email"
                    className="mb-1 block text-sm font-medium text-stone-700"
                  >
                    {t('deleteDialog.typeEmail', { email })}
                  </label>
                  <input
                    id="delete-user-confirm-email"
                    type="email"
                    dir="ltr"
                    autoComplete="off"
                    value={confirmEmail}
                    onChange={(event) => setConfirmEmail(event.target.value)}
                    className={inputClasses}
                    autoFocus
                  />
                </div>
              ) : null}

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
                <Button type="submit" disabled={busy}>
                  {busy ? t('deleteDialog.busy') : t('deleteDialog.confirm')}
                </Button>
              </div>
            </form>
          )
        ) : null}
      </dialog>
    </>
  );
}
