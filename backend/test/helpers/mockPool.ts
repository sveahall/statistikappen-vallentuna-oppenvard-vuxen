type Row = Record<string, any>;

export class MockPool {
  private handlers: Map<number, any> = new Map();
  private nextHandlerId = 1;
  private invites: Map<string, any> = new Map(); // key: token_hash
  private passwordResets: Map<string, any> = new Map(); // key: token_hash

  // Test assistance
  seedInvite(tokenHash: string, email: string, role: string = 'handler') {
    const id = Math.floor(Math.random() * 100000) + 1;
    this.invites.set(tokenHash, {
      id,
      email,
      role,
      status: 'pending',
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      email_verified: true,
    });
    return id;
  }

  seedPasswordReset(tokenHash: string, userId: number, email: string, name = 'Test User') {
    const id = Math.floor(Math.random() * 100000) + 1;
    this.passwordResets.set(tokenHash, {
      id,
      user_id: userId,
      email,
      name,
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      used_at: null,
    });
    return id;
  }

  seedHandler(email: string, name = 'Admin', role = 'admin', password_hash = '$2b$12$dummy') {
    const id = this.nextHandlerId++;
    const row = {
      id,
      email,
      name,
      role,
      password_hash,
      active: true,
      refresh_token: null,
      failed_login_attempts: 0,
      locked_until: null,
    };
    this.handlers.set(id, row);
    return row;
  }

  // Simple SQL router; match known patterns and operate on in-memory maps
  async query(sql: any, params: any[] = []): Promise<{ rows: Row[]; rowCount?: number }> {
    const s = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    // USERS/LOGIN: select handler by email
    if (s.includes('from handlers where email = $1')) {
      const email = params[0];
      const row = Array.from(this.handlers.values()).find((h) => h.email === email && h.active);
      return { rows: row ? [row] : [] };
    }

    // USERS/refresh: select by id and refresh_token
    if (s.includes('from handlers where id = $1 and refresh_token = $2')) {
      const [id, token] = params;
      const row = this.handlers.get(Number(id));
      if (row && row.refresh_token === token && row.active) return { rows: [row] };
      return { rows: [] };
    }

    // AUDIT: validate user exists
    if (s.startsWith('select id from handlers where id = $1')) {
      const id = params[0];
      const row = this.handlers.get(Number(id));
      return { rows: row ? [{ id: row.id }] : [] };
    }

    // USERS: update refresh token
    if (s.startsWith('update handlers set refresh_token = $1')) {
      const [token, id] = params;
      const row = this.handlers.get(Number(id));
      if (row) {
        row.refresh_token = token;
        row.failed_login_attempts = 0;
        row.locked_until = null;
      }
      return { rows: [] };
    }

    // USERS: update failed login attempts/lockout
    if (s.startsWith('update handlers set failed_login_attempts = $1')) {
      const [attempts, lockedUntil, id] = params;
      const row = this.handlers.get(Number(id));
      if (row) {
        row.failed_login_attempts = attempts;
        row.locked_until = lockedUntil;
      }
      return { rows: [] };
    }

    // USERS: select me
    if (s.includes('select id, name, email, role from handlers where id = $1')) {
      const id = params[0];
      const row = this.handlers.get(Number(id));
      return { rows: row ? [{ id: row.id, name: row.name, email: row.email, role: row.role }] : [] };
    }

    // INVITES: select by token hash and pending
    if (s.includes('from invites where token_hash') && s.includes('status')) {
      const tokenHash = params[0];
      const inv = this.invites.get(tokenHash);
      return { rows: inv ? [inv] : [] };
    }

    // INVITES: update status
    if (s.startsWith('update invites set status = $1')) {
      const [status] = params;
      // ignore; success
      return { rows: [{ id: 1 }] };
    }

    // INVITES: audit log insert
    if (s.startsWith('insert into invite_audit_log')) {
      return { rows: [], rowCount: 1 };
    }

    // HANDLERS: insert new user
    if (s.startsWith('insert into handlers')) {
      const [name, email, password_hash, role, active] = params;
      const row = this.seedHandler(email, name, role, password_hash);
      row.active = active;
      return { rows: [{ id: row.id }] };
    }

    // AUTH reset: select password_resets join handlers by token
    if (s.includes('from password_resets pr') && s.includes('join handlers h')) {
      const tokenHash = params[0];
      const pr = this.passwordResets.get(tokenHash);
      if (!pr) return { rows: [] };
      const handler = this.handlers.get(pr.user_id);
      return { rows: [{ ...pr, email: handler?.email, name: handler?.name }] };
    }

    // AUTH reset: update handlers set password_hash
    if (s.startsWith('update handlers set password_hash = $1')) {
      const [hash, id] = params;
      const row = this.handlers.get(Number(id));
      if (row) row.password_hash = hash;
      return { rows: [] };
    }

    // AUTH reset: mark token used
    if (s.startsWith('update password_resets set used_at = now()')) {
      return { rows: [] };
    }

    // AUTH reset: delete other tokens
    if (s.startsWith('delete from password_resets')) {
      return { rows: [] };
    }

    // EFFORTS list
    if (s.startsWith('select * from efforts')) {
      return { rows: [{ id: 1, name: 'Insats', available_for: 'Behovsprövad', active: true }] };
    }

    // EFFORTS create
    if (s.startsWith('insert into efforts')) {
      return { rows: [{ id: 123, name: (params as any)[0], available_for: (params as any)[1], active: true }] };
    }

    // EFFORTS activate/deactivate
    if (s.startsWith('update efforts set active = false')) {
      return { rows: [{ id: Number(params[0]), active: false }] };
    }
    if (s.startsWith('update efforts set active = true')) {
      return { rows: [{ id: Number(params[0]), active: true }] };
    }

    // EFFORTS update
    if (s.startsWith('update efforts set name = $1')) {
      return { rows: [{ id: Number(params[2]), name: params[0], available_for: params[1], active: true }] };
    }

    // EFFORTS delete
    if (s.startsWith('delete from efforts where id = $1')) {
      return { rows: [{ id: Number(params[0]) }] };
    }

    // CUSTOMERS nested endpoints
    if (s.includes('from cases') && s.includes('group by efforts.id')) {
      // /:id/efforts
      return { rows: [{ effort_id: 1, effort_name: 'Insats', start_date: '2024-01-01', handlers: ['A', 'B'] }] };
    }
    if (s.includes('from cases') && s.includes('order by cases.id desc')) {
      // /:customerId/efforts/:effortId/cases
      return { rows: [{ id: 1, date: '2024-01-01', hours: 1.5, status: 'Utförd', handler1_id: 1, handler2_id: null, handler1_name: 'H1', handler2_name: null }] };
    }

    // Default
    return { rows: [] };
  }
}

export default MockPool;
