import assert from 'node:assert/strict';
import test from 'node:test';

import { TrovyClient, TrovyError } from '../dist/index.js';

function response(body, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function success(data, status = 200) {
  return response(
    {
      success: true,
      statusCode: status,
      data,
      timestamp: '2026-09-02T00:00:00.000Z',
    },
    status
  );
}

function createClient(routes) {
  return new TrovyClient({
    apiUrl: 'https://api.example.test',
    token: 'test-token',
    fetch: async (url, init) => {
      const key = `${init.method} ${new URL(url).pathname}`;
      const handler = routes.get(key);
      assert.ok(handler, `Unexpected request: ${key}`);
      return handler(url, init);
    },
  });
}

const project = {
  id: '8853e57a-68eb-42a6-b6af-6f3e7b5c684d',
  key: 'TF',
  name: 'Trovy',
  color: '#000000',
  visibility: 'TEAM',
};

const task = {
  id: 'cltask000000000000000001',
  sequence: 1,
  title: 'Contract test',
  status: 'TODO',
  priority: 'MEDIUM',
  type: 'TASK',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  projectId: project.id,
  createdBy: 'cluser00000000000000001',
  project,
  assignees: [],
  labels: [],
};

const dependency = {
  id: 'a3db3b75-ae37-4f60-a94a-0bf06db45a3c',
  sourceTaskId: 'cltask000000000000000000',
  targetTaskId: task.id,
  type: 'BLOCKS',
  createdBy: 'cluser00000000000000001',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

test('adapts the current API response envelopes and routes', async () => {
  const routes = new Map([
    ['GET /api/v1/projects', () => success([project])],
    [`GET /api/v1/projects/${project.id}`, () => success(project)],
    [`GET /api/v1/projects/${project.id}/tasks`, () => success([task])],
    [`GET /api/v1/tasks/${task.id}/dependencies`, () => success([dependency])],
    ['GET /api/v1/inbox/tasks', () => success([task])],
    ['GET /api/v1/notifications', () => success({ items: [], unreadCount: 3 })],
    ['POST /api/v1/tasks/cltask000000000000000001/status', (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), { status: 'DONE' });
      return success({ ...task, status: 'DONE' });
    }],
    ['POST /api/v1/tasks/cltask000000000000000001/comments', (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), { body: 'Ready for review' });
      return success({
        id: 'clcomment00000000000001',
        body: 'Ready for review',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        author: { id: 'cluser00000000000000001', name: 'Ada' },
      });
    }],
    [`POST /api/v1/projects/${project.id}/tasks`, (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), { title: 'Create with a UUID project id' });
      return success(task);
    }],
    ['POST /api/v1/notifications/read-all', () => success({ updated: 3 })],
  ]);
  const client = createClient(routes);

  assert.deepEqual(await client.listProjects(), { projects: [project] });
  assert.equal((await client.resolveProjectKeyAndId(project.id)).id, project.id);
  assert.equal(
    (await client.createTask({ projectId: project.id, title: 'Create with a UUID project id' })).task.id,
    task.id
  );
  assert.equal((await client.listTasks(project.id)).tasks[0].creatorId, task.createdBy);
  assert.equal((await client.listDependencies(task.id))[0].sourceTaskId, dependency.sourceTaskId);
  assert.equal((await client.listMyAssignedTasks()).tasks[0].number, task.sequence);
  assert.deepEqual(await client.listNotifications(), { notifications: [], unreadCount: 3 });
  assert.equal((await client.moveTask(task.id, 'DONE')).task.status, 'DONE');
  assert.equal((await client.addComment(task.id, 'Ready for review')).comment.content, 'Ready for review');
  assert.deepEqual(await client.markAllNotificationsRead(), { success: true });
});

test('maps the current API error envelope to TrovyError', async () => {
  const client = createClient(
    new Map([
      [
        'GET /api/v1/projects',
        () =>
          response(
            {
              success: false,
              statusCode: 401,
              code: 'UNAUTHORIZED',
              message: 'Invalid API token',
              timestamp: '2026-09-02T00:00:00.000Z',
            },
            401
          ),
      ],
    ])
  );

  await assert.rejects(
    client.listProjects(),
    (error) => error instanceof TrovyError && error.status === 401 && error.message === 'Invalid API token'
  );
});
