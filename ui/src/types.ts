// Results of the openarch commands with --output json.

export interface Check {
  id: string;
  title: string;
  status: 'ok' | 'warn' | 'fail' | 'skip';
  message: string;
  hint?: string;
}

export interface Doctor {
  checks: Check[];
  summary: { ok: number; warn: number; fail: number; skip: number };
}

export interface Service {
  name: string;
  state: string;
  health?: string;
  oneShot: boolean;
  ports?: number[];
  ok: boolean;
}

export interface Settings {
  version: string;
  port: number;
  memory: string;
  with?: string[];
  expose?: string[];
  tls: { mode: string };
  security: { backendAuth: boolean; defaultUsers: boolean };
}

export type StackState = 'healthy' | 'starting' | 'unhealthy' | 'stopped';

export interface Status {
  workspace: string;
  state: StackState;
  services: Service[];
  endpoints: { name: string; url: string }[];
  adminUser?: string;
  settings?: Settings;
}

export interface Credential {
  username: string;
  password: string;
  context?: string;
  admin?: boolean;
}

export interface Credentials {
  url: string;
  users: Credential[];
}

export interface Ace {
  permission: string;
  granted: boolean;
  group?: { id: string; name?: string };
  user?: { username?: string };
}

export interface Document {
  sys_id: string;
  sys_title?: string;
  sys_name?: string;
  sys_path: string;
  sys_primaryType: string;
  sys_effectiveAcl?: Ace[];
}

export interface QueryResult {
  documents: Document[];
  totalCount?: number;
}

export interface Backup {
  path: string;
}
