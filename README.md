# Docker Extension for OpenArch

> [!IMPORTANT]
> **Not an official Hyland product.** The Docker Extension for OpenArch is not Hyland OpenArch. It is in the [AlfrescoLabs](https://github.com/AlfrescoLabs) organization on GitHub because Hyland does not officially support it. Hyland OpenArch itself is at [github.com/hyland/OpenArch](https://github.com/hyland/OpenArch).

Start [Hyland OpenArch](https://github.com/Hyland/OpenArch) on your machine with one click, and see what it does.

Hyland OpenArch is an open source data layer for AI. It stores documents, metadata, permissions and embeddings,
and it answers queries with the documents that the caller may read. This extension shows that with three demo
users: the same query gives each user different documents.

<p align="center">
  <img alt="Try it: the same query as the admin, alice, bob and carol gives 10, 6, 6 and 2 documents" src="docs/screenshots/try-it-light.png#gh-light-mode-only" width="800">
  <img alt="Try it: the same query as the admin, alice, bob and carol gives 10, 6, 6 and 2 documents" src="docs/screenshots/try-it-dark.png#gh-dark-mode-only" width="800">
</p>

## What it does

- Starts the OpenArch REST API, with MongoDB and OpenSearch, and shows the health of each service.
- Lets you choose the OpenArch version: the recommended one, the latest one, or any tag.
- Optional demo: three users (alice, bob and carol), and sample documents with different read access. The
  "Try it" tab runs one query as the admin and each demo user, side by side. A question finds the documents
  nearest in meaning, with vectors made by a local model on Docker Model Runner, and follows the same rules.
- Opens the Swagger UI, and shows the admin login.
- Shows how to connect AI clients, such as Claude Code, through the MCP server of the
  [CLI for OpenArch](https://github.com/AlfrescoLabs/openarch-cli).

The extension runs the CLI for OpenArch, which is bundled in it. You do not need to install the CLI.

## Requirements

- Docker Desktop 4.10 or later, with about 4 GB of memory for Docker. The first start pulls about 2 GB.
- A free port, 8080 by default.

## Install

The Docker Extensions Marketplace does not take new extensions at the moment, so you install this one yourself:

1. In Docker Desktop, open Settings, then Extensions. Turn on "Enable Docker Extensions".
2. On the same page, turn off "Only allow extensions distributed through the Docker Marketplace".
3. Run:

   ```
   docker extension install angelborroy/openarch-extension
   ```

The setting in step 2 lets Docker Desktop install extensions that Docker did not review. Turn it on again after
the install if you want. Your company can lock this setting: then use the CLI instead (see
[Without the extension](#without-the-extension)).

Docker Desktop does not tell you about updates of extensions installed this way. The extension shows a notice
when a new version exists. To update, run:

```
docker extension update angelborroy/openarch-extension
```

## Use

1. Open the OpenArch Community tab in Docker Desktop.
2. Choose "OpenArch only (REST API)" or "OpenArch + demo", and the version. "Advanced options" has the port,
   the memory, OpenSearch Dashboards, open MongoDB and OpenSearch ports, and the users bundled in the OpenArch
   image.
3. Click Start. The page shows the state until OpenArch is healthy.
4. With the demo, open "Try it" and click "Load sample data".

All three users are in the group `members`. carol is in no other group.

| Folder | Who can read it | Documents |
| --- | --- | --- |
| `/Demo/Public` | every user (group `members`) | Holiday calendar 2026, Office Wi-Fi guide |
| `/Demo/Public/Facilities` | bob only: it blocks what it inherits | Office move plan |
| `/Demo/HR` | group `demo-hr` (alice) | Salary bands 2026, Hiring plan Q1 2027 |
| `/Demo/HR/Reviews` | inherits from `/Demo/HR` | Review calendar 2027 |
| `/Demo/Finance` | group `demo-finance` (bob) | Budget forecast 2027, Travel policy 2027 (also alice), Contractor rates 2027 (alice's access ended on 2026-01-01) |
| `/Demo/Board` | administrators only | Merger proposal |

The admin sees 10 documents, alice 6, bob 6 and carol 2. "Who can read this?" shows the users and groups
that may read a document, without access that has ended.

"Load sample data" also stores a vector for each document when Docker Model Runner can make it. Then "Ask"
finds the documents nearest in meaning to a question, for each user: for "How much is the pay for each job
level?", alice gets the salary bands first, and bob never gets them. Questions need Docker Model Runner with
host TCP access and the embedding model:

```
docker desktop enable model-runner --tcp 12434
docker model pull ai/mxbai-embed-large
```

Without them, "Load sample data" loads the documents without vectors and says why.

The options apply when OpenArch starts the first time. To change them, use "Remove everything" and start again.
Only the version can change later: "Change version" makes a backup first, so that you can go back.

## Screenshots

<img alt="Setup: the checks, the demo mode and the version" src="docs/screenshots/setup-light.png#gh-light-mode-only" width="800">
<img alt="Setup: the checks, the demo mode and the version" src="docs/screenshots/setup-dark.png#gh-dark-mode-only" width="800">

<img alt="Dashboard: the health of each service, the links and the login" src="docs/screenshots/dashboard-light.png#gh-light-mode-only" width="800">
<img alt="Dashboard: the health of each service, the links and the login" src="docs/screenshots/dashboard-dark.png#gh-dark-mode-only" width="800">

<img alt="Try it: a question finds the nearest documents that each user may read" src="docs/screenshots/try-it-question-light.png#gh-light-mode-only" width="800">
<img alt="Try it: a question finds the nearest documents that each user may read" src="docs/screenshots/try-it-question-dark.png#gh-dark-mode-only" width="800">

<img alt="Connect AI: the MCP setup for AI clients" src="docs/screenshots/connect-ai-light.png#gh-light-mode-only" width="800">
<img alt="Connect AI: the MCP setup for AI clients" src="docs/screenshots/connect-ai-dark.png#gh-dark-mode-only" width="800">

The screenshots are made with `scripts/screenshots` (Playwright, real data, passwords masked).

## Files

| Folder | Content |
| --- | --- |
| `~/.openarch/openarch-desktop` | The workspace: `openarch.yaml`, the passwords in `.env.local`, and the Compose files |
| `~/.openarch/openarch-desktop-config` | The connections (contexts) and the passwords of the demo users |

The data is in Docker volumes named `openarch-desktop_*`. "Remove everything" deletes the containers, the
volumes and both folders.

The CLI for OpenArch can use the same workspace, for example `openarch status --dir ~/.openarch/openarch-desktop`.

## Without the extension

The CLI for OpenArch does the same in a terminal:

```
brew install AlfrescoLabs/tap/openarch        # or Scoop on Windows, see the CLI README
openarch init --dir my-openarch
openarch demo users --dir my-openarch
openarch up --dir my-openarch
openarch demo load --dir my-openarch
```

## Development

Needs Go, Node.js 22 and Docker.

```
make cli-local         # build the bundled CLI from ../openarch-cli (or CLI_SRC=<path>)
make cli-release       # or: download and check the release CLI_VERSION (needs cosign)
make test              # Go and UI tests
make build install     # build the image and install the extension
make update            # install a new build
make debug             # open the DevTools of the extension UI
```

- `host/` is `openarch-dd`, a small Go helper that Docker Desktop runs on the host. Docker Desktop passes the
  arguments of a host binary through a shell with no quoting, so the UI sends them as one base64url string.
  The helper decodes them, sets the workspace and config folders, and runs the bundled `openarch`.
- `ui/` is the React UI. `ui/src/cli.ts` is the only code that runs commands.

## License

[Apache License 2.0](LICENSE)
