import { useCallback, useEffect, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Cli, CliError } from '../cli';
import type { Doctor } from '../types';
import { ErrorAlert } from './common';

// CONTEXT is the name of the workspace context. Demo contexts get "-alice", "-bob" and "-carol".
export const CONTEXT = 'oa-desktop';

type Version = 'recommended' | 'latest' | 'custom';

export interface SetupOptions {
  demo: boolean;
  version: Version;
  customVersion: string;
  port: number;
  memory: string;
  dashboards: boolean;
  exposeMongo: boolean;
  exposeOpenSearch: boolean;
  defaultUsers: boolean;
}

export const defaults: SetupOptions = {
  demo: false,
  version: 'recommended',
  customVersion: '',
  port: 8080,
  memory: 'auto',
  dashboards: false,
  exposeMongo: false,
  exposeOpenSearch: false,
  defaultUsers: false,
};

// initArgs maps the options to 'openarch init' flags.
export function initArgs(o: SetupOptions): string[] {
  const args = ['init', '--context-name', CONTEXT, '--port', String(o.port), '--memory', o.memory || 'auto'];
  if (o.version === 'latest') {
    args.push('--version', 'latest');
  }
  if (o.version === 'custom' && o.customVersion.trim()) {
    args.push('--version', o.customVersion.trim());
  }
  if (o.dashboards) {
    args.push('--with', 'dashboards');
  }
  if (o.exposeMongo) {
    args.push('--expose', 'mongodb');
  }
  if (o.exposeOpenSearch) {
    args.push('--expose', 'opensearch');
  }
  if (o.defaultUsers) {
    args.push('--default-users');
  }
  return args;
}

const chipColor = { ok: 'success', warn: 'warning', fail: 'error', skip: 'default' } as const;

export function Setup({ cli, onStarted }: { cli: Cli; onStarted: (error?: unknown) => void }) {
  const [o, setO] = useState<SetupOptions>(defaults);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [step, setStep] = useState<string | null>(null);
  const set = (p: Partial<SetupOptions>) => setO((x) => ({ ...x, ...p }));

  const check = useCallback(
    async (port: number) => {
      setDoctor(null);
      try {
        // Exit code 3 means a prerequisite is missing: the checks say which.
        setDoctor(await cli.json<Doctor>(['doctor', '--port', String(port)], [0, 3]));
      } catch (e) {
        setError(e);
      }
    },
    [cli],
  );
  useEffect(() => {
    void check(defaults.port);
  }, [check]);

  const start = async () => {
    setError(null);
    let created = false;
    try {
      setStep('Creating the workspace');
      await cli.change('Create the workspace', initArgs(o));
      created = true;
      if (o.demo && !o.defaultUsers) {
        setStep('Adding the demo users');
        await cli.change('Add the demo users', ['demo', 'users']);
      }
      setStep('Starting OpenArch (the first start pulls about 2 GB)');
      await cli.change('Start OpenArch', ['up', '--wait=false']);
      onStarted();
    } catch (e) {
      setError(e);
      // When the workspace exists, the dashboard shows it, with Start and Remove everything.
      if (created && e instanceof CliError) {
        onStarted(e);
      }
    } finally {
      setStep(null);
    }
  };

  const failed = doctor?.checks.some((c) => c.status === 'fail') ?? false;
  return (
    <Stack spacing={3} sx={{ maxWidth: 820 }}>
      <Typography>
        Start Hyland OpenArch on this machine: the OpenArch REST API, with MongoDB and OpenSearch. It needs about 4 GB of
        Docker memory.
      </Typography>

      <Box>
        <Typography variant="h6" gutterBottom>
          Checks
        </Typography>
        {!doctor && <LinearProgress />}
        <Stack spacing={1}>
          {doctor?.checks.map((c) => (
            <Stack key={c.id} direction="row" spacing={1} alignItems="center">
              <Chip size="small" label={c.status} color={chipColor[c.status]} />
              <Typography variant="body2">
                {c.title}: {c.message}
                {c.hint ? ` ${c.hint}` : ''}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      <Box>
        <Typography variant="h6" gutterBottom>
          What to start
        </Typography>
        <RadioGroup value={o.demo ? 'demo' : 'only'} onChange={(e) => set({ demo: e.target.value === 'demo' })}>
          <FormControlLabel value="only" control={<Radio />} label="OpenArch only (REST API)" />
          <FormControlLabel
            value="demo"
            control={<Radio />}
            disabled={o.defaultUsers}
            label="OpenArch + demo: two users and sample documents that show permission-aware search"
          />
        </RadioGroup>
      </Box>

      <Stack direction="row" spacing={2} alignItems="center">
        <TextField
          select
          label="OpenArch version"
          value={o.version}
          onChange={(e) => set({ version: e.target.value as Version })}
          sx={{ minWidth: 280 }}
        >
          <MenuItem value="recommended">Recommended (tested with this extension)</MenuItem>
          <MenuItem value="latest">Latest (not tested yet)</MenuItem>
          <MenuItem value="custom">Another tag</MenuItem>
        </TextField>
        {o.version === 'custom' && (
          <TextField label="Tag, for example 1.0.100" value={o.customVersion} onChange={(e) => set({ customVersion: e.target.value })} />
        )}
      </Stack>

      <Accordion disableGutters>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>Advanced options</AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                label="Port"
                type="number"
                value={o.port}
                onChange={(e) => set({ port: Number(e.target.value) })}
                sx={{ width: 140 }}
              />
              <Button onClick={() => void check(o.port)}>Check the port again</Button>
              <TextField label="Memory (auto, or a size such as 6g)" value={o.memory} onChange={(e) => set({ memory: e.target.value })} />
            </Stack>
            <FormControlLabel
              control={<Switch checked={o.dashboards} onChange={(e) => set({ dashboards: e.target.checked })} />}
              label="OpenSearch Dashboards (port 5601)"
            />
            <FormControlLabel
              control={<Switch checked={o.exposeMongo} onChange={(e) => set({ exposeMongo: e.target.checked })} />}
              label="Open the MongoDB port on this machine (27017)"
            />
            <FormControlLabel
              control={<Switch checked={o.exposeOpenSearch} onChange={(e) => set({ exposeOpenSearch: e.target.checked })} />}
              label="Open the OpenSearch port on this machine (9200)"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={o.defaultUsers}
                  disabled={o.demo}
                  onChange={(e) => set({ defaultUsers: e.target.checked })}
                />
              }
              label="Use the users bundled in the OpenArch image (admin:password and others). Not with the demo."
            />
            <Typography variant="body2" color="text.secondary">
              These options apply when OpenArch starts the first time. To change them later, remove everything and start
              again. Only the version can change later.
            </Typography>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {failed && <Alert severity="error">A check failed. Fix it, or choose another port, before you start.</Alert>}
      <ErrorAlert error={error} />
      {step && (
        <Box>
          <Typography variant="body2">{step}...</Typography>
          <LinearProgress />
        </Box>
      )}
      <Box>
        <Button variant="contained" size="large" disabled={!!step || !doctor || failed} onClick={() => void start()}>
          Start
        </Button>
      </Box>
    </Stack>
  );
}
