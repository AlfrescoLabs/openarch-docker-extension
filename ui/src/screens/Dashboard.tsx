import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Cli } from '../cli';
import type { Backup, Credentials, Status } from '../types';
import { ErrorAlert } from './common';

export interface Desktop {
  openExternal(url: string): void;
  toast(msg: string): void;
}

const stateColor = { healthy: 'success', starting: 'info', unhealthy: 'error', stopped: 'default' } as const;
const endpointTitle: Record<string, string> = { api: 'REST API', swagger: 'Swagger UI', dashboards: 'OpenSearch Dashboards' };

export function Dashboard(props: {
  cli: Cli;
  desktop: Desktop;
  status: Status;
  creds: Credentials | null;
  busy: string | null;
  refresh: () => void;
  onRemoved: () => void;
}) {
  const { cli, desktop, status, creds, busy, refresh } = props;
  const [error, setError] = useState<unknown>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [versionOpen, setVersionOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  // goBack is set after a failed version change: the old version and the backup made before it.
  const [goBack, setGoBack] = useState<{ version: string; folder: string | null } | null>(null);
  const s = status.settings;
  const admin = creds?.users.find((u) => u.admin);

  const act = async (label: string, args: string[]) => {
    setError(null);
    try {
      await cli.change(label, args);
    } catch (e) {
      setError(e);
    }
    refresh();
  };

  const showLogs = async () => {
    setError(null);
    try {
      setLogs(await cli.text(['logs', '--tail', '200']));
    } catch (e) {
      setError(e);
    }
  };

  const changeVersion = async (version: string) => {
    setVersionOpen(false);
    setError(null);
    setGoBack(null);
    const from = s?.version ?? '';
    let folder: string | null = null;
    try {
      // There is no automatic rollback: keep a backup to go back to.
      if (status.state === 'healthy') {
        folder = (await cli.change<Backup>('Back up the data', ['backup'])).path;
      }
      await cli.change(`Change to ${version}`, ['upgrade', '--version', version]);
      desktop.toast(`OpenArch ${version} is running.`);
    } catch (e) {
      setError(e);
      if (from) {
        setGoBack({ version: from, folder });
      }
    }
    refresh();
  };

  // back returns to the old version, then restores the data of the backup.
  // restore puts back only the data, not the version.
  const back = async () => {
    if (!goBack) {
      return;
    }
    setError(null);
    try {
      await cli.change(`Go back to ${goBack.version}`, ['upgrade', '--version', goBack.version, '--skip-smoke-test']);
      if (goBack.folder) {
        await cli.change('Restore the backup', ['restore', goBack.folder, '--yes']);
      }
      setGoBack(null);
      desktop.toast(`OpenArch ${goBack.version} is running again.`);
    } catch (e) {
      setError(e);
    }
    refresh();
  };

  const remove = async () => {
    setRemoveOpen(false);
    setError(null);
    try {
      await cli.change('Remove everything', ['remove-all']);
      props.onRemoved();
    } catch (e) {
      setError(e);
      refresh();
    }
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} alignItems="center">
        <Typography variant="h6">OpenArch {s?.version}</Typography>
        <Chip label={status.state} color={stateColor[status.state]} />
        {busy && <Typography variant="body2">{busy}...</Typography>}
      </Stack>
      {status.state === 'starting' && (
        <Alert severity="info">
          OpenArch is starting. The first start pulls about 2 GB and can take a few minutes. This page updates itself.
        </Alert>
      )}
      <ErrorAlert error={error} />
      {goBack && (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" disabled={!!busy} onClick={() => void back()}>
              Go back to {goBack.version}
            </Button>
          }
        >
          The version change failed.{' '}
          {goBack.folder ? `A backup made before it is in ${goBack.folder}.` : 'There is no backup: OpenArch was not running.'}
        </Alert>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {status.endpoints
          .filter((e) => endpointTitle[e.name])
          .map((e) => (
            <Button key={e.name} variant="outlined" onClick={() => desktop.openExternal(e.url)}>
              Open {endpointTitle[e.name]}
            </Button>
          ))}
      </Stack>

      {admin && (
        <Box>
          <Typography variant="subtitle1">Login</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {admin.username} / {admin.password}
            </Typography>
            <Tooltip title="Copy the password">
              <IconButton size="small" onClick={() => void navigator.clipboard.writeText(admin.password)}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      )}

      <Table size="small" sx={{ maxWidth: 720 }}>
        <TableHead>
          <TableRow>
            <TableCell>Service</TableCell>
            <TableCell>State</TableCell>
            <TableCell>Health</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {status.services.map((x) => (
            <TableRow key={x.name}>
              <TableCell>{x.name}</TableCell>
              <TableCell>{x.state}</TableCell>
              <TableCell>{x.health ?? (x.oneShot ? 'one-shot' : '')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {s && (
        <Typography variant="body2" color="text.secondary">
          Port {s.port}, memory {s.memory}
          {s.with?.length ? `, with ${s.with.join(', ')}` : ''}
          {s.expose?.length ? `, open ports: ${s.expose.join(', ')}` : ''}
          {s.security.defaultUsers ? ', users bundled in the image' : ''}. Workspace: {status.workspace}
        </Typography>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {status.state === 'stopped' ? (
          <Button variant="contained" disabled={!!busy} onClick={() => void act('Start OpenArch', ['up', '--wait=false'])}>
            Start
          </Button>
        ) : (
          <Button variant="contained" disabled={!!busy} onClick={() => void act('Stop OpenArch', ['down'])}>
            Stop
          </Button>
        )}
        <Button disabled={!!busy} onClick={() => void showLogs()}>
          Logs
        </Button>
        <Button disabled={!!busy || status.state === 'stopped'} onClick={() => setVersionOpen(true)}>
          Change version
        </Button>
        <Button color="error" disabled={!!busy} onClick={() => setRemoveOpen(true)}>
          Remove everything
        </Button>
      </Stack>

      <Dialog open={logs !== null} onClose={() => setLogs(null)} fullWidth maxWidth="lg">
        <DialogTitle>Logs (last 200 lines of each service)</DialogTitle>
        <DialogContent>
          <Box component="pre" sx={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {logs}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLogs(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <VersionDialog open={versionOpen} current={s?.version ?? ''} onClose={() => setVersionOpen(false)} onChange={(v) => void changeVersion(v)} />

      <Dialog open={removeOpen} onClose={() => setRemoveOpen(false)}>
        <DialogTitle>Remove everything?</DialogTitle>
        <DialogContent>
          This stops OpenArch and deletes its containers, its data and the workspace files. The demo users and documents are
          deleted too.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveOpen(false)}>Cancel</Button>
          <Button color="error" onClick={() => void remove()}>
            Remove everything
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function VersionDialog(props: { open: boolean; current: string; onClose: () => void; onChange: (v: string) => void }) {
  const [choice, setChoice] = useState<'latest' | 'custom'>('latest');
  const [tag, setTag] = useState('');
  const version = choice === 'latest' ? 'latest' : tag.trim();
  return (
    <Dialog open={props.open} onClose={props.onClose}>
      <DialogTitle>Change the OpenArch version</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">
            Now: {props.current}. The extension makes a backup first, then pulls the new image, restarts OpenArch and runs a
            smoke test. A version that is not tested can fail: the backup lets you go back.
          </Typography>
          <TextField select label="Version" value={choice} onChange={(e) => setChoice(e.target.value as 'latest' | 'custom')}>
            <MenuItem value="latest">Latest</MenuItem>
            <MenuItem value="custom">Another tag</MenuItem>
          </TextField>
          {choice === 'custom' && <TextField label="Tag, for example 1.0.90" value={tag} onChange={(e) => setTag(e.target.value)} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button variant="contained" disabled={!version} onClick={() => props.onChange(version)}>
          Change
        </Button>
      </DialogActions>
    </Dialog>
  );
}
