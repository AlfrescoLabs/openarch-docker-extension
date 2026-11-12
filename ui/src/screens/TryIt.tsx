import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Link,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Cli } from '../cli';
import type { Credentials, Document, QueryResult } from '../types';
import { ErrorAlert } from './common';

export const PRESETS = [
  { title: 'All demo documents', query: "SELECT * FROM SysFile WHERE sys_path STARTSWITH '/Demo/'" },
  { title: 'Titles with 2027', query: "SELECT * FROM SysFile WHERE sys_title LIKE '%2027%'" },
];

interface Column {
  username: string;
  context: string;
  docs: Document[] | null;
  error: unknown;
}

// columns are the admin first, then the demo users, from 'openarch credentials'.
function columns(creds: Credentials): Column[] {
  const admin = creds.users.filter((u) => u.admin);
  const others = creds.users.filter((u) => !u.admin);
  return [...admin, ...others]
    .filter((u) => u.context)
    .map((u) => ({ username: u.username, context: u.context as string, docs: null, error: null }));
}

export function TryIt({ cli, creds, busy }: { cli: Cli; creds: Credentials; busy: string | null }) {
  const [query, setQuery] = useState(PRESETS[0].query);
  const [cols, setCols] = useState<Column[]>(() => columns(creds));
  const [error, setError] = useState<unknown>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [acl, setAcl] = useState<{ doc: Document; groups: string[] } | null>(null);
  const adminContext = creds.users.find((u) => u.admin)?.context;

  const run = useCallback(
    async (q: string) => {
      setError(null);
      const base = columns(creds);
      setCols(base);
      const results = await Promise.all(
        base.map(async (c) => {
          try {
            const r = await cli.json<QueryResult>(['query', q, '--context', c.context, '--sync', '--limit', '50']);
            return { ...c, docs: r.documents };
          } catch (e) {
            return { ...c, error: e };
          }
        }),
      );
      setCols(results);
    },
    [cli, creds],
  );
  useEffect(() => {
    void run(PRESETS[0].query);
  }, [run]);

  const load = async (args: string[], label: string) => {
    setError(null);
    setInfo(null);
    try {
      const r = await cli.change<{ action: string }>(label, args);
      setInfo(
        {
          loaded: 'Loaded the sample documents.',
          exists: 'The sample documents are already there.',
          deleted: 'Deleted the sample documents.',
          absent: 'There are no sample documents.',
        }[r.action] ?? null,
      );
    } catch (e) {
      setError(e);
    }
    void run(query);
  };

  const whoCanRead = async (doc: Document) => {
    if (!adminContext) {
      return;
    }
    try {
      const d = await cli.json<Document>(['documents', 'get', doc.sys_path, '--context', adminContext]);
      const groups = (d.sys_effectiveAcl ?? [])
        .filter((a) => a.granted && a.permission === 'Read')
        .map((a) => a.group?.name ?? a.user?.username ?? '')
        .filter(Boolean);
      // Administrators can read every document: the root has no access entries.
      setAcl({ doc, groups: ['administrators', ...groups] });
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Stack spacing={3}>
      <Typography>
        OpenArch answers each query with the documents that the caller may read. Here the same query runs as the admin and as
        two demo users. alice is in the group demo-hr, and bob is in demo-finance.
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={!!busy} onClick={() => void load(['demo', 'load'], 'Load the sample documents')}>
          Load sample data
        </Button>
        <Button disabled={!!busy} onClick={() => void load(['demo', 'reset', '--yes'], 'Delete the sample documents')}>
          Reset sample data
        </Button>
      </Stack>
      {info && <Alert severity="success">{info}</Alert>}
      <ErrorAlert error={error} />

      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          select
          label="Example"
          value={PRESETS.find((p) => p.query === query)?.query ?? ''}
          onChange={(e) => {
            setQuery(e.target.value);
            void run(e.target.value);
          }}
          sx={{ minWidth: 220 }}
        >
          {PRESETS.map((p) => (
            <MenuItem key={p.title} value={p.query}>
              {p.title}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="HxQL query" value={query} onChange={(e) => setQuery(e.target.value)} fullWidth />
        <Button variant="outlined" onClick={() => void run(query)}>
          Run
        </Button>
      </Stack>

      <Grid container spacing={2}>
        {cols.map((c) => (
          <Grid item key={c.context} xs={12} md={4}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6">{c.username}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {c.docs ? `${c.docs.length} document${c.docs.length === 1 ? '' : 's'}` : c.error ? '' : 'running...'}
                </Typography>
                <ErrorAlert error={c.error} />
                <List dense>
                  {c.docs?.map((d) => (
                    <ListItem key={d.sys_id} disableGutters>
                      <ListItemText
                        primary={d.sys_title || d.sys_name}
                        secondary={
                          <Link component="button" variant="body2" sx={{ textAlign: 'left' }} onClick={() => void whoCanRead(d)}>
                            {d.sys_path} - who can read this?
                          </Link>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={acl !== null} onClose={() => setAcl(null)}>
        <DialogTitle>Who can read {acl?.doc.sys_title}?</DialogTitle>
        <DialogContent>
          <Box component="ul">
            {acl?.groups.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary">
            From the effective access entries of the document (sys_effectiveAcl), read as the admin.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAcl(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
