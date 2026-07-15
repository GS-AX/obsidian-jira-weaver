/**
 * Jira Weaver - shared type definitions.
 *
 * v0.1.0 MVP defines the minimum types needed for connection settings
 * and the manual sync command. v0.2.0 introduces the FieldMapping
 * system; later versions extend with i18n (v0.3.0), memo protection
 * options (v0.4.0) and trigger options (v0.4.0).
 */

export type SupportedLocale = "en" | "ko" | "ja" | "zh";
export type LanguageSetting = "auto" | SupportedLocale;
export type AuthMode = "bearer" | "basic";

export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "ko", "ja", "zh"];

/* -------------------------------------------------------------------------- */
/*  Field Mapping (PRD §3.7)                                                   */
/* -------------------------------------------------------------------------- */

export type FieldValueType =
	| "text"
	| "number"
	| "date"
	| "datetime"
	| "boolean"
	| "array"
	| "user"
	| "user_array";

export interface FieldMapping {
	jiraFieldId: string; // "summary", "customfield_10016"
	jiraFieldName: string; // human-readable label from /rest/api/2/field
	obsidianKey: string; // YAML key written into Frontmatter
	valueType: FieldValueType;
	isWikiLink: boolean;
	jsonPath: string | null; // null → auto-extract per valueType
	isEnabled: boolean;
	order: number;
	/**
	 * Set when the field was discovered from /field at some point but is
	 * no longer returned by Jira. Surfaced as a warning badge in the
	 * mapping panel; mapping itself is preserved (PRD §3.7.6).
	 */
	missing?: boolean;
}

export type NoMarkerBehavior = "overwrite" | "skip" | "append";
export type NullFieldBehavior = "omit" | "explicit";
export type SyncTrigger = "manual" | "onStartup" | "interval";

/* -------------------------------------------------------------------------- */
/*  JQL Profiles (PRD §v0.5.0)                                                */
/* -------------------------------------------------------------------------- */

export interface JqlProfile {
	id: string;
	name: string;
	jqlQuery: string;
	targetFolder: string;
	maxResults: number;
	enabled: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Sync Log (PRD §v0.5.0)                                                    */
/* -------------------------------------------------------------------------- */

export interface SyncLogEntry {
	id: string;
	timestamp: string; // ISO string
	profileName: string;
	result: SyncResult;
	durationMs: number;
	mode: string; // RunMode
}

/* -------------------------------------------------------------------------- */
/*  Plugin settings                                                            */
/* -------------------------------------------------------------------------- */

export interface JiraPluginSettings {
	// Connection
	jiraDomain: string;
	personalAccessToken: string;

	// Auth (v0.5.0) — bearer for Server/DC, basic for Cloud
	authMode: AuthMode;
	jiraEmail: string; // used when authMode === "basic"

	// Sync (single-profile legacy — kept for migration)
	targetFolder: string;
	jqlQuery: string;
	maxResults: number;

	// JQL Profiles (v0.5.0) — replaces single-profile fields in UI
	jqlProfiles: JqlProfile[];

	// Field mapping (v0.2.0)
	fieldMappings: FieldMapping[];
	nullFieldBehavior: NullFieldBehavior;

	// i18n (v0.3.0) — "auto" defers to Obsidian app language detection.
	language: LanguageSetting;

	// Triggers + memo protection (v0.4.0)
	syncTrigger: SyncTrigger;
	syncInterval: number; // minutes, used when syncTrigger === "interval"
	noMarkerBehavior: NoMarkerBehavior;

	// Timezone (v0.5.3) — "local" uses system timezone; IANA string overrides
	dateTimezone: string;

