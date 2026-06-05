/**
 * Typed API client for the project50 backend.
 * Configured with EXPO_PUBLIC_API_BASE_URL (default: http://localhost:3000).
 * Auth is passed via Bearer token in the Authorization header.
 */

import type {
  GoalType,
  DayKey,
} from "@project50/core";

// Re-export core types used by callers of this module
export type { GoalType, DayKey } from "@project50/core";

// ─── Request / Response interfaces ──────────────────────────────────────────

export interface CreateChallengeInput {
  title: string;
  goalType: GoalType;
  dailyTarget?: number;
  unit?: string;
  startDate: DayKey;
  lengthDays?: number;
  timezone?: string;
  visibility?: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
}

export interface UpdateChallengeInput {
  title?: string;
  unit?: string;
  dailyTarget?: number;
  visibility?: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
}

export interface ChallengeMedia {
  objectKey: string;
  url: string;
  width: number;
  height: number;
  order: number;
}

export interface ChallengeActivity {
  id: string;
  challengeId: string;
  userId: string;
  dayKey: DayKey;
  activityType: string | null;
  amount: number | null;
  done: boolean;
  note: string | null;
  mood: number | null;
  createdAt: string;
  media: ChallengeMedia[];
}

export interface DayStatus {
  dayKey: DayKey;
  completed: boolean;
  totalAmount: number;
}

export interface Milestone {
  id: string;
  kind: string;
  earnedAt: string;
}

export interface Challenge {
  id: string;
  title: string;
  goalType: GoalType;
  dailyTarget: number | null;
  unit: string | null;
  startDate: DayKey;
  lengthDays: number;
  timezone: string;
  visibility: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
  currentStreak: number;
  longestStreak: number;
  badges: number;
  cheering: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeDetail extends Challenge {
  activities: ChallengeActivity[];
  dayStatuses: DayStatus[];
  milestones: Milestone[];
}

export interface MediaInput {
  objectKey: string;
  width: number;
  height: number;
}

export interface LogActivityInput {
  dayKey: DayKey;
  activityType?: string;
  amount?: number;
  done?: boolean;
  note?: string;
  mood?: number;
  media?: MediaInput[];
}

export interface LogActivityResult {
  activity: ChallengeActivity;
  dayStatus: DayStatus;
  newMilestones: Milestone[];
}

export interface FeedUser {
  id: string;
  handle: string;
  displayName: string;
}

export interface FeedActivity {
  id: string;
  challengeId: string;
  userId: string;
  dayKey: DayKey;
  activityType: string | null;
  amount: number | null;
  done: boolean;
  note: string | null;
  mood: number | null;
  createdAt: string;
  media: ChallengeMedia[];
  challenge: Challenge;
  user: FeedUser;
  cheerCount: number;
  hasPhoto: boolean;
  /** True when the source challenge is a Project 50 run. */
  isProject50: boolean;
  /** 1-based day number within the Project 50 run (only when isProject50). */
  project50Day?: number;
}

/** A bounded, cursor-paginated page of feed activities. */
export interface FeedPage {
  items: FeedActivity[];
  /** Pass back as `?cursor=` to fetch the next page; null on the last page. */
  nextCursor: string | null;
}

export interface Reaction {
  id: string;
  activityId: string;
  userId: string;
  kind: "CHEER" | "COMMENT";
  text: string | null;
  createdAt: string;
}

export interface PresignResult {
  uploadUrl: string;
  objectKey: string;
  /**
   * Headers the client must send on the PUT. Always carries content-type; on
   * Azure Blob also carries `x-ms-blob-type: BlockBlob` (required by Put Blob).
   * Optional for backward compatibility with older API responses.
   */
  uploadHeaders?: Record<string, string>;
}

export type RecapKind = "DAY" | "WEEK" | "FIFTY";

export interface RecapResult {
  recapId: string;
  kind: RecapKind;
  url: string;
}

export interface RecapListItem {
  id: string;
  kind: RecapKind;
  url: string;
  createdAt: string;
}

export interface PublishCapability {
  kind: string;
  label: string;
  description: string;
}

export type Capabilities = PublishCapability[];

// ─── Project 50 ───────────────────────────────────────────────────────────────

export interface Project50Today {
  dayKey: string;
  dayNumber: number;
  /** length 7, index = ruleId - 1 */
  checks: boolean[];
  completedCount: number;
}

export type Project50DayStatus = "complete" | "incomplete" | "today" | "future";

export interface Project50HistoryDay {
  dayNumber: number;
  dayKey: string;
  status: Project50DayStatus;
}

export interface Project50History {
  days: Project50HistoryDay[];
}

export interface Project50State {
  status: "NONE" | "ACTIVE" | "FAILED" | "COMPLETED";
  runId?: string;
  today?: Project50Today;
  history?: Project50History;
  failedDayNumber?: number;
  failedRuleId?: number;
  completedDays?: number;
}

// ─── Error ──────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? `API error ${status}: ${code}`);
    this.name = "ApiError";
  }
}

