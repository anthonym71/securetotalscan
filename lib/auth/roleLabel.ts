import type { SessionPayload } from "./session";

export type SessionKind = "owner" | "customer" | "access-code";

export interface SessionIdentity {
  kind: SessionKind;
  /** Short text for the dashboard badge. */
  label: string;
  email: string;
}

/**
 * Describe a session that verifySession() already accepted. Only the signed
 * payload is read, never a client-supplied value. Sessions without a role come
 * from an access code on the STS_ACCESS_CODES list.
 */
export function describeSession(session: SessionPayload): SessionIdentity {
  if (session.role === "owner") {
    return { kind: "owner", label: "Owner", email: session.email };
  }
  if (session.role === "customer") {
    return { kind: "customer", label: `Customer (${session.plan})`, email: session.email };
  }
  return { kind: "access-code", label: `Customer via access code (${session.plan})`, email: session.email };
}
