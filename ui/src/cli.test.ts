import { describe, expect, it } from 'vitest';
import { Cli, CliError, encodeArgs, Exit, HELPER, normalize, parse, REFUSED } from './cli';

function decode(s: string): string[] {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
}

describe('encodeArgs', () => {
  it('gives a string with no shell characters that decodes to the same arguments', () => {
    const args = ['query', `SELECT * FROM SysFile WHERE sys_path STARTSWITH '/Demo/' AND a = "x;y|z" $HOME ñ`, '--sync'];
    const s = encodeArgs(args);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decode(s)).toEqual(args);
  });
});

describe('normalize', () => {
  it('reads a resolved result', () => {
    expect(normalize({ stdout: '{}', stderr: '' })).toEqual({ code: 0, stdout: '{}', stderr: '' });
  });
  it('reads a rejection with an exit code', () => {
    expect(normalize({ code: 4, stdout: '{"state":"starting"}', stderr: 'x', cmd: 'c', killed: false })).toEqual({
      code: 4,
      stdout: '{"state":"starting"}',
      stderr: 'x',
    });
  });
  it('marks a command that Docker Desktop refused', () => {
    expect(normalize({ stderr: 'shell operators are not allowed' }).code).toBe(REFUSED);
  });
});

describe('parse', () => {
  it('returns the JSON result for an accepted code', () => {
    expect(parse<{ state: string }>({ code: 4, stdout: '{"state":"stopped"}', stderr: '' }, [0, 4]).state).toBe('stopped');
  });
  it('turns a JSON error into a CliError with the hint', () => {
    const r = { code: 2, stdout: '{"error":{"code":"usage","message":"openarch.yaml not found","hint":"Run init"}}', stderr: '' };
    expect(() => parse(r)).toThrowError(CliError);
    try {
      parse(r);
    } catch (e) {
      expect((e as CliError).code).toBe(Exit.Usage);
      expect((e as CliError).hint).toBe('Run init');
    }
  });
  it('fails on a code that is not accepted', () => {
    expect(() => parse({ code: 4, stdout: '{}', stderr: '' })).toThrowError(/code 4/);
  });
  it('fails on output that is not JSON', () => {
    expect(() => parse({ code: 1, stdout: 'panic', stderr: 'boom' })).toThrowError(/no JSON output: boom/);
  });
  it('fails on a refused command', () => {
    expect(() => parse({ code: REFUSED, stdout: '', stderr: 'refused' })).toThrowError(/did not run/);
  });
});

describe('Cli', () => {
  it('calls the helper with one encoded argument and the JSON flags', async () => {
    const calls: [string, string[]][] = [];
    const cli = new Cli({ exec: async (cmd, args) => (calls.push([cmd, args]), { stdout: '{"ok":true}', stderr: '' }) });
    expect(await cli.json<{ ok: boolean }>(['status'])).toEqual({ ok: true });
    expect(calls[0][0]).toBe(HELPER);
    expect(decode(calls[0][1][0])).toEqual(['status', '--output', 'json', '--non-interactive']);
  });

  it('treats a rejected promise as a result', async () => {
    const cli = new Cli({ exec: async () => Promise.reject({ code: 4, stdout: '{"state":"starting"}', stderr: '' }) });
    expect(await cli.json<{ state: string }>(['status'], [0, 4])).toEqual({ state: 'starting' });
  });

  it('runs one state change at a time and tells the listeners', async () => {
    let release: (v: unknown) => void = () => {};
    const cli = new Cli({ exec: () => new Promise((r) => (release = r)) });
    const seen: (string | null)[] = [];
    cli.subscribe((b) => seen.push(b));
    const first = cli.change('Start', ['up']);
    await expect(cli.change('Stop', ['down'])).rejects.toThrowError(/Wait until "Start" ends/);
    release({ stdout: '{}', stderr: '' });
    await first;
    expect(seen).toEqual(['Start', null]);
    expect(cli.busy).toBeNull();
  });
});
