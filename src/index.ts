/**
 * @trovyhq/sdk — typed REST client for the Trovy API.
 *
 * Used by:
 *   - @trovyhq/cli  (terminal)
 *   - @trovyhq/mcp-server  (AI agents)
 *   - any user scripts or CI jobs
 *
 * Auth: pass `token: 'tfp_…'` once at construction. Every request goes out
 * with `Authorization: Bearer <token>`.
 *
 * Errors: the client throws `TrovyError` with `.status` (HTTP code) and
 * a human-readable `.message`. Callers can branch on `.status` for 401 vs
 * 404 vs 5xx.
 *
 * Versioning: this is v1.0.0 — initial stable release of the rebrand.
 *   - Renamed from @taskflowapp/sdk to @trovyhq/sdk (product renamed to Trovy)
 *   - `TaskFlowClient` → `TrovyClient`, `TaskFlowError` → `TrovyError`
 *   - See https://app.trovy.app/docs/migration for upgrading from 0.x
 *
 * Origin header on mutating requests (since 0.2.1):
 *   The SDK sends an `Origin` header on POST/PATCH/PUT/DELETE so the API's
 *   CSRF middleware stops rejecting write calls from any caller. See TF-16.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Enums + base types
// ─────────────────────────────────────────────────────────────────────────────

/** HTTP methods that are guaranteed not to mutate state on the server.
 *  We only attach the `Origin` header to mutating requests (see `request`). */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Public origin of the versioned Trovy REST API. */
export const DEFAULT_API_URL = 'https://api.trovy.app';
const API_PREFIX = '/api/v1';

export type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED' | 'CANCELLED';
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
  /** The task that blocks `targetTaskId`. */
  sourceTaskId: string;
  /** The task blocked by `sourceTaskId`. */
  targetTaskId: string;
  type: 'BLOCKS';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
  /**
   * Trovy API origin. Defaults to the hosted, versioned Trovy API.
   * Set this only for a self-hosted or local development deployment.
   */
  apiUrl?: string;
  token: string;
  /** Override fetch (useful in tests). Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 12 000. */
  timeoutMs?: number;
  /**
   * Optional Origin sent on mutating requests (POST/PATCH/PUT/DELETE).
   *
   * In production, the Trovy API checks the Origin header against
   * `NEXT_PUBLIC_APP_URL` as a CSRF defense (the server-side middleware also
   * exempts Bearer-authenticated requests, so this is defense-in-depth). It
   * still matters for:
   *   - Any non-Bearer auth path that gets re-tightened later
   *   - Browser-side SDK consumers (e.g. a docs page that wires the SDK
   *     into a React app served from a different origin)
   *
   * If unset, defaults to `apiUrl`. For the hosted deployment, callers that
   * need an Origin header should set this to `https://app.trovy.app`.
   *
   * For a split-host deployment, pass the web application origin explicitly:
   *
   *   new TrovyClient({
   *     apiUrl:  'https://api.trovy.app',
   *     token,
   *     origin:  'https://app.trovy.app',
   *   })
   */
  origin?: string;
}

export class TrovyError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'TrovyError';
    this.status = status;
    this.body = body;
  }
}

/**
 * @deprecated Use `TrovyError` instead. Alias kept for one major version
 * to help SDK 0.x users migrate to 1.x without an immediate breakage.
 */
export const TaskFlowError = TrovyError;

// ─────────────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────────────

export class TrovyClient {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly origin: string;

  constructor(opts: ClientOptions) {
    if (!opts.token) throw new Error('token is required');
    this.apiUrl = (opts.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, '');
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 12_000;
    // API consumers normally use Bearer authentication, which is exempt from
    // browser CSRF checks. Browser consumers on a split deployment can set
    // this explicitly to the public app URL.
    this.origin = (opts.origin ?? this.apiUrl).replace(/\/$/, '');
  }

  /** Exposed for tooling (e.g. CLI `--open` to build the web URL). */
  getApiUrl(): string {
    return this.apiUrl;
  }

  /** The Origin header that will be sent on mutating requests. */
  getOrigin(): string {
    return this.origin;
  }

