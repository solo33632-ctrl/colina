import type { AdminSession } from './admin-action';

/**
 * The actor columns every audit write records.
 *
 * `adminUserId` is the live link; the two snapshots are what the audit log
 * displays after that account is deleted (the FK becomes NULL). Built in one
 * place so a new action cannot write half an actor by accident.
 */
export type AuditActor = {
  adminUserId: string;
  actorEmail: string;
  actorName: string | null;
};

export function auditActor(session: AdminSession): AuditActor {
  return {
    adminUserId: session.user.id,
    actorEmail: session.user.email,
    actorName: session.user.name,
  };
}
