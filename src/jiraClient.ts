import { requestUrl, type RequestUrlParam } from "obsidian";
import type { AuthMode, JiraIssue, JiraSearchResponse } from "./types";

/**
 * Errors thrown by the Jira client carry a stable code so callers can
 * map them to localized notices without parsing strings.
 */
export type JiraErrorCode =
	| "settingsIncomplete"
	| "network"
	| "auth"
	| "jql"
	| "http"
	| "parse";

export class JiraClientError extends Error {
	code: JiraErrorCode;
	httpStatus?: number;
	detail?: string;
	constructor(
		code: JiraErrorCode,
		message: string,
		opts?: { httpStatus?: number; detail?: string },
	) {
		super(message);
		this.name = "JiraClientError";
		this.code = code;
		this.httpStatus = opts?.httpStatus;
		this.detail = opts?.detail;
	}
}

export interface JiraClientConfig {
	jiraDomain: string;
	personalAccessToken: string;
	authMode?: AuthMode;
	jiraEmail?: string;
}

export interface SearchParams {
	jql: string;
	maxResults: number;
	fields?: string[];
	startAt?: number;
	nextPageToken?: string;
}

/**
 * Server-side page caps:
 *  - Jira Cloud /rest/api/3/search/jql hard-caps maxResults at ~100 per call.
 *  - Jira DC /rest/api/2/search is bounded by `jira.search.views.default.max`
 *    (commonly 100 or 1000); 100 is the safe lowest common denominator.
 */
const SEARCH_PAGE_SIZE = 100;

/** Hard upper bound on pagination iterations to guard against a server
 *  that keeps returning a fresh nextPageToken indefinitely. */
const SEARCH_PAGE_LIMIT = 1000;

/**
 * Default field set requested from /search for v0.1.0. Field-mapping aware
 * selection arrives in v0.2.0.
 */
const DEFAULT_FIELDS = [
	"summary",
	"status",
	"priority",
	"issuetype",
	"assignee",
	"reporter",
	"created",
	"updated",
	"duedate",
	"labels",
	"components",
	"fixVersions",
	"issuelinks",
	"description",
];

export class JiraClient {
	constructor(private cfg: JiraClientConfig) {}

	private requireConfig(): void {
		if (!this.cfg.jiraDomain || !this.cfg.personalAccessToken) {
			throw new JiraClientError(
				"settingsIncomplete",
				"Jira domain or token missing",
			);
		}
	}

	private baseUrl(): string {
		return this.cfg.jiraDomain.replace(/\/+$/, "");
	}

	private authHeader(): string {
		if (this.cfg.authMode === "basic") {
			const credentials = btoa(
				`${this.cfg.jiraEmail ?? ""}:${this.cfg.personalAccessToken}`,
			);
			return `Basic ${credentials}`;
		}
		return `Bearer ${this.cfg.personalAccessToken}`;
	}

