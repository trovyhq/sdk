/**
 * @taskflow/sdk — typed REST client for the TaskFlow API.
 *
 * Used by:
 *   - @taskflow/cli  (terminal)
 *   - @taskflow/mcp-server  (AI agents)
 *   - any user scripts or CI jobs
 *
 * Auth: pass `token: 'tfp_…'` once at construction. Every request goes out
 * with `Authorization: Bearer <token>`.
 *
 * Errors: the client throws `TaskFlowError` with `.status` (HTTP code) and
 * a human-readable `.message`. Callers can branch on `.status` for 401 vs
 * 404 vs 5xx.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskType = 'TASK' | 'BUG' | 'FEATURE' | 'IMPROVEMENT' | 'EPIC' | 'STORY';

export interface Project {
  id: string;
  name: string;
  key: string;
  color: string;
  description?: string | null;
  visibility: 'PRIVATE' | 'TEAM' | 'PUBLIC';
  githubRepoFullName?: string | null;
}

export interface User {
  id: string;
  email: string;
  name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface TaskAssignee {
  user: User;
}

export interface Task {
  id: string;
  number: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: Priority;
  type: TaskType;
  storyPoints?: number | null;
  estimateMinutes?: number | null;
  dueDate?: string | null;
  startDate?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  creatorId: string;
  githubIssueNumber?: number | null;
  githubIssueUrl?: string | null;
  githubPrUrl?: string | null;
  project: Pick<Project, 'id' | 'name' | 'key' | 'color'>;
  creator?: User;
  assignees: TaskAssignee[];
  labels: { label: Label }[];
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  editedAt?: string | null;
  author: User;
}

export interface SmartInbox {
  scope: 'all' | 'mine';
  generatedAt: string;
  counts: {
    awaitingReview: number;
    mentioned: number;
    assignedActive: number;
    recentlyDone: number;
    stale: number;
    total: number;
  };
  groups: {
    awaitingReview: Task[];
    mentioned: { task: Task; notification: { id: string; createdAt: string } }[];
    assignedActive: Task[];
    recentlyDone: Task[];
    stale: Task[];
  };
}

export interface MetricsSummary {
  cycleTimeHours: number;
  cycleTimeP50: number;
  cycleTimeP95: number;
  leadTimeHours: number;
  leadTimeP50: number;
  leadTimeP95: number;
  throughputPerWeek: number;
  completionRate: number;
  blockedRate: number;
  wipCount: number;
  staleCount: number;
  overdueCount: number;
  totalInRange: number;
  doneInRange: number;
  openTasks: number;
  blockedCount: number;
}

export interface Metrics {
  project: Pick<Project, 'id' | 'name' | 'key' | 'color'>;
  range: { days: number; from: string; to: string };
  summary: MetricsSummary;
  throughput: Array<{ weekStart: string; created: number; completed: number }>;
  cycleTimeDistribution: Array<{ bucket: string; count: number }>;
  leadTimeDistribution: Array<{ bucket: string; count: number }>;
  topShippers: Array<{ user: User; completed: number; storyPoints: number }>;
  bottlenecks: Array<{
    task: { id: string; title: string; number: number; key: string };
    blockedSince: string;
    blockedDays: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client options + error
// ─────────────────────────────────────────────────────────────────────────────

export interface ClientOptions {
  apiUrl: string;
  token: string;
  /** Override fetch (useful in tests). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 12 000. */
  timeoutMs?: number;
}