  // ── Low-level request ─────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    init?: { query?: Record<string, unknown>; body?: unknown }
  ): Promise<T> {
    let url = `${this.apiUrl}${toVersionedApiPath(path)}`;
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
    // CSRF defense-in-depth: send Origin on mutating requests so the API's
    // CSRF middleware (which checks Origin against NEXT_PUBLIC_APP_URL) passes
    // even before the Bearer-auth bypass kicks in. Safe methods don't need it.
    if (!SAFE_METHODS.has(method.toUpperCase())) {
      headers['Origin'] = this.origin;
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (e: any) {
      throw new TrovyError(
        e?.name === 'AbortError' ? `Request timeout after ${this.timeoutMs}ms` : e?.message ?? 'Network error',
        0
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    const json = text ? safeJson(text) : undefined;

    if (!res.ok) {
      const message = errorMessage(json) ?? `HTTP ${res.status}`;
      throw new TrovyError(message, res.status, json);
    }
    return unwrapSuccessEnvelope<T>(json);
  }

  // ── Identity ─────────────────────────────────────────────────────────────

  async whoami(): Promise<{ user: User }> {
    const result = await this.request<User | { user: User }>('GET', '/api/users/me');
    return { user: unwrapObject(result, 'user') };
  }

  /** Search users by username/name/email — used for @mention autocomplete. */
  async searchUsers(q: string): Promise<{ users: User[] }> {
    const result = await this.search(q);
    return { users: result.users };
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects(): Promise<{ projects: Project[] }> {
    const result = await this.request<Project[] | { projects: Project[] }>('GET', '/api/projects');
    return { projects: unwrapArray(result, 'projects').map(normalizeProject) };
  }

  async getProject(id: string): Promise<{ project: Project }> {
    const result = await this.request<Project | { project: Project }>(
      'GET',
      `/api/projects/${encodeURIComponent(id)}`
    );
    return { project: normalizeProject(unwrapObject(result, 'project')) };
  }

  /** Fetch all labels defined in a project. */
  async listProjectLabels(projectId: string): Promise<{ labels: Label[] }> {
    const result = await this.request<Label[] | { labels: Label[] }>(
      'GET',
      `/api/projects/${encodeURIComponent(projectId)}/labels`
    );
    return { labels: unwrapArray(result, 'labels') };
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  /** `key` is the project key (e.g. "TF"). When supplied, both forms work. */
  resolveProjectKeyAndId(
    keyOrId: string
  ): Promise<{ id: string; project: Project }> {
    // We accept both keys ("TF") and ids. For keys, hit /api/projects then
    // match in-memory. For ids, pass through. Cheaper than two round-trips
    // would be a lookup endpoint, but for now this is plenty.
    if (looksLikeProjectId(keyOrId)) {
      return this.getProject(keyOrId).then((p) => ({ id: p.project.id, project: p.project }));
    }
    return this.listProjects().then(({ projects }) => {
      const p = projects.find((x) => x.key.toUpperCase() === keyOrId.toUpperCase());
      if (!p) throw new TrovyError(`No project with key "${keyOrId}"`, 404);
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
    const { projectId, ...body } = input;
    return this.request<Task | { task: Task }>('POST', `/api/projects/${encodeURIComponent(projectId)}/tasks`, {
      body,
    }).then((result) => ({ task: normalizeTask(unwrapObject(result, 'task')) }));
  }

  /** List tasks in a project. Optional `status`, `assigneeId`, `labelId`, `search` filters. */
  listTasks(
    projectId: string,
    opts: { status?: TaskStatus; assigneeId?: string; labelId?: string; search?: string; limit?: number } = {}
  ): Promise<{ tasks: Task[] }> {
    return this.request<Task[] | { tasks: Task[] }>(
      'GET',
      `/api/projects/${encodeURIComponent(projectId)}/tasks`,
      { query: opts as Record<string, unknown> }
    ).then((result) => ({ tasks: unwrapArray(result, 'tasks').map(normalizeTask) }));
  }

  /** List tasks assigned to the current user across all their projects. */
  listMyAssignedTasks(opts: { status?: TaskStatus; limit?: number } = {}): Promise<{ tasks: Task[] }> {
    return this.request<Task[] | { tasks: Task[] }>('GET', '/api/inbox/tasks', {
      query: opts as Record<string, unknown>,
    }).then((result) => ({ tasks: unwrapArray(result, 'tasks').map(normalizeTask) }));
  }

  /** Full task detail (comments, attachments, time entries, checklists, children). */
  getTask(id: string): Promise<{ task: TaskWithDetail }> {
    return this.request<TaskWithDetail | { task: TaskWithDetail }>('GET', `/api/tasks/${encodeURIComponent(id)}`)
      .then((result) => ({ task: normalizeTask(unwrapObject(result, 'task')) as TaskWithDetail }));
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
      rrule: string | null;
      rruleStart: string | null;
    }>
  ): Promise<{ task: Task }> {
    return this.request<Task | { task: Task }>('PATCH', `/api/tasks/${encodeURIComponent(id)}`, { body: patch })
      .then((result) => ({ task: normalizeTask(unwrapObject(result, 'task')) }));
  }

  deleteTask(id: string): Promise<{ success: true }> {
    return this.request<void>('DELETE', `/api/tasks/${encodeURIComponent(id)}`).then(() => ({ success: true }));
  }

  assignTask(taskId: string, assigneeId: string | null): Promise<{ task: Task }> {
    return this.request<Task | { task: Task }>('POST', `/api/tasks/${encodeURIComponent(taskId)}/assign`, {
      body: { assigneeId },
    }).then((result) => ({ task: normalizeTask(unwrapObject(result, 'task')) }));
  }

  /** Move a task to a new status. `order` is optional and defaults to "a0"
   *  (Kanban end of column). For drag-drop ordering, use a fractional key. */
  moveTask(id: string, status: TaskStatus, _order?: string): Promise<{ task: Task }> {
    return this.request<Task | { task: Task }>('POST', `/api/tasks/${encodeURIComponent(id)}/status`, {
      body: { status },
    }).then((result) => ({ task: normalizeTask(unwrapObject(result, 'task')) }));
  }

  addComment(taskId: string, content: string): Promise<{ comment: Comment }> {
    return this.request<Comment | { comment: Comment }>('POST', `/api/tasks/${encodeURIComponent(taskId)}/comments`, {
      body: { body: content },
    }).then((result) => ({ comment: normalizeComment(unwrapObject(result, 'comment')) }));
  }

  addChecklistItem(taskId: string, title: string): Promise<{ task: Task }> {
    return this.request<Task | { task: Task }>('POST', `/api/tasks/${encodeURIComponent(taskId)}/checklist`, {
      body: { title },
    }).then((result) => ({ task: normalizeTask(unwrapObject(result, 'task')) }));
  }

  updateChecklistItem(
    taskId: string,
    itemId: string,
    patch: { title?: string; completed?: boolean; order?: number }
  ): Promise<{ task: Task }> {
    return this.request<Task | { task: Task }>(
      'PATCH',
      `/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`,
      { body: patch }
    ).then((result) => ({ task: normalizeTask(unwrapObject(result, 'task')) }));
  }

  deleteChecklistItem(taskId: string, itemId: string): Promise<{ task: Task }> {
    return this.request<Task | { task: Task }>(
      'DELETE',
      `/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`
    ).then((result) => ({ task: normalizeTask(unwrapObject(result, 'task')) }));
  }

  linkPr(taskId: string, prUrl: string): Promise<{ link: unknown }> {
    return this.request<unknown>('POST', `/api/tasks/${encodeURIComponent(taskId)}/github/pr`, {
      body: { pullRequestUrl: prUrl },
    }).then((link) => ({ link }));
  }

  // ── Recurrence ───────────────────────────────────────────────────────────

  /** Get the current recurrence rule for a task (or `{ rule: null }`). */
  async getRecurrence(taskId: string): Promise<{ rule: RecurrenceRule | null }> {
    const { task } = await this.getTask(taskId);
    return { rule: recurrenceRuleFromTask(task) };
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
    const rrule = formatRRule(opts);
    return this.updateTask(taskId, { rrule, rruleStart: new Date().toISOString() })
      .then(({ task }) => {
        const rule = recurrenceRuleFromTask(task);
        if (!rule) throw new TrovyError('The API did not persist the recurrence rule', 502);
        return { rule };
      });
  }

  /** Remove a task's recurrence rule. */
  removeRecurrence(taskId: string): Promise<{ ok: true }> {
    return this.updateTask(taskId, { rrule: null, rruleStart: null }).then(() => ({ ok: true }));
  }

  // ── Dependencies ─────────────────────────────────────────────────────────

  /** List tasks blocked-by this one + tasks this one blocks. */
  listDependencies(taskId: string): Promise<TaskDependency[]> {
    return this.request<TaskDependency[] | { dependencies: TaskDependency[] }>(
      'GET',
      `/api/tasks/${encodeURIComponent(taskId)}/dependencies`
    ).then((result) => unwrapArray(result, 'dependencies'));
  }

  /** Add a blocker: `taskId` becomes blocked-by `dependsOnId`. Throws 400 on cycle. */
  addDependency(sourceTaskId: string, targetTaskId: string): Promise<{ dependency: TaskDependency }> {
    return this.request<TaskDependency | { dependency: TaskDependency }>(
      'POST',
      `/api/tasks/${encodeURIComponent(sourceTaskId)}/dependencies`,
      { body: { targetId: targetTaskId } }
    ).then((result) => ({ dependency: unwrapObject(result, 'dependency') }));
  }

  removeDependency(dependencyId: string): Promise<{ ok: true }> {
    return this.request<void>('DELETE', `/api/dependencies/${encodeURIComponent(dependencyId)}`)
      .then(() => ({ ok: true }));
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
    return this.request<TimeEntry | { entry: TimeEntry }>('POST', `/api/tasks/${encodeURIComponent(taskId)}/time`, { body: input })
      .then((result) => ({ entry: unwrapObject(result, 'entry') }));
  }

  // ── Sharing ──────────────────────────────────────────────────────────────

  /** Create (or refresh) a public share token for a task. Returns the token + URL. */
  shareTask(taskId: string): Promise<TaskShare> {
    return this.request<TaskShare>('POST', `/api/tasks/${encodeURIComponent(taskId)}/share-links`, { body: {} });
  }

  /** Note: Trovy uses stateless JWT shares. Revoke requires JWT_SECRET rotation. */
  revokeTaskShare(_taskId: string): Promise<{ ok: true; note: string }> {
    throw new TrovyError('A share-link id is required to revoke a task share link', 400);
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
    return this.request<{ items?: Notification[]; notifications?: Notification[]; unreadCount?: number }>(
      'GET',
      '/api/notifications'
    ).then((result) => ({
      notifications: result.items ?? result.notifications ?? [],
      unreadCount: result.unreadCount ?? 0,
    }));
  }

  markNotificationRead(id: string): Promise<{ success: true }> {
    return this.request('POST', `/api/notifications/${encodeURIComponent(id)}/read`).then(() => ({ success: true }));
  }

  markAllNotificationsRead(): Promise<{ success: true }> {
    return this.request('POST', '/api/notifications/read-all').then(() => ({ success: true }));
  }

  // ── Search & inbox ───────────────────────────────────────────────────────

  search(q: string, limit = 10): Promise<{
    projects: Project[];
    tasks: Task[];
    users: User[];
  }> {
    return this.request<{ projects: Project[]; tasks: Task[]; users: User[] }>(
      'GET',
      '/api/search',
      { query: { q, limit } }
    ).then((result) => ({
      projects: (result.projects ?? []).map(normalizeProject),
      tasks: (result.tasks ?? []).map(normalizeTask),
      users: result.users ?? [],
    }));
  }

  async smartInbox(scope: 'all' | 'mine' = 'all'): Promise<SmartInbox> {
    const inbox = await this.request<SmartInbox>('GET', '/api/inbox/smart', { query: { scope } });
    return {
      ...inbox,
      groups: {
        awaitingReview: (inbox.groups?.awaitingReview ?? []).map(normalizeTask),
        mentioned: (inbox.groups?.mentioned ?? []).map((item) => ({
          ...item,
          task: normalizeTask(item.task),
        })),
        assignedActive: (inbox.groups?.assignedActive ?? []).map(normalizeTask),
        recentlyDone: (inbox.groups?.recentlyDone ?? []).map(normalizeTask),
        stale: (inbox.groups?.stale ?? []).map(normalizeTask),
      },
    };
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
   * Throws `TrovyError(404)` if either side is missing.
   */
  async resolveTaskRef(ref: string): Promise<{
    projectKey: string;
    projectId: string;
    taskId: string;
    task: Task;
  }> {
    const parsed = parseTaskRef(ref);
    if (!parsed) {
      throw new TrovyError(`Invalid task reference "${ref}" — expected something like "TF-12"`, 400);
    }
    const { id: projectId, project } = await this.resolveProjectKeyAndId(parsed.key);
    const { tasks } = await this.listTasks(projectId);
    const task = tasks.find((t) => t.number === parsed.number);
    if (!task) {
      throw new TrovyError(`Task ${ref} not found in project ${parsed.key}`, 404);
    }
    return {
      projectKey: project.key,
      projectId,
      taskId: task.id,
      task,
    };
  }
}

function toVersionedApiPath(path: string): string {
  if (!path.startsWith('/api/')) {
    throw new Error(`Trovy API paths must start with /api/: ${path}`);
  }
  return `${API_PREFIX}/${path.slice('/api/'.length)}`;
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

/**
 * The API currently uses UUIDs, while older self-hosted deployments may still
 * expose CUIDs. Recognise both formats so an id is never mistaken for a key.
 */
function looksLikeProjectId(value: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

/**
 * Successful Trovy API responses use the global `{ success, data }` envelope.
 * Legacy self-hosted deployments may still return a raw payload, which remains
 * supported for a non-breaking SDK upgrade.
 */
function unwrapSuccessEnvelope<T>(value: unknown): T {
  if (!isRecord(value) || !('success' in value)) return value as T;

  if (value.success === true && 'data' in value) return value.data as T;

  throw new TrovyError('Malformed API response: expected a successful response envelope', 502, value);
}

function errorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.message === 'string') return value.message;
  if (typeof value.error === 'string') return value.error;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function unwrapArray<T>(value: T[] | { [key: string]: T[] }, key: string): T[] {
  if (Array.isArray(value)) return value;
  const nested = value[key];
  if (Array.isArray(nested)) return nested;
  throw new TrovyError(`Malformed API response: expected an array or { ${key}: [] }`, 502, value);
}

function unwrapObject<T>(value: T | { [key: string]: T }, key: string): T {
  if (value && typeof value === 'object' && key in value) {
    const nested = (value as { [key: string]: T })[key];
    if (nested && typeof nested === 'object') return nested;
  }
  if (value && typeof value === 'object') return value as T;
  throw new TrovyError(`Malformed API response: expected an object or { ${key}: {} }`, 502, value);
}

function normalizeProject(project: Project): Project {
  return project;
}

function normalizeTask(task: any): Task {
  const raw = task as Record<string, unknown>;
  return {
    ...raw,
    number: Number(raw.number ?? raw.sequence),
    creatorId: String(raw.creatorId ?? raw.createdBy),
    assignees: Array.isArray(raw.assignees) ? raw.assignees : [],
    labels: Array.isArray(raw.labels) ? raw.labels : [],
    project: raw.project as Task['project'],
  } as Task;
}

function normalizeComment(comment: any): Comment {
  const raw = comment as Record<string, unknown>;
  return {
    ...raw,
    content: String(raw.content ?? raw.body ?? ''),
  } as Comment;
}

function formatRRule(opts: {
  frequency: RecurrenceFreq;
  byDay?: number[];
  hourOfDay?: number;
  endsAt?: string | null;
}): string {
  const parts = [`FREQ=${opts.frequency}`];
  if (opts.frequency === 'WEEKLY' && opts.byDay?.length) {
    const weekdays = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const byDay = opts.byDay.map((day) => weekdays[day]).filter(Boolean);
    if (!byDay.length) throw new TrovyError('byDay must contain weekdays from 0 to 6', 400);
    parts.push(`BYDAY=${byDay.join(',')}`);
  }
  if (opts.frequency === 'MONTHLY' && opts.byDay?.length) {
    const day = opts.byDay[0];
    if (day === undefined || !Number.isInteger(day) || day < 1 || day > 31) {
      throw new TrovyError('byDay must contain a day of month from 1 to 31', 400);
    }
    parts.push(`BYMONTHDAY=${day}`);
  }
  if (opts.hourOfDay !== undefined) {
    if (!Number.isInteger(opts.hourOfDay) || opts.hourOfDay < 0 || opts.hourOfDay > 23) {
      throw new TrovyError('hourOfDay must be an integer from 0 to 23', 400);
    }
    parts.push(`BYHOUR=${opts.hourOfDay}`);
  }
  if (opts.endsAt) {
    const endsAt = new Date(opts.endsAt);
    if (Number.isNaN(endsAt.getTime())) throw new TrovyError('endsAt must be a valid ISO datetime', 400);
    parts.push(`UNTIL=${endsAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
  }
  return parts.join(';');
}

function recurrenceRuleFromTask(task: Task): RecurrenceRule | null {
  const raw = task as Task & Record<string, unknown>;
  if (!raw.rrule || typeof raw.rrule !== 'string') return null;
  const frequency = raw.rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY)/)?.[1] as RecurrenceFreq | undefined;
  if (!frequency) return null;
  return {
    id: task.id,
    taskId: task.id,
    frequency,
    byDay: [],
    hourOfDay: 9,
    endsAt: (raw.recurrenceEndsAt as string | null | undefined) ?? null,
    lastSpawnedAt: (raw.recurrenceLastSpawnedAt as string | null | undefined) ?? null,
    nextSpawnAt: String(raw.recurrenceNextSpawnAt ?? ''),
    createdAt: String(task.createdAt),
  };
}
