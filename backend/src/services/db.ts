import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';

// Interface Definitions
export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  role: 'admin' | 'sales' | 'service';
  created_at: string;
}

export interface Report {
  id: string;
  spk_number: string;
  buyer_name?: string;
  phone?: string;
  address?: string;
  date: string;
  motor?: string;
  type?: string;
  color?: string;
  dp?: number;
  price?: number;
  payment_method?: string;
  user_email: string;
  user_name: string;
  user_role: 'sales' | 'service';
  status: 'pending' | 'completed' | 'failed';
  drive_folder_id?: string;
  drive_folder_link?: string;
  spk_link?: string;
  ktp_link?: string;
  noka_link?: string;
  nosin_link?: string;
  pembayaran_link?: string;
  unit_link?: string;
  ocr_confidence?: number;
  ocr_status?: 'success' | 'failed' | 'low_confidence';
  upload_time?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_email: string;
  user_name: string;
  action: 'login' | 'logout' | 'upload_start' | 'upload_success' | 'upload_failed' | 'edit' | 'delete' | 'export' | 'retry';
  details: string;
  created_at: string;
}

// Database Service Interface
export interface IDatabase {
  // Users
  getUser(email: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUser(email: string, data: Partial<User>): Promise<User>;
  listUsers(): Promise<User[]>;

  // Reports
  getReportBySpk(spk: string): Promise<Report | null>;
  createReport(report: Report): Promise<Report>;
  updateReport(spk: string, data: Partial<Report>): Promise<Report>;
  deleteReport(spk: string): Promise<boolean>;
  listReports(): Promise<Report[]>;

  // Audit Logs
  createAuditLog(log: Omit<AuditLog, 'id' | 'created_at'>): Promise<AuditLog>;
  listAuditLogs(): Promise<AuditLog[]>;
}

// ==========================================
// 1. LOCAL JSON FILE DATABASE IMPLEMENTATION
// ==========================================
class LocalDatabase implements IDatabase {
  private dataDir: string;
  private usersFile: string;
  private reportsFile: string;
  private logsFile: string;

  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.usersFile = path.join(this.dataDir, 'users.json');
    this.reportsFile = path.join(this.dataDir, 'reports.json');
    this.logsFile = path.join(this.dataDir, 'audit_logs.json');

    this.initFile(this.usersFile, '[]');
    this.initFile(this.reportsFile, '[]');
    this.initFile(this.logsFile, '[]');
  }

  private initFile(filePath: string, defaultContent: string) {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, defaultContent, 'utf-8');
    }
  }

  private async readData<T>(filePath: string): Promise<T[]> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private async writeData<T>(filePath: string, data: T[]): Promise<void> {
    const tempFile = `${filePath}.tmp`;
    await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    await fs.promises.rename(tempFile, filePath);
  }

  async getUser(email: string): Promise<User | null> {
    const users = await this.readData<User>(this.usersFile);
    return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async createUser(user: User): Promise<User> {
    const users = await this.readData<User>(this.usersFile);
    users.push(user);
    await this.writeData(this.usersFile, users);
    return user;
  }

  async updateUser(email: string, data: Partial<User>): Promise<User> {
    const users = await this.readData<User>(this.usersFile);
    const idx = users.findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) throw new Error('User not found');
    users[idx] = { ...users[idx], ...data };
    await this.writeData(this.usersFile, users);
    return users[idx];
  }

  async listUsers(): Promise<User[]> {
    return this.readData<User>(this.usersFile);
  }

  async getReportBySpk(spk: string): Promise<Report | null> {
    const reports = await this.readData<Report>(this.reportsFile);
    return reports.find((r) => r.spk_number === spk) || null;
  }

  async createReport(report: Report): Promise<Report> {
    const reports = await this.readData<Report>(this.reportsFile);
    // Double check uniqueness
    if (reports.some(r => r.spk_number === report.spk_number)) {
      throw new Error(`Report with SPK ${report.spk_number} already exists.`);
    }
    reports.push(report);
    await this.writeData(this.reportsFile, reports);
    return report;
  }

  async updateReport(spk: string, data: Partial<Report>): Promise<Report> {
    const reports = await this.readData<Report>(this.reportsFile);
    const idx = reports.findIndex((r) => r.spk_number === spk);
    if (idx === -1) throw new Error('Report not found');
    reports[idx] = { ...reports[idx], ...data } as Report;
    await this.writeData(this.reportsFile, reports);
    return reports[idx];
  }

  async deleteReport(spk: string): Promise<boolean> {
    const reports = await this.readData<Report>(this.reportsFile);
    const filtered = reports.filter((r) => r.spk_number !== spk);
    if (filtered.length === reports.length) return false;
    await this.writeData(this.reportsFile, filtered);
    return true;
  }

  async listReports(): Promise<Report[]> {
    return this.readData<Report>(this.reportsFile);
  }

  async createAuditLog(log: Omit<AuditLog, 'id' | 'created_at'>): Promise<AuditLog> {
    const logs = await this.readData<AuditLog>(this.logsFile);
    const newLog: AuditLog = {
      id: Math.random().toString(36).substr(2, 9),
      ...log,
      created_at: new Date().toISOString(),
    };
    logs.push(newLog);
    await this.writeData(this.logsFile, logs);
    return newLog;
  }

  async listAuditLogs(): Promise<AuditLog[]> {
    return this.readData<AuditLog>(this.logsFile);
  }
}

