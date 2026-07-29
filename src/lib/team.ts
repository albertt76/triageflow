/**
 * The support team a ticket can be assigned to. TechFlow's support team is four
 * people (Jordan is the signed-in specialist).
 *
 * Assignment is app-managed workflow state — it is not in the source CSV, so
 * seeded tickets start unassigned rather than having owners invented for them.
 */
export const TEAM = ["Jordan", "Priya", "Marcus", "Dana"] as const;

export type TeamMember = (typeof TEAM)[number];

export function isTeamMember(value: string | null): value is TeamMember {
  return value != null && (TEAM as readonly string[]).includes(value);
}
