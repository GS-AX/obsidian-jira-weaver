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
}

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
			} catch (e) {
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
	 *  DC/Server (Bearer): POST /rest/api/2/search — v3 endpoint may not exist on older DC. */
	async searchIssues(params: SearchParams): Promise<JiraSearchResponse> {
		this.requireConfig();
		if (this.cfg.authMode === "basic") {
			return this.searchCloud(params);
		}
		return this.searchDC(params);
	}

	private searchCloud(params: SearchParams): Promise<JiraSearchResponse> {
		const fields = (params.fields ?? DEFAULT_FIELDS).join(",");
		const qs = new URLSearchParams({
			jql: params.jql,
			maxResults: String(params.maxResults),
			startAt: String(params.startAt ?? 0),
			fields,
		});
		return this.request<JiraSearchResponse>({
			url: `${this.baseUrl()}/rest/api/3/search/jql?${qs.toString()}`,
			method: "GET",
		});
	}

	private searchDC(params: SearchParams): Promise<JiraSearchResponse> {
		const body = {
			jql: params.jql,
			maxResults: params.maxResults,
			startAt: params.startAt ?? 0,
			fields: params.fields ?? DEFAULT_FIELDS,
		};
		return this.request<JiraSearchResponse>({
			url: `${this.baseUrl()}/rest/api/2/search`,
			method: "POST",
			body: JSON.stringify(body),
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
		const j = JSON.parse(text);
		if (Array.isArray(j.errorMessages) && j.errorMessages.length > 0) {
			return j.errorMessages.join(" ");
		}
		if (j.errors && typeof j.errors === "object") {
			return Object.values(j.errors).join(" ");
		}
	} catch {
		/* fall through */
	}
	return null;
}