// ==========================================
// 2. SUPABASE POSTGRESQL IMPLEMENTATION
// ==========================================
class SupabaseDatabase implements IDatabase {
  private client;

  constructor() {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_KEY || '';
    if (!url || !key) {
      throw new Error('Supabase URL and Key are required in environment variables when DB_TYPE=supabase.');
    }
    this.client = createClient(url, key);
  }

  async getUser(email: string): Promise<User | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async createUser(user: User): Promise<User> {
    const { data, error } = await this.client
      .from('users')
      .insert({ ...user, email: user.email.toLowerCase() })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateUser(email: string, data: Partial<User>): Promise<User> {
    const { data: updated, error } = await this.client
      .from('users')
      .update(data)
      .eq('email', email.toLowerCase())
      .select()
      .single();
    if (error) throw error;
    return updated;
  }

  async listUsers(): Promise<User[]> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async getReportBySpk(spk: string): Promise<Report | null> {
    const { data, error } = await this.client
      .from('reports')
      .select('*')
      .eq('spk_number', spk)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async createReport(report: Report): Promise<Report> {
    const { data, error } = await this.client
      .from('reports')
      .insert(report)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateReport(spk: string, data: Partial<Report>): Promise<Report> {
    const { data: updated, error } = await this.client
      .from('reports')
      .update(data)
      .eq('spk_number', spk)
      .select()
      .single();
    if (error) throw error;
    return updated;
  }

  async deleteReport(spk: string): Promise<boolean> {
    const { error, count } = await this.client
      .from('reports')
      .delete({ count: 'exact' })
      .eq('spk_number', spk);
    if (error) throw error;
    return count !== null && count > 0;
  }

  async listReports(): Promise<Report[]> {
    const { data, error } = await this.client
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async createAuditLog(log: Omit<AuditLog, 'id' | 'created_at'>): Promise<AuditLog> {
    const { data, error } = await this.client
      .from('audit_logs')
      .insert(log)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async listAuditLogs(): Promise<AuditLog[]> {
    const { data, error } = await this.client
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }
}

// ==========================================
// 3. FIREBASE FIRESTORE IMPLEMENTATION
// ==========================================
class FirebaseDatabase implements IDatabase {
  constructor() {
    if (!admin.apps.length) {
      const projId = process.env.FIREBASE_PROJECT_ID;
      const email = process.env.FIREBASE_CLIENT_EMAIL;
      const key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      const saFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || './service_account.json';

      if (projId && email && key) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: projId,
            clientEmail: email,
            privateKey: key,
          }),
        });
      } else if (fs.existsSync(saFile)) {
        try {
          const creds = JSON.parse(fs.readFileSync(saFile, 'utf-8'));
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId: creds.project_id,
              clientEmail: creds.client_email,
              privateKey: creds.private_key,
            }),
          });
          console.log('[Database] Initialized Firebase Firestore using service_account.json');
        } catch (err: any) {
          console.error('[Database] Failed to init Firebase from file, fallback to ADC:', err.message);
          admin.initializeApp();
        }
      } else {
        // Fallback to local ADC/Application Default Credentials
        admin.initializeApp();
      }
    }
  }

  private get db() {
    return admin.firestore();
  }

  async getUser(email: string): Promise<User | null> {
    const snap = await this.db.collection('users').doc(email.toLowerCase()).get();
    if (!snap.exists) return null;
    return snap.data() as User;
  }

  async createUser(user: User): Promise<User> {
    const cleanUser = { ...user, email: user.email.toLowerCase() };
    await this.db.collection('users').doc(cleanUser.email).set(cleanUser);
    return cleanUser;
  }

  async updateUser(email: string, data: Partial<User>): Promise<User> {
    const docRef = this.db.collection('users').doc(email.toLowerCase());
    await docRef.update(data);
    const snap = await docRef.get();
    return snap.data() as User;
  }

  async listUsers(): Promise<User[]> {
    const snap = await this.db.collection('users').orderBy('created_at', 'desc').get();
    const list: User[] = [];
    snap.forEach((doc: any) => list.push(doc.data() as User));
    return list;
  }

  async getReportBySpk(spk: string): Promise<Report | null> {
    const snap = await this.db.collection('reports').where('spk_number', '==', spk).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as Report;
  }

  async createReport(report: Report): Promise<Report> {
    await this.db.collection('reports').doc(report.spk_number).set(report);
    return report;
  }

  async updateReport(spk: string, data: Partial<Report>): Promise<Report> {
    const docRef = this.db.collection('reports').doc(spk);
    await docRef.update(data);
    const snap = await docRef.get();
    return snap.data() as Report;
  }

  async deleteReport(spk: string): Promise<boolean> {
    const docRef = this.db.collection('reports').doc(spk);
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
  }

  async listReports(): Promise<Report[]> {
    const snap = await this.db.collection('reports').orderBy('created_at', 'desc').get();
    const list: Report[] = [];
    snap.forEach((doc: any) => list.push(doc.data() as Report));
    return list;
  }

  async createAuditLog(log: Omit<AuditLog, 'id' | 'created_at'>): Promise<AuditLog> {
    const docRef = this.db.collection('audit_logs').doc();
    const newLog: AuditLog = {
      id: docRef.id,
      ...log,
      created_at: new Date().toISOString(),
    };
    await docRef.set(newLog);
    return newLog;
  }

  async listAuditLogs(): Promise<AuditLog[]> {
    const snap = await this.db.collection('audit_logs').orderBy('created_at', 'desc').get();
    const list: AuditLog[] = [];
    snap.forEach((doc: any) => list.push(doc.data() as AuditLog));
    return list;
  }
}

// Instantiate database based on environment variable
let dbInstance: IDatabase;

const dbType = (process.env.DB_TYPE || 'local').toLowerCase();

if (dbType === 'supabase') {
  try {
    dbInstance = new SupabaseDatabase();
    console.log('[Database] Initialized Supabase PostgreSQL adapter.');
  } catch (err: any) {
    console.error('[Database] Failed to init Supabase. Falling back to Local JSON.', err.message);
    dbInstance = new LocalDatabase();
  }
} else if (dbType === 'firestore') {
  try {
    dbInstance = new FirebaseDatabase();
    console.log('[Database] Initialized Firebase Firestore adapter.');
  } catch (err: any) {
    console.error('[Database] Failed to init Firestore. Falling back to Local JSON.', err.message);
    dbInstance = new LocalDatabase();
  }
} else {
  dbInstance = new LocalDatabase();
  console.log('[Database] Initialized Local JSON database (data/ directory).');
}

export default dbInstance;
