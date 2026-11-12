import { Alert, AlertTitle } from '@mui/material';
import { CliError } from '../cli';

// ErrorAlert shows an error of a command, with its hint.
export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }
  const msg = error instanceof Error ? error.message : String(error);
  const hint = error instanceof CliError ? error.hint : '';
  return (
    <Alert severity="error">
      <AlertTitle>{msg}</AlertTitle>
      {hint}
    </Alert>
  );
}
