/**
 * @taskflowapp/sdk — typed REST client for the TaskFlow API.
 *
 * Used by:
 *   - @taskflowapp/cli  (terminal)
 *   - @taskflowapp/mcp-server  (AI agents)
 *   - any user scripts or CI jobs
 *
 * Auth: pass `token: 'tfp_…'` once at construction. Every request goes out
 * with `Authorization: Bearer <token>`.
 *
 * Errors: the client throws `TaskFlowError` with `.status` (HTTP code) and
 * a human-readable `.message`. Callers can branch on `.status` for 401 vs
 * 404 vs 5xx.
 *
 * Versioning: this is v0.2.0 — adds recurrence, dependencies, time entries,
 * task sharing, bulk actions, notifications, and full task detail
 * (comments, attachments, checklists, time entries).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums + base types
// ─────────────────────────────────────────────────────────────────────────────

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskType = 'TASK' | 'BUG' | 'FEATURE' | 'IMPROVEMENT' | 'EPIC' | 'STORY';
export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_MENTIONED'
  | 'TASK_COMMENTED'
  | 'TASK_STATUS_CHANGED'
  | 'PR_LINKED'
  | 'PR_MERGED';

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

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  order: number;
}

export interface Attachment {
  id: string;
  url: string;
  name: string;
  size?: number | null;
  mimeType?: string | null;
  createdAt: string;
  uploader?: Pick<User, 'id' | 'name' | 'avatarUrl'>;
}

export interface TimeEntry {
  id: string;
  minutes: number;
  description?: string | null;
  startedAt: string;
  createdAt: string;
  user?: Pick<User, 'id' | 'name' | 'avatarUrl'>;
}

export interface RecurrenceRule {
  id: string;
  taskId: string;
  frequency: RecurrenceFreq;
  /** WEEKLY: array of weekday numbers (0=Sun..6=Sat). MONTHLY: day-of-month. */
  byDay: number[];
  /** UTC hour-of-day when new instances spawn (0..23). */
  hourOfDay: number;
  endsAt?: string | null;
  lastSpawnedAt?: string | null;
  nextSpawnAt: string;
  createdAt: string;
}

/** The related-task summary shape returned by the dependencies endpoint. */
export interface RelatedTask {
  id: string;
  number: number;
  title: string;
  status: TaskStatus;
  project: Pick<Project, 'id' | 'key' | 'color'>;
}

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnId: string;
  /** The task we're blocked by (when listing `blockedBy`). */
  dependsOn?: RelatedTask;
  /** The task we're blocking (when listing `blocks`). */
  task?: RelatedTask;
  createdAt: string;
}

export interface TaskShare {
  token: string;
  url: string;
  expiresInDays: number;
}

export type BulkAction = 'setStatus' | 'setPriority' | 'delete';

export interface BulkInput {
  taskIds: string[];
  action: BulkAction;
  payload?: {
    status?: TaskStatus;
    priority?: Priority;
  };
}

export interface BulkFailure {
  id: string;
  error: string;
}

export interface BulkResult {
  ok: true;
  action: BulkAction;
  processed: number;
  failed: number;
  failures: BulkFailure[];
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  readAt?: string | null;
  createdAt: string;
  data?: Record<string, unknown> | null;
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