// ─── Client ─────────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "http://localhost:3000";

export class ApiClient {
  private readonly baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env["EXPO_PUBLIC_API_BASE_URL"] ?? DEFAULT_BASE_URL;
  }

  /** Set the auth token (call after sign-in). */
  setToken(token: string | null): void {
    this.token = token;
  }

  /** Get the current auth token. */
  getToken(): string | null {
    return this.token;
  }

  private authHeaders(): Record<string, string> {
    if (this.token) {
      return { Authorization: `Bearer ${this.token}` };
    }
    return {};
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.authHeaders(),
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let code = "UNKNOWN_ERROR";
      try {
        const json = (await response.json()) as { code?: string };
        if (json.code) code = json.code;
      } catch {
        // ignore parse errors
      }
      throw new ApiError(response.status, code);
    }

    return response.json() as Promise<T>;
  }

  // ─── Challenges ───────────────────────────────────────────────────────────

  async listChallenges(): Promise<Challenge[]> {
    return this.request<Challenge[]>("GET", "/api/challenges");
  }

  async getChallenge(id: string): Promise<ChallengeDetail> {
    return this.request<ChallengeDetail>("GET", `/api/challenges/${id}`);
  }

  async createChallenge(input: CreateChallengeInput): Promise<Challenge> {
    return this.request<Challenge>("POST", "/api/challenges", input);
  }

  async updateChallenge(id: string, input: UpdateChallengeInput): Promise<Challenge> {
    return this.request<Challenge>("PATCH", `/api/challenges/${id}`, input);
  }

  async deleteChallenge(id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>("DELETE", `/api/challenges/${id}`);
  }

  // ─── Activities ───────────────────────────────────────────────────────────

  async logActivity(challengeId: string, input: LogActivityInput): Promise<LogActivityResult> {
    return this.request<LogActivityResult>(
      "POST",
      `/api/challenges/${challengeId}/activities`,
      input,
    );
  }

  // ─── Feed ─────────────────────────────────────────────────────────────────

  /**
   * Fetch a page of the activity feed. The feed is bounded and cursor-paginated;
   * pass `cursor` (a prior page's `nextCursor`) and/or `limit` to page through it.
   */
  async getFeed(opts: { cursor?: string; limit?: number } = {}): Promise<FeedPage> {
    const qs = new URLSearchParams();
    if (opts.cursor) qs.set("cursor", opts.cursor);
    if (opts.limit != null) qs.set("limit", String(opts.limit));
    const query = qs.toString();
    return this.request<FeedPage>("GET", `/api/feed${query ? `?${query}` : ""}`);
  }

  // ─── Reactions ────────────────────────────────────────────────────────────

  async react(
    activityId: string,
    kind: "CHEER" | "COMMENT",
    text?: string,
  ): Promise<Reaction> {
    return this.request<Reaction>("POST", `/api/activities/${activityId}/reactions`, {
      kind,
      text,
    });
  }

  // ─── Uploads ──────────────────────────────────────────────────────────────

  async presignUpload(
    contentType: string,
    ext: string,
    suffix: string,
  ): Promise<PresignResult> {
    return this.request<PresignResult>("POST", "/api/uploads/presign", {
      contentType,
      ext,
      suffix,
    });
  }

  // ─── Recaps ───────────────────────────────────────────────────────────────

  async generateRecap(challengeId: string, kind: RecapKind): Promise<RecapResult> {
    return this.request<RecapResult>("POST", `/api/challenges/${challengeId}/recap`, { kind });
  }

  async listRecaps(challengeId: string): Promise<RecapListItem[]> {
    return this.request<RecapListItem[]>("GET", `/api/challenges/${challengeId}/recap`);
  }

  // ─── Capabilities ─────────────────────────────────────────────────────────

  async getCapabilities(): Promise<Capabilities> {
    return this.request<Capabilities>("GET", "/api/publish/capabilities");
  }

  // ─── Project 50 ─────────────────────────────────────────────────────────────

  async getProject50State(): Promise<Project50State> {
    return this.request<Project50State>("GET", "/api/project50/state");
  }

  async startProject50(timezone: string): Promise<Project50State> {
    return this.request<Project50State>("POST", "/api/project50/start", { timezone });
  }

  async toggleRule(ruleId: number, done: boolean): Promise<Project50State> {
    return this.request<Project50State>("POST", "/api/project50/toggle", { ruleId, done });
  }
}

/** Default singleton API client. Override baseUrl via EXPO_PUBLIC_API_BASE_URL. */
export const apiClient = new ApiClient();
