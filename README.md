# @trovyhq/sdk

Typed REST client for Trovy. Used by:

- `@trovyhq/cli` — terminal
- `@trovyhq/mcp-server` — AI agents
- your scripts / CI jobs

## Install

```bash
pnpm add @trovyhq/sdk
```

## Quick start

```ts
import { TrovyClient } from '@trovyhq/sdk';

const client = new TrovyClient({
  apiUrl: 'https://api.trovy.app',
  token: process.env.TROVY_TOKEN!, // tfp_…
});

const me = await client.whoami();
console.log('Bonjour', me.user.name);

const { task } = await client.resolveTaskRef('TF-12');
console.log(task.title, task.status);

await client.moveTask(task.id, 'IN_REVIEW');
await client.addComment(task.id, '🚀 Auto via CI');
```

## Auth

Generate a personal-access token from `/settings/api-tokens` in the Trovy web UI.
Pass it as `Authorization: Bearer <token>` (handled automatically by the client).

The token is hashed (SHA-256) server-side. The plaintext is shown only once.

## Error handling

The client throws `TrovyError` with:

- `status` — HTTP code (0 = network/timeout)
- `message` — server error message or `HTTP <n>`
- `body` — parsed JSON response, if any

```ts
try {
  await client.moveTask(id, 'DONE');
} catch (e) {
  if (e instanceof TrovyError) {
    if (e.status === 404) console.error('Task introuvable');
    else if (e.status === 403) console.error('Pas les droits');
    else throw e;
  }
}
```

## Migration from 0.x (@taskflowapp/sdk)

If you were on `@taskflowapp/sdk@0.2.x`:

1. `npm uninstall @taskflowapp/sdk && npm install @trovyhq/sdk@^1.0.0`
2. Replace `TaskFlowClient` with `TrovyClient` (or import the alias which throws a deprecation warning)
3. Replace `TaskFlowError` with `TrovyError`
4. Update API URL from `taskflow.app` to `trovy.app`

The CLI and MCP server have been renamed in lockstep — install `@trovyhq/cli` and `@trovyhq/mcp-server` instead of the `@taskflowapp/*` versions.

## License

MIT