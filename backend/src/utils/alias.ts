import crypto from 'crypto';

/**
 * Generate a stable, per-viewer alias for a protected customer.
 * Format: ANON-XXXXXXXX (uppercase hex), deterministic based on customerId + viewerId.
 * Uses HMAC-SHA256 with ALIAS_SECRET if available, otherwise a dev fallback secret.
 */
export function generateAlias(customerId: number, viewerUserId: number): string {
  const secret = process.env.ALIAS_SECRET;
  if (!secret) {
    throw new Error('ALIAS_SECRET environment variable is required for customer privacy protection');
  }
  const h = crypto.createHmac('sha256', secret);
  h.update(`${customerId}:${viewerUserId}`);
  const digest = h.digest('hex').slice(0, 8).toUpperCase();
  return `ANON-${digest}`;
}

/**
 * Compute a safe display name for a customer row, given viewer context.
 * - If not protected: return actual initials
 * - If protected and viewer is admin or assigned: alias
 * - If protected and not assigned: 'Anonym kund'
 */
export function getSafeInitials(
  row: { id: number; initials: string; is_protected?: boolean },
  opts: { viewerId: number; viewerRole?: string; assignedCustomerIds?: Set<number> }
): string {
  const isProtected = !!row.is_protected;
  if (!isProtected) return row.initials;

  const isAdmin = (opts.viewerRole || '').toLowerCase() === 'admin';
  const isAssigned = !!opts.assignedCustomerIds?.has(row.id);
  if (isAdmin || isAssigned) {
    return generateAlias(row.id, opts.viewerId);
  }
  return 'Anonym kund';
}

/**
 * Compute safe display for a shift or case row when handler IDs are present.
 */
export function getSafeNameForCaseContext(
  row: { customer_id: number; customer_initials: string; is_protected?: boolean; handler1_id?: number | null; handler2_id?: number | null },
  opts: { viewerId: number; viewerRole?: string }
): string {
  const isProtected = !!row.is_protected;
  if (!isProtected) return row.customer_initials;
  const isAdmin = (opts.viewerRole || '').toLowerCase() === 'admin';
  const assigned = row.handler1_id === opts.viewerId || row.handler2_id === opts.viewerId;
  if (isAdmin || assigned) {
    return generateAlias(row.customer_id, opts.viewerId);
  }
  return 'Anonym kund';
}

