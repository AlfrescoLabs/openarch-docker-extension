import { Box, Stack, Typography } from '@mui/material';

function Code({ children }: { children: string }) {
  return (
    <Box component="pre" sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: 13, overflowX: 'auto' }}>
      {children}
    </Box>
  );
}

// ConnectAI shows how an AI client uses OpenArch through the MCP server of the CLI.
export function ConnectAI({ workspace }: { workspace: string }) {
  const json = JSON.stringify({ mcpServers: { openarch: { command: 'openarch', args: ['mcp', '--dir', workspace] } } }, null, 2);
  return (
    <Stack spacing={2} sx={{ maxWidth: 900 }}>
      <Typography>
        The CLI for OpenArch has an MCP server: AI agents can query and manage this OpenArch as tools. Install the CLI first, so
        that the AI client finds it on the PATH:
      </Typography>
      <Code>{'brew install AlfrescoLabs/tap/openarch      # macOS and Linux\nscoop bucket add alfrescolabs https://github.com/AlfrescoLabs/scoop-bucket\nscoop install openarch                      # Windows'}</Code>
      <Typography variant="h6">Claude Code</Typography>
      <Code>{`claude mcp add openarch -- openarch mcp --dir ${workspace}`}</Code>
      <Typography variant="h6">Claude Desktop, Cursor and other MCP clients</Typography>
      <Typography variant="body2">Add this to the MCP configuration file of the client:</Typography>
      <Code>{json}</Code>
      <Typography variant="body2" color="text.secondary">
        The MCP server uses the admin of this workspace. Tools that delete data are off unless you add --allow-destructive.
      </Typography>
    </Stack>
  );
}
