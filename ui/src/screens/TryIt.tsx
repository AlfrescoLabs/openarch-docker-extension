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
import { readers } from '../acl';
import { Cli, CliError, Exit } from '../cli';
import { hitDocument, QUESTIONS } from '../semantic';
import type { Credentials, Document, QueryResult, SemanticHit, SemanticResult } from '../types';
import { ErrorAlert } from './common';

export const PRESETS = [
  { title: 'All demo documents', query: "SELECT * FROM SysFile WHERE sys_path STARTSWITH '/Demo/'" },
  { title: 'Titles with 2027', query: "SELECT * FROM SysFile WHERE sys_title LIKE '%2027%'" },
];

interface Column {
  username: string;
  context: string;
  // docs is the result of a query, hits the result of a question. One of them is set.
  docs: Document[] | null;
  hits: SemanticHit[] | null;
  total: number;
  error: unknown;
}

// columns are the admin first, then the demo users, from 'openarch credentials'.
function columns(creds: Credentials): Column[] {
  const admin = creds.users.filter((u) => u.admin);
  const others = creds.users.filter((u) => !u.admin);
  return [...admin, ...others]
    .filter((u) => u.context)
    .map((u) => ({ username: u.username, context: u.context as string, docs: null, hits: null, total: 0, error: null }));
}

export function TryIt({ cli, creds, busy }: { cli: Cli; creds: Credentials; busy: string | null }) {
  const [query, setQuery] = useState(PRESETS[0].query);
  const [question, setQuestion] = useState(QUESTIONS[0]);
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
            return { ...c, docs: r.documents, total: r.documents.length };
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

  const ask = async (q: string) => {
    setError(null);
    const base = columns(creds);
    setCols(base);
    const results = await Promise.all(
      base.map(async (c) => {
        try {
          const r = await cli.json<SemanticResult>(['query', '--semantic', q, '--context', c.context, '--limit', '5']);
          // totalCount of a vector search counts at most the hits asked for, so it is not shown.
          return { ...c, hits: r.hits };
        } catch (e) {
          return { ...c, error: e };
        }
      }),
    );
    setCols(results);
  };

  // loadSample stores vectors with the documents when Docker Model Runner can make
  // them, and loads the documents alone when it cannot.
  const loadSample = async () => {
    setError(null);
    setInfo(null);
    try {
      const r = await cli.change<{ action: string }>('Load the sample documents', ['demo', 'load', '--embeddings']);
      setInfo(
        r.action === 'exists'
          ? 'The sample documents are already there. To add vectors to them, reset the sample data and load it again.'
          : 'Loaded the sample documents, with a vector for each one.',
      );
    } catch (e) {
      if (!(e instanceof CliError) || e.code !== Exit.Prerequisite) {
        setError(e);
        void run(query);
        return;
      }
      await load(['demo', 'load'], 'Load the sample documents');
      setInfo(`Loaded the sample documents without vectors, so questions find nothing: ${e.message}. ${e.hint}`);
      return;
    }
    void run(query);
  };

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
      // A hit of a question has the id of its document, but not the path.
      const d = await cli.json<Document>(['documents', 'get', doc.sys_path || doc.sys_id, '--context', adminContext]);
      const groups = readers(d.sys_effectiveAcl);
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
        the demo users. alice is in the group demo-hr, bob is in demo-finance, and carol is in no extra group. A question
        finds the documents nearest in meaning, with vectors made by a local model on Docker Model Runner, and follows the
        same access rules.
      </Typography>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={!!busy} onClick={() => void loadSample()}>
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

      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          select
          label="Example question"
          value={QUESTIONS.includes(question) ? question : ''}
          onChange={(e) => {
            setQuestion(e.target.value);
            void ask(e.target.value);
          }}
          sx={{ minWidth: 220 }}
        >
          {QUESTIONS.map((q) => (
            <MenuItem key={q} value={q}>
              {q}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Question" value={question} onChange={(e) => setQuestion(e.target.value)} fullWidth />
        <Button variant="outlined" onClick={() => void ask(question)}>
          Ask
        </Button>
      </Stack>

      <Grid container spacing={2}>
        {cols.map((c) => (
          <Grid item key={c.context} xs={12} md={Math.max(3, Math.floor(12 / cols.length))}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6">{c.username}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {c.hits
                    ? `${c.hits.length} nearest document${c.hits.length === 1 ? '' : 's'}`
                    : c.docs
                      ? `${c.total} document${c.total === 1 ? '' : 's'}`
                      : c.error
                        ? ''
                        : 'running...'}
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
                  {c.hits?.map((h) => (
                    <ListItem key={h.docId} disableGutters>
                      <ListItemText
                        primary={hitDocument(h).sys_title}
                        secondary={
                          <Link component="button" variant="body2" sx={{ textAlign: 'left' }} onClick={() => void whoCanRead(hitDocument(h))}>
                            score {h.score.toFixed(2)} - who can read this?
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
