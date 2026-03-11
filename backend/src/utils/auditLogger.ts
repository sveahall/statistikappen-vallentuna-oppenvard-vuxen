import { Pool } from "pg";

export interface AuditLogEntry {
  userId?: number;
  username: string;
  action: string;
  entityType: string;
  entityId?: number;
  entityName?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditLogger {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Kontrollera att userId finns om det skickas med
      if (entry.userId) {
        const userCheck = await this.pool.query('SELECT id FROM handlers WHERE id = $1', [entry.userId]);
        if (userCheck.rows.length === 0) {
          console.warn(`Audit logging skipped: User ID ${entry.userId} does not exist`);
          return; // Hoppa över loggningen istället för att krascha
        }
      }

      const query = `
        INSERT INTO audit_log (
          user_id, username, action, entity_type, entity_id, 
          entity_name, details, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      await this.pool.query(query, [
        entry.userId || null,
        entry.username,
        entry.action,
        entry.entityType,
        entry.entityId || null,
        entry.entityName || null,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ipAddress || null,
        entry.userAgent || null
      ]);
    } catch (error) {
      // Logga fel men krascha inte applikationen
      console.error("Fel vid audit logging:", error);
    }
  }

  // Hjälpfunktioner för vanliga actions
  async logLogin(userId: number, username: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.log({
      userId,
      username,
      action: "LOGIN",
      entityType: "user",
      entityId: userId,
      entityName: username,
      details: { event: "user_login" },
      ipAddress,
      userAgent
    });
  }

  async logLogout(userId: number, username: string): Promise<void> {
    await this.log({
      userId,
      username,
      action: "LOGOUT",
      entityType: "user",
      entityId: userId,
      entityName: username,
      details: { event: "user_logout" }
    });
  }

  async logCreate(userId: number, username: string, entityType: string, entityId: number, entityName: string, details?: any): Promise<void> {
    await this.log({
      userId,
      username,
      action: "CREATE",
      entityType,
      entityId,
      entityName,
      details: { ...details, event: "entity_created" }
    });
  }

  async logUpdate(userId: number, username: string, entityType: string, entityId: number, entityName: string, oldValues: any, newValues: any): Promise<void> {
    await this.log({
      userId,
      username,
      action: "UPDATE",
      entityType,
      entityId,
      entityName,
      details: {
        event: "entity_updated",
        old_values: oldValues,
        new_values: newValues,
        changes: this.getChanges(oldValues, newValues)
      }
    });
  }

  async logDelete(userId: number, username: string, entityType: string, entityId: number, entityName: string, deletedData?: any): Promise<void> {
    await this.log({
      userId,
      username,
      action: "DELETE",
      entityType,
      entityId,
      entityName,
      details: { ...deletedData, event: "entity_deleted" }
    });
  }

  async logExport(userId: number, username: string, exportType: string, filters?: any): Promise<void> {
    await this.log({
      userId,
      username,
      action: "EXPORT",
      entityType: "data",
      entityName: exportType,
      details: { event: "data_exported", export_type: exportType, filters }
    });
  }

  async logAccess(userId: number, username: string, resource: string, action: string): Promise<void> {
    await this.log({
      userId,
      username,
      action: "ACCESS",
      entityType: "resource",
      entityName: resource,
      details: { event: "resource_accessed", resource, access_action: action }
    });
  }

  private getChanges(oldValues: any, newValues: any): any {
    const changes: any = {};
    
    for (const key in newValues) {
      if (oldValues[key] !== newValues[key]) {
        changes[key] = {
          from: oldValues[key],
          to: newValues[key]
        };
      }
    }
    
    return changes;
  }
}

// Skapa en global instans
let globalAuditLogger: AuditLogger | null = null;

export function getAuditLogger(pool?: Pool): AuditLogger {
  if (!globalAuditLogger && pool) {
    globalAuditLogger = new AuditLogger(pool);
  }
  
  if (!globalAuditLogger) {
    throw new Error("AuditLogger not initialized. Call with pool parameter first.");
  }
  
  return globalAuditLogger;
}

export function initAuditLogger(pool: Pool): void {
  globalAuditLogger = new AuditLogger(pool);
}
