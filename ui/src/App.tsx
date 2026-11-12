import { useCallback, useEffect, useMemo, useState } from 'react';
import { createDockerDesktopClient } from '@docker/extension-api-client';
import { Alert, Box, CircularProgress, Link, Stack, Tab, Tabs, Typography } from '@mui/material';
import { Cli, CliError, Exit, type Host } from './cli';
import type { Credentials, Status } from './types';
import { Setup } from './screens/Setup';
import { Dashboard, type Desktop } from './screens/Dashboard';
import { TryIt } from './screens/TryIt';
import { ConnectAI } from './screens/ConnectAI';
import { ErrorAlert } from './screens/common';
import { IMAGE, latestNewerThan } from './updateCheck';

declare const __EXTENSION_VERSION__: string;

const dd = createDockerDesktopClient();
const POLL_MS = 5000;

// noWorkspace reports the 'status' error of a workspace that does not exist yet.
function noWorkspace(e: unknown): boolean {
  return e instanceof CliError && e.code === Exit.Usage && e.message.includes('openarch.yaml not found');
}

export function App() {
  const cli = useMemo(() => new Cli(dd.extension.host!.cli as unknown as Host), []);
  const desktop: Desktop = useMemo(
    () => ({ openExternal: (url) => dd.host.openExternal(url), toast: (msg) => dd.desktopUI.toast.success(msg) }),
    [],
  );
  const [status, setStatus] = useState<Status | 'none' | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [update, setUpdate] = useState<string | null>(null);

  useEffect(() => cli.subscribe(setBusy), [cli]);
  useEffect(() => {
    void latestNewerThan(__EXTENSION_VERSION__).then(setUpdate);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const st = await cli.json<Status>(['status'], [Exit.OK, Exit.Unhealthy]);
      setStatus(st);
      setCreds(await cli.json<Credentials>(['credentials']));
    } catch (e) {
      if (noWorkspace(e)) {
        setStatus('none');
        setCreds(null);
      } else {
        setError(e);
      }
    }
  }, [cli]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while the stack starts or a command runs.
  const starting = status !== null && status !== 'none' && (status.state === 'starting' || status.state === 'unhealthy');
  useEffect(() => {
    if (!starting && !busy) {
      return;
    }
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [starting, busy, refresh]);

  const demo = creds?.users.some((u) => !u.admin && u.context) ?? false;
  const tabs = ['Dashboard', ...(demo ? ['Try it'] : []), 'Connect AI'];
  const current = tabs[Math.min(tab, tabs.length - 1)];

  return (
    <Stack spacing={2} sx={{ p: 3 }}>
      <Box>
        <Typography variant="h3">Hyland OpenArch</Typography>
        <Typography variant="body2" color="text.secondary">
          An open source data layer for AI, with permission-aware search. This extension uses the{' '}
          <Link component="button" variant="body2" onClick={() => dd.host.openExternal('https://github.com/AlfrescoLabs/openarch-cli')}>
            CLI for OpenArch
          </Link>
          . Not an official Hyland product: an AlfrescoLabs project that Hyland does not officially support.
        </Typography>
      </Box>
      {update && (
        <Alert severity="info">
          Version {update} of this extension is available. Run: docker extension update {IMAGE}
        </Alert>
      )}
      <ErrorAlert error={error} />
      {status === null && <CircularProgress />}
      {status === 'none' && (
        <Setup
          cli={cli}
          onStarted={(e) => {
            setError(e ?? null);
            void refresh();
          }}
        />
      )}
      {status !== null && status !== 'none' && (
        <>
          <Tabs value={tabs.indexOf(current)} onChange={(_, v: number) => setTab(v)}>
            {tabs.map((t) => (
              <Tab key={t} label={t} />
            ))}
          </Tabs>
          {current === 'Dashboard' && (
            <Dashboard
              cli={cli}
              desktop={desktop}
              status={status}
              creds={creds}
              busy={busy}
              refresh={() => void refresh()}
              onRemoved={() => {
                setTab(0);
                setStatus('none');
                setCreds(null);
              }}
            />
          )}
          {current === 'Try it' && creds && status.state === 'healthy' && <TryIt cli={cli} creds={creds} busy={busy} />}
          {current === 'Try it' && status.state !== 'healthy' && <Alert severity="info">Start OpenArch first.</Alert>}
          {current === 'Connect AI' && <ConnectAI workspace={status.workspace} />}
        </>
      )}
    </Stack>
  );
}