export class TaskFlowError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'TaskFlowError';
    this.status = status;
    this.body = body;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export class TaskFlowClient {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ClientOptions) {
    if (!opts.apiUrl) throw new Error('apiUrl is required');
    if (!opts.token) throw new Error('token is required');
    this.apiUrl = opts.apiUrl.replace(/\/$/, '');
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 12_000;
  }

  // ── Low-level request ─────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    init?: { query?: Record<string, unknown>; body?: unknown }
  ): Promise<T> {
    let url = `${this.apiUrl}${path}`;
    if (init?.query) {
      const qs = toQueryString(init.query);
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
    const body = init?.body !== undefined ? JSON.stringify(init.body) : undefined;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (e: any) {
      throw new TaskFlowError(
        e?.name === 'AbortError' ? `Request timeout after ${this.timeoutMs}ms` : e?.message ?? 'Network error',
        0
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const json = text ? safeJson(text) : undefined;

    if (!res.ok) {
      const message =
        (json as any)?.error && typeof (json as any).error === 'string'
          ? (json as any).error
          : `HTTP ${res.status}`;
      throw new TaskFlowError(message, res.status, json);
    }
    return json as T;
  }

  // ── Identity ─────────────────────────────────────────────────────────────

  whoami = (): Promise<{ user: User }> =>
    this.request('GET', '/api/auth/me');

  // ── Projects ─────────────────────────────────────────────────────────────

  listProjects(): Promise<{ projects: Project[] }> {
    return this.request('GET', '/api/projects');
  }

  getProject(id: string): Promise<{ project: Project }> {
    return this.request('GET', `/api/projects/${encodeURIComponent(id)}`);
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  /** `key` is the project key (e.g. "TF"). When supplied, both forms work. */
  resolveProjectKeyAndId(
    keyOrId: string
  ): Promise<{ id: string; project: Project }> {
    // We accept both keys ("TF") and ids. For keys, hit /api/projects then
    // match in-memory. For ids, pass through. Cheaper than two round-trips
    // would be a lookup endpoint, but for now this is plenty.
    if (looksLikeCuid(keyOrId)) {
      return this.getProject(keyOrId).then((p) => ({ id: p.project.id, project: p.project }));
    }
    return this.listProjects().then(({ projects }) => {
      const p = projects.find((x) => x.key.toUpperCase() === keyOrId.toUpperCase());
      if (!p) throw new TaskFlowError(`No project with key "${keyOrId}"`, 404);
      return { id: p.id, project: p };
    });
  }

  createTask(input: {
    projectId: string;
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: Priority;
    type?: TaskType;
    assigneeIds?: string[];
  }): Promise<{ task: Task }> {
    return this.request('POST', `/api/projects/${encodeURIComponent(input.projectId)}/tasks`, {
      body: input,
    });
  }

  /** List tasks in a project. Optional `status` and `assigneeId` filters. */
  listTasks(
    projectId: string,
    opts: { status?: TaskStatus; assigneeId?: string; limit?: number } = {}
  ): Promise<{ tasks: Task[] }> {
    return this.request(
      'GET',
      `/api/projects/${encodeURIComponent(projectId)}/tasks`,
      { query: opts as Record<string, unknown> }
    );
  }

  /** List tasks assigned to the current user across all their projects. */
  listMyAssignedTasks(opts: { status?: TaskStatus; limit?: number } = {}): Promise<{ tasks: Task[] }> {
    return this.request('GET', '/api/users/me/inbox', {
      query: opts as Record<string, unknown>,
    });
  }

  getTask(id: string): Promise<{ task: Task }> {
    return this.request('GET', `/api/tasks/${encodeURIComponent(id)}`);
  }

  /** Move a task to a new status. `order` is optional and defaults to "a0"
   *  (Kanban end of column). For drag-drop ordering, use a fractional key. */
  moveTask(id: string, status: TaskStatus, order?: string): Promise<{ task: Task }> {
    return this.request('POST', `/api/tasks/${encodeURIComponent(id)}/move`, {
      body: { status, order: order ?? 'a0' },
    });
  }

  addComment(taskId: string, content: string): Promise<{ comment: Comment }> {
    return this.request('POST', `/api/tasks/${encodeURIComponent(taskId)}/comments`, {
      body: { content },
    });
  }

  linkPr(taskId: string, prUrl: string): Promise<{ task: Task; pr: unknown }> {
    return this.request('POST', `/api/tasks/${encodeURIComponent(taskId)}/github/pr`, {
      body: { prUrl },
    });
  }

  /**
   * Resolve a `TF-12` style reference to `{ projectId, taskId, task }`.
   * Throws `TaskFlowError(404)` if either side is missing.
   */
  async resolveTaskRef(ref: string): Promise<{
    projectKey: string;
    projectId: string;
    taskId: string;
    task: Task;
  }> {
    const parsed = parseTaskRef(ref);
    if (!parsed) {
      throw new TaskFlowError(`Invalid task reference "${ref}" — expected something like "TF-12"`, 400);
    }
    const { id: projectId, project } = await this.resolveProjectKeyAndId(parsed.key);
    const tasksResp = await this.request<{ tasks: Task[] }>(
      'GET',
      `/api/projects/${encodeURIComponent(projectId)}/tasks`
    );
    const task = tasksResp.tasks.find((t) => t.number === parsed.number);
    if (!task) {
      throw new TaskFlowError(`Task ${ref} not found in project ${parsed.key}`, 404);
    }
    return {
      projectKey: project.key,
      projectId,
      taskId: task.id,
      task,
    };
  }

  // ── Search & inbox ───────────────────────────────────────────────────────

  search(q: string, limit = 10): Promise<{
    projects: Project[];
    tasks: Task[];
    users: User[];
  }> {
    return this.request('GET', '/api/search', { query: { q, limit } });
  }

  smartInbox(scope: 'all' | 'mine' = 'all'): Promise<SmartInbox> {
    return this.request('GET', '/api/inbox/smart', { query: { scope } });
  }

  // ── Metrics ──────────────────────────────────────────────────────────────

  metrics(projectIdOrKey: string, rangeDays: 7 | 30 | 90 = 30): Promise<Metrics> {
    const range = `${rangeDays}d`;
    // Accept either form — the backend doesn't care, just projectId in URL.
    return this.resolveProjectKeyAndId(projectIdOrKey).then(({ id }) =>
      this.request('GET', `/api/projects/${encodeURIComponent(id)}/metrics`, { query: { range } })
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (also exported for CLI / MCP use)
// ─────────────────────────────────────────────────────────────────────────────

/** Parse `TF-12`, `[TF-12]`, `tf-12` → `{ key, number }` or null. */
export function parseTaskRef(ref: string): { key: string; number: number } | null {
  if (!ref) return null;
  const m = ref.trim().match(/^\[?([A-Z][A-Z0-9]{1,4})-(\d+)\]?$/i);
  if (!m || !m[1] || !m[2]) return null;
  return { key: m[1].toUpperCase(), number: Number(m[2]) };
}

/** Render a task reference. */
export function formatTaskRef(projectKey: string, number: number, bracketed = false): string {
  const body = `${projectKey.toUpperCase()}-${number}`;
  return bracketed ? `[${body}]` : body;
}

/** Approximate CUID shape check (avoids paying for a real lookup when the
 *  caller probably already has an id). */
function looksLikeCuid(s: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(s);
}

function toQueryString(q: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join('&');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
