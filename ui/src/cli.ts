// The only caller of ddClient.extension.host.cli.exec.
//
// Docker Desktop runs host binaries through "/bin/sh -c" with no quoting, so
// the arguments go to the openarch-dd helper as one base64url string of a
// JSON array. A non-zero exit code rejects the exec promise with
// {code, stdout, stderr}; a command that Docker Desktop refuses resolves with
// only stderr and no code.

export const HELPER = 'openarch-dd';

// Exit codes of the openarch CLI.
export const Exit = { OK: 0, Error: 1, Usage: 2, Prerequisite: 3, Unhealthy: 4, Remote: 5, Auth: 6 } as const;

// Refused is the code of a command that Docker Desktop did not run.
export const REFUSED = -1;

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

// Host is the part of the Docker Desktop client that Cli uses.
export interface Host {
  exec(cmd: string, args: string[]): Promise<unknown>;
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly hint = '',
  ) {
    super(message);
  }
}

// encodeArgs returns the base64url form (no padding) of the JSON array of args.
export function encodeArgs(args: string[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(args));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// normalize turns a resolved value or a rejection of exec into an ExecResult.
export function normalize(raw: unknown): ExecResult {
  const r = (raw ?? {}) as { code?: unknown; stdout?: unknown; stderr?: unknown };
  const stdout = typeof r.stdout === 'string' ? r.stdout : '';
  const stderr = typeof r.stderr === 'string' ? r.stderr : '';
  if (typeof r.code === 'number') {
    return { code: r.code, stdout, stderr };
  }
  if (stdout === '' && stderr !== '') {
    return { code: REFUSED, stdout, stderr };
  }
  return { code: Exit.OK, stdout, stderr };
}

// parse reads the JSON document on stdout. A JSON error, a refused command,
// or an exit code not in ok becomes a CliError.
export function parse<T>(r: ExecResult, ok: number[] = [Exit.OK]): T {
  if (r.code === REFUSED) {
    throw new CliError('Docker Desktop did not run the command: ' + r.stderr.trim(), REFUSED);
  }
  let data: unknown;
  try {
    data = JSON.parse(r.stdout);
  } catch {
    throw new CliError(`openarch exited with code ${r.code} and no JSON output: ${r.stderr.trim()}`, r.code);
  }
  const e = (data as { error?: { message?: string; hint?: string } }).error;
  if (e) {
    throw new CliError(e.message ?? 'unknown error', r.code, e.hint ?? '');
  }
  if (!ok.includes(r.code)) {
    throw new CliError(`openarch exited with code ${r.code}`, r.code);
  }
  return data as T;
}

type Listener = (busy: string | null) => void;

// Cli runs openarch commands. Commands that change state run one at a time.
export class Cli {
  private running: string | null = null;
  private listeners = new Set<Listener>();

  constructor(private host: Host) {}

  get busy(): string | null {
    return this.running;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  // raw runs openarch with args as given, and never rejects.
  async raw(args: string[]): Promise<ExecResult> {
    try {
      return normalize(await this.host.exec(HELPER, [encodeArgs(args)]));
    } catch (e) {
      return normalize(e);
    }
  }

  // json runs a read-only command with --output json and returns its result.
  async json<T>(args: string[], ok: number[] = [Exit.OK]): Promise<T> {
    return parse<T>(await this.raw([...args, '--output', 'json', '--non-interactive']), ok);
  }

  // change runs a command that changes state. It fails at once when another one runs.
  async change<T>(label: string, args: string[], ok: number[] = [Exit.OK]): Promise<T> {
    if (this.running) {
      throw new CliError(`Wait until "${this.running}" ends.`, Exit.Error);
    }
    this.set(label);
    try {
      return await this.json<T>(args, ok);
    } finally {
      this.set(null);
    }
  }

  // text runs a command without JSON, for logs.
  async text(args: string[]): Promise<string> {
    const r = await this.raw([...args, '--non-interactive']);
    if (r.code === REFUSED) {
      throw new CliError('Docker Desktop did not run the command: ' + r.stderr.trim(), REFUSED);
    }
    return r.stdout + r.stderr;
  }

  private set(label: string | null) {
    this.running = label;
    this.listeners.forEach((l) => l(label));
  }
}