  /** Exposed for tooling (e.g. CLI `--open` to build the web URL). */
  getApiUrl(): string {
    return this.apiUrl;
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

  /** Search users by username/name/email — used for @mention autocomplete. */
  searchUsers(q: string): Promise<{ users: User[] }> {
    return this.request('GET', '/api/users/search', { query: { q } });
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  listProjects(): Promise<{ projects: Project[] }> {
    return this.request('GET', '/api/projects');
  }

  getProject(id: string): Promise<{ project: Project }> {
    return this.request('GET', `/api/projects/${encodeURIComponent(id)}`);
  }

  /** Fetch all labels defined in a project. */
  listProjectLabels(projectId: string): Promise<{ labels: Label[] }> {
    return this.request('GET', `/api/projects/${encodeURIComponent(projectId)}/labels`);
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
    labelIds?: string[];
    dueDate?: string;
    startDate?: string;
    estimateMinutes?: number;
    storyPoints?: number;
    parentId?: string;
  }): Promise<{ task: Task }> {
    return this.request('POST', `/api/projects/${encodeURIComponent(input.projectId)}/tasks`, {
      body: input,
    });
  }

  /** List tasks in a project. Optional `status`, `assigneeId`, `labelId`, `search` filters. */
  listTasks(
    projectId: string,
    opts: { status?: TaskStatus; assigneeId?: string; labelId?: string; search?: string; limit?: number } = {}
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

  /** Full task detail (comments, attachments, time entries, checklists, children). */
  getTask(id: string): Promise<{ task: TaskWithDetail }> {
    return this.request('GET', `/api/tasks/${encodeURIComponent(id)}`);
  }

  /** Patch a task. Any subset of fields accepted by CreateTaskSchema. */
  updateTask(
    id: string,
    patch: Partial<{
      title: string;
      description: string | null;
      status: TaskStatus;
      priority: Priority;
      type: TaskType;
      assigneeIds: string[];
      labelIds: string[];
      dueDate: string | null;
      startDate: string | null;
      estimateMinutes: number | null;
      storyPoints: number | null;
      order: string;
    }>
  ): Promise<{ task: Task }> {
    return this.request('PATCH', `/api/tasks/${encodeURIComponent(id)}`, { body: patch });
  }

  deleteTask(id: string): Promise<{ success: true }> {
    return this.request('DELETE', `/api/tasks/${encodeURIComponent(id)}`);
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

  // ── Recurrence ───────────────────────────────────────────────────────────

  /** Get the current recurrence rule for a task (or `{ rule: null }`). */
  getRecurrence(taskId: string): Promise<{ rule: RecurrenceRule | null }> {
    return this.request('GET', `/api/tasks/${encodeURIComponent(taskId)}/recurrence`);
  }

  /** Set or replace a task's recurrence rule. Returns the new rule. */
  setRecurrence(
    taskId: string,
    opts: {
      frequency: RecurrenceFreq;
      /** WEEKLY: 0..6 (Sun..Sat). MONTHLY: day-of-month (1..31). */
      byDay?: number[];
      /** UTC hour-of-day for spawn (0..23). Default 9. */
      hourOfDay?: number;
      /** ISO datetime — spawns stop once `now > endsAt`. */
      endsAt?: string | null;
    }
  ): Promise<{ rule: RecurrenceRule }> {
    return this.request('POST', `/api/tasks/${encodeURIComponent(taskId)}/recurrence`, { body: opts });
  }

  /** Remove a task's recurrence rule. */
  removeRecurrence(taskId: string): Promise<{ ok: true }> {
    return this.request('DELETE', `/api/tasks/${encodeURIComponent(taskId)}/recurrence`);
  }

  // ── Dependencies ─────────────────────────────────────────────────────────

  /** List tasks blocked-by this one + tasks this one blocks. */
  listDependencies(taskId: string): Promise<{
    blockedBy: TaskDependency[];
    blocks: TaskDependency[];
  }> {
    return this.request('GET', `/api/tasks/${encodeURIComponent(taskId)}/dependencies`);
  }

  /** Add a blocker: `taskId` becomes blocked-by `dependsOnId`. Throws 400 on cycle. */
  addDependency(taskId: string, dependsOnId: string): Promise<{ dependency: TaskDependency }> {
    return this.request('POST', `/api/tasks/${encodeURIComponent(taskId)}/dependencies`, {
      body: { dependsOnId },
    });
  }

  removeDependency(taskId: string, dependsOnId: string): Promise<{ ok: true }> {
    return this.request(
      'DELETE',
      `/api/tasks/${encodeURIComponent(taskId)}/dependencies`,
      { query: { dependsOnId } }
    );
  }

  // ── Time tracking ────────────────────────────────────────────────────────

  /** List time entries on a task. */
  listTimeEntries(taskId: string): Promise<{ entries: TimeEntry[]; total: number }> {
    return this.request('GET', `/api/tasks/${encodeURIComponent(taskId)}/time`);
  }

  /** Log time against a task. `minutes` is required. */
  logTime(
    taskId: string,
    input: { minutes: number; description?: string; startedAt?: string }
  ): Promise<{ entry: TimeEntry }> {
    return this.request('POST', `/api/tasks/${encodeURIComponent(taskId)}/time`, { body: input });
  }

  // ── Sharing ──────────────────────────────────────────────────────────────

  /** Create (or refresh) a public share token for a task. Returns the token + URL. */
  shareTask(taskId: string): Promise<TaskShare> {
    return this.request('POST', `/api/tasks/${encodeURIComponent(taskId)}/share`);
  }

  /** Note: TaskFlow uses stateless JWT shares. Revoke requires JWT_SECRET rotation. */
  revokeTaskShare(taskId: string): Promise<{ ok: true; note: string }> {
    return this.request('DELETE', `/api/tasks/${encodeURIComponent(taskId)}/share`);
  }

  // ── Bulk ─────────────────────────────────────────────────────────────────

  /**
   * Apply an action to many tasks at once (max 200 per call).
   * For `setStatus` and `setPriority`, set the matching field in `payload`.
   */
  bulkUpdate(input: BulkInput): Promise<BulkResult> {
    return this.request('POST', '/api/tasks/bulk', { body: input });
  }

  // ── Notifications ────────────────────────────────────────────────────────

  listNotifications(): Promise<{ notifications: Notification[]; unreadCount: number }> {
    return this.request('GET', '/api/notifications');
  }

  markNotificationRead(id: string): Promise<{ success: true }> {
    return this.request('PATCH', '/api/notifications', { body: { id } });
  }

  markAllNotificationsRead(): Promise<{ success: true }> {
    return this.request('PATCH', '/api/notifications', { body: { markAllRead: true } });
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

  // ── Reference resolution ─────────────────────────────────────────────────

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
}

// ─────────────────────────────────────────────────────────────────────────────
// Extended task shape (returned by getTask only)
// ─────────────────────────────────────────────────────────────────────────────

/** A `Task` plus the relations the full-detail endpoint includes. */
export interface TaskWithDetail extends Task {
  checklists: ChecklistItem[];
  children: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    order: string;
    priority: Priority;
    assignees: { user: Pick<User, 'id' | 'name' | 'avatarUrl'> }[];
  }>;
  comments: Comment[];
  attachments: Attachment[];
  timeEntries: TimeEntry[];
  _count: { comments: number; attachments: number; timeEntries: number; children: number };
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

/**
 * Resolve a task reference like "TF-12" against an explicit project + number.
 * Mirrors `parseTaskRef` but accepts the parts separately, which the CLI uses
 * after a project-scoped lookup.
 */
export function buildTaskRef(projectKey: string, number: number, bracketed = false): string {
  return formatTaskRef(projectKey, number, bracketed);
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