	private async request<T>(params: RequestUrlParam): Promise<T> {
		try {
			const res = await requestUrl({
				...params,
				throw: false,
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
					Authorization: this.authHeader(),
					"X-Atlassian-Token": "no-check",
					...(params.headers ?? {}),
				},
			});

			if (res.status === 401) {
				throw new JiraClientError("auth", `HTTP 401`, {
					httpStatus: 401,
				});
			}
			if (res.status === 403) {
				const detail = extractErrorMessage(res.text) ?? res.text?.slice(0, 300) ?? "HTTP 403 Forbidden";
				throw new JiraClientError("http", detail, {
					httpStatus: 403,
					detail,
				});
			}
			if (res.status === 400) {
				const detail = extractErrorMessage(res.text) ?? `HTTP 400`;
				throw new JiraClientError("jql", detail, {
					httpStatus: 400,
					detail,
				});
			}
			if (res.status >= 400) {
				const detail =
					extractErrorMessage(res.text) ?? `HTTP ${res.status}`;
				throw new JiraClientError("http", detail, {
					httpStatus: res.status,
					detail,
				});
			}

			try {
				return JSON.parse(res.text) as T;
			} catch {
				throw new JiraClientError(
					"parse",
					"Failed to parse Jira response",
				);
			}
		} catch (e) {
			if (e instanceof JiraClientError) throw e;
			// requestUrl rejects on transport-level failures.
			throw new JiraClientError(
				"network",
				e instanceof Error ? e.message : String(e),
			);
		}
	}

	/** GET /rest/api/2/field — used by v0.2.0 field-mapping panel. */
	async listFields(): Promise<
		Array<{ id: string; name: string; custom: boolean; schema?: unknown }>
	> {
		this.requireConfig();
		return this.request({
			url: `${this.baseUrl()}/rest/api/2/field`,
			method: "GET",
		});
	}

	/** Bulk issue fetch by JQL.
	 *  Cloud (Basic auth): GET /rest/api/3/search/jql — avoids Electron XSRF check on POST.
	 *  DC/Server (Bearer): GET /rest/api/2/search — v3 endpoint may not exist on older DC.
	 *
	 *  Pagination is transparent to callers: requests pages until either the
	 *  caller-supplied `maxResults` cap is reached or the server signals the
	 *  end of results. The returned shape stays `{ issues }` so call sites
	 *  don't need to change. */
	async searchIssues(params: SearchParams): Promise<JiraSearchResponse> {
		this.requireConfig();
		const cap = Math.max(0, params.maxResults | 0);
		const isCloud = this.cfg.authMode === "basic";
		const collected: JiraIssue[] = [];

		let nextPageToken: string | undefined;
		let startAt = 0;
		let lastTotal: number | undefined;
		let lastIsLast: boolean | undefined;

		for (let iteration = 0; iteration < SEARCH_PAGE_LIMIT; iteration++) {
			const remaining = cap - collected.length;
			if (remaining <= 0) break;
			const pageSize = Math.min(SEARCH_PAGE_SIZE, remaining);

			const page = isCloud
				? await this.searchCloud({
						...params,
						maxResults: pageSize,
						nextPageToken,
					})
				: await this.searchDC({
						...params,
						maxResults: pageSize,
						startAt,
					});

			const pageIssues = page.issues ?? [];
			if (pageIssues.length === 0) break;

			collected.push(...pageIssues);

			lastTotal = page.total ?? lastTotal;
			lastIsLast = page.isLast;

			if (isCloud) {
				nextPageToken = page.nextPageToken;
				if (!nextPageToken) break;
				if (page.isLast === true) break;
			} else {
				if (pageIssues.length < pageSize) break;
				startAt += pageIssues.length;
				if (typeof page.total === "number" && startAt >= page.total) break;
			}
		}

		const issues = collected.length > cap ? collected.slice(0, cap) : collected;
		return {
			issues,
			total: lastTotal,
			isLast: lastIsLast,
		};
	}

	private searchCloud(params: SearchParams): Promise<JiraSearchResponse> {
		const fields = (params.fields ?? DEFAULT_FIELDS).join(",");
		// /rest/api/3/search/jql ignores startAt and paginates with an
		// opaque nextPageToken cursor — only send the token when present.
		const qs = new URLSearchParams({
			jql: params.jql,
			maxResults: String(params.maxResults),
			fields,
		});
		if (params.nextPageToken) {
			qs.set("nextPageToken", params.nextPageToken);
		}
		return this.request<JiraSearchResponse>({
			url: `${this.baseUrl()}/rest/api/3/search/jql?${qs.toString()}`,
			method: "GET",
		});
	}

	private searchDC(params: SearchParams): Promise<JiraSearchResponse> {
		const fields = (params.fields ?? DEFAULT_FIELDS).join(",");
		const qs = new URLSearchParams({
			jql: params.jql,
			maxResults: String(params.maxResults),
			startAt: String(params.startAt ?? 0),
			fields,
		});
		return this.request<JiraSearchResponse>({
			url: `${this.baseUrl()}/rest/api/2/search?${qs.toString()}`,
			method: "GET",
		});
	}

	/** Convenience: GET a single issue (used for diagnostics). */
	async getIssue(key: string): Promise<JiraIssue> {
		this.requireConfig();
		return this.request<JiraIssue>({
			url: `${this.baseUrl()}/rest/api/2/issue/${encodeURIComponent(key)}`,
			method: "GET",
		});
	}
}

function extractErrorMessage(text: string): string | null {
	if (!text) return null;
	try {
		const j: unknown = JSON.parse(text);
		if (typeof j === "object" && j !== null) {
			const o = j as Record<string, unknown>;
			if (Array.isArray(o.errorMessages) && o.errorMessages.length > 0) {
				return (o.errorMessages as string[]).join(" ");
			}
			if (o.errors && typeof o.errors === "object") {
				return Object.values(o.errors as Record<string, unknown>).join(" ");
			}
		}
	} catch {
		/* fall through */
	}
	return null;
}
