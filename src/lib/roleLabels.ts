const ROLE_LABELS: Record<string, string> = {
  handler: "Behandlare",
  admin: "Administratör",
};

export function getRoleLabel(role?: string | null): string {
  if (!role) {
    return "";
  }
  const key = role.toLowerCase();
  return ROLE_LABELS[key] ?? role;
}
