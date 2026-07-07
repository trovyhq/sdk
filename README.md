# @taskflow/sdk

Typed REST client for TaskFlow. Used by:

- `@taskflow/cli` — terminal
- `@taskflow/mcp-server` — AI agents
- your scripts / CI jobs

## Install

```bash
pnpm add @taskflow/sdk
```

## Quick start

```ts
import { TaskFlowClient } from '@taskflow/sdk';

const tf = new TaskFlowClient({
  apiUrl: 'https://api.taskflow.app',
  token: process.env.TASKFLOW_TOKEN!, // tfp_…
});

const me = await tf.whoami();
console.log('Bonjour', me.user.name);

const { task } = await tf.resolveTaskRef('TF-12');
console.log(task.title, task.status);

await tf.moveTask(task.id, 'IN_REVIEW');
await tf.addComment(task.id, '🚀 Auto via CI');
```

## Auth

Generate a personal-access token from `/settings/api-tokens` in the TaskFlow web UI.
Pass it as `Authorization: Bearer <token>` (handled automatically by the client).

The token is hashed (SHA-256) server-side. The plaintext is shown only once.

## Error handling

The client throws `TaskFlowError` with:

- `status` — HTTP code (0 = network/timeout)
- `message` — server error message or `HTTP <n>`
- `body` — parsed JSON response, if any

```ts
try {
  await tf.moveTask(id, 'DONE');
} catch (e) {
  if (e instanceof TaskFlowError) {
    if (e.status === 404) console.error('Task introuvable');
    else if (e.status === 403) console.error('Pas les droits');
    else throw e;
  }
}
```

## License

MIT
