import assert from 'node:assert/strict';
import test from 'node:test';

import { TrovyClient } from '../dist/index.js';

function response(body, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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
  id: 'clproject000000000000001',
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

test('adapts the current API response envelopes and routes', async () => {
  const routes = new Map([
    ['GET /api/v1/projects', () => response([project])],
    ['GET /api/v1/projects/clproject000000000000001/tasks', () => response([task])],
    ['GET /api/v1/inbox/tasks', () => response([task])],
    ['GET /api/v1/notifications', () => response({ items: [], unreadCount: 3 })],
    ['POST /api/v1/tasks/cltask000000000000000001/status', (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), { status: 'DONE' });
      return response({ ...task, status: 'DONE' });
    }],
    ['POST /api/v1/tasks/cltask000000000000000001/comments', (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), { body: 'Ready for review' });
      return response({
        id: 'clcomment00000000000001',
        body: 'Ready for review',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        author: { id: 'cluser00000000000000001', name: 'Ada' },
      });
    }],
    ['POST /api/v1/notifications/read-all', () => response({ updated: 3 })],
  ]);
  const client = createClient(routes);

  assert.deepEqual(await client.listProjects(), { projects: [project] });
  assert.equal((await client.listTasks(project.id)).tasks[0].creatorId, task.createdBy);
  assert.equal((await client.listMyAssignedTasks()).tasks[0].number, task.sequence);
  assert.deepEqual(await client.listNotifications(), { notifications: [], unreadCount: 3 });
  assert.equal((await client.moveTask(task.id, 'DONE')).task.status, 'DONE');
  assert.equal((await client.addComment(task.id, 'Ready for review')).comment.content, 'Ready for review');
  assert.deepEqual(await client.markAllNotificationsRead(), { success: true });
});
