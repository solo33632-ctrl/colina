import { z } from 'zod';

// Shared lead-form validation. The RULES (min lengths, email format) live
// here exactly once: client forms inject translated messages, API routes
// inject generic English ones. Neither side may restate the rules — that
// is how client checks and server enforcement stay unable to drift apart.

// Honeypot field name, shared by forms (which render it) and routes
// (which inspect it before validation).
export const HONEYPOT_FIELD = 'website';

export type ContactFieldMessages = {
  name: string;
  email: string;
  phone: string;
  message: string;
};

export function contactInputSchema(messages: ContactFieldMessages) {
  return z.object({
    name: z.string().min(2, { error: messages.name }),
    email: z.email({ error: messages.email }),
    phone: z.string().min(6, { error: messages.phone }),
    message: z.string().min(10, { error: messages.message }),
    website: z.string().optional(),
  });
}

export type ContactInput = z.infer<ReturnType<typeof contactInputSchema>>;

export type MaintenanceFieldMessages = ContactFieldMessages & {
  // company / machineModel are free-text optionals: no message needed.
};

export function maintenanceRequestInputSchema(
  messages: MaintenanceFieldMessages
) {
  return z.object({
    name: z.string().min(2, { error: messages.name }),
    company: z.string().optional(),
    phone: z.string().min(6, { error: messages.phone }),
    // Optional email: empty (or absent) passes, anything else must be a
    // valid address. The message lives on the inner email schema because
    // a failed union surfaces the branch issue, not the union-level error.
    email: z
      .union([z.literal(''), z.email({ error: messages.email })], {
        error: messages.email,
      })
      .optional(),
    machineModel: z.string().optional(),
    message: z.string().min(10, { error: messages.message }),
    website: z.string().optional(),
  });
}

export type MaintenanceRequestInput = z.infer<
  ReturnType<typeof maintenanceRequestInputSchema>
>;