	// Cached field catalog from /rest/api/2/field. Populated by the
	// "Reload Field List" command; consumed by the mapping panel to
	// list "Available Fields".
	fieldCatalog: FieldCatalogEntry[];
	fieldCatalogFetchedAt: string | null; // ISO string
}

export interface FieldCatalogEntry {
	id: string;
	name: string;
	custom: boolean;
	schema?: { type?: string; items?: string };
}

/* -------------------------------------------------------------------------- */
/*  Default mappings (PRD §3.7.4)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Default field mappings shipped with the plugin. Order is preserved
 * in the UI and in the rendered Frontmatter. Description is special-
 * cased and rendered into the body region rather than via mapping.
 */
export function buildDefaultFieldMappings(): FieldMapping[] {
	const rows: Array<Omit<FieldMapping, "order">> = [
		{
			jiraFieldId: "summary",
			jiraFieldName: "Summary",
			obsidianKey: "title",
			valueType: "text",
			isWikiLink: false,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "issuetype",
			jiraFieldName: "Issue Type",
			obsidianKey: "type",
			valueType: "text",
			isWikiLink: false,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "status",
			jiraFieldName: "Status",
			obsidianKey: "status",
			valueType: "text",
			isWikiLink: false,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "priority",
			jiraFieldName: "Priority",
			obsidianKey: "priority",
			valueType: "text",
			isWikiLink: false,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "assignee",
			jiraFieldName: "Assignee",
			obsidianKey: "assignee",
			valueType: "user",
			isWikiLink: true,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "reporter",
			jiraFieldName: "Reporter",
			obsidianKey: "reporter",
			valueType: "user",
			isWikiLink: true,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "created",
			jiraFieldName: "Created",
			obsidianKey: "created",
			valueType: "date",
			isWikiLink: false,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "updated",
			jiraFieldName: "Updated",
			obsidianKey: "updated",
			valueType: "datetime",
			isWikiLink: false,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "duedate",
			jiraFieldName: "Due Date",
			obsidianKey: "due_date",
			valueType: "date",
			isWikiLink: false,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "labels",
			jiraFieldName: "Labels",
			obsidianKey: "labels",
			valueType: "array",
			isWikiLink: false,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "components",
			jiraFieldName: "Components",
			obsidianKey: "components",
			valueType: "array",
			isWikiLink: true,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "fixVersions",
			jiraFieldName: "Fix Versions",
			obsidianKey: "fix_versions",
			valueType: "array",
			isWikiLink: false,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "issuelinks",
			jiraFieldName: "Linked Issues",
			obsidianKey: "linked_issues",
			valueType: "array",
			isWikiLink: true,
			jsonPath: null,
			isEnabled: true,
		},
		{
			jiraFieldId: "epic",
			jiraFieldName: "Epic",
			obsidianKey: "epic",
			valueType: "text",
			isWikiLink: true,
			jsonPath: null,
			isEnabled: true,
		},
	];
	return rows.map((r, i) => ({ ...r, order: i + 1 }));
}

export const DEFAULT_SETTINGS: JiraPluginSettings = {
	jiraDomain: "",
	personalAccessToken: "",
	authMode: "bearer",
	jiraEmail: "",
	targetFolder: "Jira/Issues",
	jqlQuery: "",
	maxResults: 50,
	jqlProfiles: [],
	fieldMappings: buildDefaultFieldMappings(),
	nullFieldBehavior: "omit",
	fieldCatalog: [],
	fieldCatalogFetchedAt: null,
	language: "auto",
	syncTrigger: "manual",
	syncInterval: 30,
	noMarkerBehavior: "overwrite",
	dateTimezone: "local",
};

/* -------------------------------------------------------------------------- */
/*  Region marker                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Marker that separates the synced Jira region (B) from the user's
 * private memo region (C). Language-independent — never translate.
 */
export const SECTION_MARKER = "<!-- jira-weaver:end -->";

/* -------------------------------------------------------------------------- */
/*  Jira REST shapes (subset consumed by the renderer)                         */
/* -------------------------------------------------------------------------- */

export interface JiraUser {
	displayName?: string;
	emailAddress?: string;
	accountId?: string;
	name?: string;
}

export interface JiraIssueLinkRef {
	key: string;
	fields?: { summary?: string };
}

export interface JiraIssueLink {
	type?: { inward?: string; outward?: string };
	inwardIssue?: JiraIssueLinkRef;
	outwardIssue?: JiraIssueLinkRef;
}

export interface JiraIssueFields {
	summary?: string;
	status?: { name?: string };
	priority?: { name?: string };
	issuetype?: { name?: string };
	assignee?: JiraUser | null;
	reporter?: JiraUser | null;
	created?: string;
	updated?: string;
	duedate?: string | null;
	labels?: string[];
	components?: Array<{ name?: string }>;
	fixVersions?: Array<{ name?: string }>;
	issuelinks?: JiraIssueLink[];
	description?: string | null;
	[key: string]: unknown;
}

export interface JiraIssue {
	key: string;
	id?: string;
	self?: string;
	fields: JiraIssueFields;
}

export interface JiraSearchResponse {
	issues: JiraIssue[];
	// Classic /search (DC/Server): startAt + total. Cloud /search/jql no
	// longer returns total and uses nextPageToken instead.
	total?: number;
	startAt?: number;
	maxResults?: number;
	nextPageToken?: string;
	isLast?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Sync result                                                                */
/* -------------------------------------------------------------------------- */

export interface SyncResult {
	created: number;
	updated: number;
	skipped: number;
	errors: number;
	errorDetails: Array<{ key: string; reason: string }>;
	/**
	 * Files synced under {@link NoMarkerBehavior} fallback because the
	 * marker was missing. Surfaced in the result Notice (PRD §3.5.4).
	 */
	markerWarnings: Array<{ key: string; path: string; behavior: NoMarkerBehavior }>;
}

export function emptySyncResult(): SyncResult {
	return {
		created: 0,
		updated: 0,
		skipped: 0,
		errors: 0,
		errorDetails: [],
		markerWarnings: [],
	};
}
