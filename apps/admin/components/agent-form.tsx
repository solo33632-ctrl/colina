'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { createAgent, updateAgent } from '@/lib/actions/agents';
import { agentInputSchema, type AgentInput } from '@/lib/schemas';

type AgentFormProps = {
  mode: 'create' | 'edit';
  agentId?: string;
  defaultValues?: AgentInput;
};

const MESSAGES = {
  countryAr: 'Arabic country must be at least 2 characters.',
  countryEn: 'English country must be at least 2 characters.',
};

export function AgentForm({ mode, agentId, defaultValues }: AgentFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => agentInputSchema(MESSAGES), []);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AgentInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      countryAr: '',
      countryEn: '',
      cityAr: '',
      cityEn: '',
      addressAr: '',
      addressEn: '',
      phone: '',
      email: '',
    },
  });

  async function onSubmit(values: AgentInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createAgent(values)
        : await updateAgent(agentId ?? '', values);
    if (result.ok) {
      router.push('/agents');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        setError(issue.field as keyof AgentInput, {
          message: issue.message,
        });
      }
      return;
    }
    setFormError(
      result.error === 'unauthorized'
        ? 'Your session expired. Log in again.'
        : 'Saving failed. Try again.'
    );
  }

  return (
    <Card title={mode === 'create' ? 'New agent' : 'Edit agent'}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-4 grid gap-5 text-start"
      >
        <Field
          id="agent-country-en"
          label="Country (English)"
          error={errors.countryEn?.message}
        >
          <input
            id="agent-country-en"
            type="text"
            className={inputClasses}
            {...register('countryEn')}
          />
        </Field>
        <Field
          id="agent-country-ar"
          label="Country (Arabic)"
          error={errors.countryAr?.message}
        >
          <input
            id="agent-country-ar"
            type="text"
            dir="auto"
            className={inputClasses}
            {...register('countryAr')}
          />
        </Field>
        <Field id="agent-city-en" label="City (English, optional)">
          <input
            id="agent-city-en"
            type="text"
            className={inputClasses}
            {...register('cityEn')}
          />
        </Field>
        <Field id="agent-city-ar" label="City (Arabic, optional)">
          <input
            id="agent-city-ar"
            type="text"
            dir="auto"
            className={inputClasses}
            {...register('cityAr')}
          />
        </Field>
        <Field id="agent-address-en" label="Address (English, optional)">
          <input
            id="agent-address-en"
            type="text"
            className={inputClasses}
            {...register('addressEn')}
          />
        </Field>
        <Field id="agent-address-ar" label="Address (Arabic, optional)">
          <input
            id="agent-address-ar"
            type="text"
            dir="auto"
            className={inputClasses}
            {...register('addressAr')}
          />
        </Field>
        <Field id="agent-phone" label="Phone (optional)">
          <input
            id="agent-phone"
            type="tel"
            autoComplete="tel"
            className={inputClasses}
            {...register('phone')}
          />
        </Field>
        <Field id="agent-email" label="Email (optional)">
          <input
            id="agent-email"
            type="email"
            autoComplete="email"
            className={inputClasses}
            {...register('email')}
          />
        </Field>
        {formError ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {formError}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {mode === 'create' ? 'Create agent' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
