/**
 * fieldResolver — value transformation pipeline (PRD §3.7.5).
 *
 *   raw JSON
 *     → [1] JSON Path 추출 (manual or auto by jiraFieldId/valueType)
 *     → [2] ValueType 변환 (date/number/boolean/array/user normalisation)
 *     → [3] isWikiLink 적용 ([[…]] wrapping, including issue-link targets)
 *     → [4] YAML 직렬화 (Dataview-friendly bare/quoted scalars or list)
 */

import type {
	FieldMapping,
	FieldValueType,
	JiraIssue,
	JiraIssueLink,
	JiraUser,
	NullFieldBehavior,
} from "./types";
import {
	collectIssueLinkRefs,
	isIssueLinkValue,
	resolveEpic,
	sanitizeWikiTarget,
	slugify,
} from "./wikiLinkResolver";

// Re-export for callers that still import slugify from this module.
export { slugify };

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

export interface ResolveContext {
	nullFieldBehavior: NullFieldBehavior;
	dateTimezone: string; // "local" or IANA timezone string
}

export interface ResolvedField {
	mapping: FieldMapping;
	/**
	 * Frontmatter representation:
	 *   - string: a single bare value (already YAML-quoted/bare per type)
	 *   - string[]: a list — each element already YAML-quoted/bare
	 *   - null: explicit `null` literal (only when nullFieldBehavior === "explicit")
	 *   - undefined: omit the key entirely
	 */
	yaml: string | string[] | null | undefined;
	/** Plain (un-serialized) value, used by the body renderer table. */
	plain: unknown;
}

/**
 * Resolve every enabled mapping against an issue. Returned in mapping
 * order; disabled and missing-data entries are filtered when
 * appropriate (PRD §3.7.6: null → omit by default).
 */
export function resolveAllFields(
	issue: JiraIssue,
	mappings: FieldMapping[],
	ctx: ResolveContext,
): ResolvedField[] {
	const out: ResolvedField[] = [];
	const sorted = [...mappings].sort((a, b) => a.order - b.order);
	for (const mapping of sorted) {
		if (!mapping.isEnabled) continue;
		// description never lives in Frontmatter (PRD §3.3.1).
		if (mapping.jiraFieldId === "description") continue;
		try {
			const resolved = resolveOne(issue, mapping, ctx);
			out.push(resolved);
		} catch (e) {
			console.warn(
				`[Jira Weaver] resolve failed: ${mapping.jiraFieldId} → ${mapping.obsidianKey}`,
				e,
			);
		}
	}
	return out;
}

function resolveOne(
	issue: JiraIssue,
	mapping: FieldMapping,
	ctx: ResolveContext,
): ResolvedField {
	// [1] extract raw value
	const raw = extractRaw(issue, mapping);

	// [2] normalize per ValueType — produces a plain JS value
	const plain = normalize(raw, mapping, ctx.dateTimezone);

	// null/empty handling per PRD §3.7.6
	if (isNullish(plain)) {
		const yaml = ctx.nullFieldBehavior === "explicit" ? null : undefined;
		return { mapping, yaml, plain: null };
	}

	// [3] + [4] — wikilink wrap, then YAML-serialize.
	const yaml = serializeForYaml(plain, mapping);
	return { mapping, yaml, plain };
}

/* -------------------------------------------------------------------------- */
/*  [1] JSON Path extraction                                                  */
/* -------------------------------------------------------------------------- */

function extractRaw(issue: JiraIssue, mapping: FieldMapping): unknown {
	if (mapping.jsonPath) {
		return readJsonPath(issue, mapping.jsonPath);
	}
	return autoExtract(issue, mapping);
}

/**
 * Tiny JSON Path reader supporting:
 *   - dot notation:        a.b.c
 *   - bracket index:       a.b[0].c
 *   - wildcard map:        a.b[*].c   →  array of every matched value
 *
 * Anything more exotic should be expressed as a chain of these primitives.
 * Returns undefined when any segment is missing.
 */
export function readJsonPath(root: unknown, path: string): unknown {
	const tokens = tokenizePath(path);
	let current: unknown = root;
	for (const tok of tokens) {
		if (current == null) return undefined;
		if (tok.kind === "key") {
			current = (current as Record<string, unknown>)[tok.name];
		} else if (tok.kind === "index") {
			if (!Array.isArray(current)) return undefined;
			current = current[tok.index];
		} else if (tok.kind === "wildcard") {
			if (!Array.isArray(current)) return undefined;
			// Apply remaining tokens to each element and flatten.
			const remaining = tokens.slice(tokens.indexOf(tok) + 1);
			return current.map((el) => readJsonPath(el, stringifyTokens(remaining)));
		}
	}
	return current;
}

type PathToken =
	| { kind: "key"; name: string }
	| { kind: "index"; index: number }
	| { kind: "wildcard" };

function tokenizePath(path: string): PathToken[] {
	const out: PathToken[] = [];
	let i = 0;
	while (i < path.length) {
		const ch = path[i];
		if (ch === ".") {
			i++;
			continue;
		}
		if (ch === "[") {
			const end = path.indexOf("]", i);
			if (end === -1) break;
			const inner = path.slice(i + 1, end).trim();
			if (inner === "*") out.push({ kind: "wildcard" });
			else out.push({ kind: "index", index: parseInt(inner, 10) || 0 });
			i = end + 1;
		} else {
			let j = i;
			while (j < path.length && path[j] !== "." && path[j] !== "[") j++;
			out.push({ kind: "key", name: path.slice(i, j) });
			i = j;
		}
	}
	return out;
}

function stringifyTokens(tokens: PathToken[]): string {
	let s = "";
	for (const t of tokens) {
		if (t.kind === "key") s += (s ? "." : "") + t.name;
		else if (t.kind === "index") s += `[${t.index}]`;
		else s += "[*]";
	}
	return s;
}

/**
 * Auto-extraction used when no jsonPath is configured. Handles the
 * common Jira shapes for system fields and most custom fields.
 */
function autoExtract(issue: JiraIssue, mapping: FieldMapping): unknown {
	const fields = (issue.fields ?? {}) as Record<string, unknown>;
	const id = mapping.jiraFieldId;

	// Field-id-specific shortcuts that don't fit the generic shape rules.
	if (id === "issuelinks") {
		return fields.issuelinks ?? [];
	}
	if (id === "epic") {
		return resolveEpicRaw(fields);
	}

	const v = fields[id];
	if (v === undefined || v === null) return v;

	switch (mapping.valueType) {
		case "user":
			return v;
		case "user_array":
			return v;
		case "array":
			return v;
		default: {
			// Object with .name (status, priority, issuetype, resolution, etc.)
			if (
				typeof v === "object" &&
				v !== null &&
				typeof (v as Record<string, unknown>).name === "string"
			) {
				return (v as { name: string }).name;
			}
			// Object with .value (single-select custom fields)
			if (
				typeof v === "object" &&
				v !== null &&
				typeof (v as Record<string, unknown>).value === "string"
			) {
				return (v as { value: string }).value;
			}
			return v;
		}
	}
}

/** Wraps wikiLinkResolver.resolveEpic with the legacy return shape used by autoExtract. */
function resolveEpicRaw(
	fields: Record<string, unknown>,
): { key: string; summary?: string } | null {
	return resolveEpic(fields);
}

/* -------------------------------------------------------------------------- */
/*  [2] ValueType normalization                                               */
/* -------------------------------------------------------------------------- */

function normalize(raw: unknown, mapping: FieldMapping, tz: string): unknown {
	if (raw === null || raw === undefined) return null;

	switch (mapping.valueType) {
		case "text":
			return normalizeText(raw, mapping);
		case "number":
			return toNumber(raw);
		case "boolean":
			return toBoolean(raw);
		case "date":
			return toDate(raw, tz);
		case "datetime":
			return toDateTime(raw, tz);
		case "array":
			return toArray(raw, mapping);
		case "user":
			return toUser(raw);
		case "user_array":
			return toUserArray(raw);
	}
}

function normalizeText(raw: unknown, mapping: FieldMapping): string | null {
	// Special case: epic mapping might receive an object {key, summary}.
	if (mapping.jiraFieldId === "epic") {
		if (typeof raw === "string") return raw;
		if (raw && typeof raw === "object") {
			const o = raw as { key?: string; summary?: string };
			if (o.key) return o.summary ? `${o.key}_${slugify(o.summary)}` : o.key;
		}
		return null;
	}
	if (typeof raw === "string") return raw;
	if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
	if (raw && typeof raw === "object") {
		const o = raw as Record<string, unknown>;
		if (typeof o.name === "string") return o.name;
		if (typeof o.value === "string") return o.value;
		// Last-ditch JSON fallback (PRD §3.7.6 "unknown object type").
		try {
			return JSON.stringify(raw);
		} catch {
			return null;
		}
	}
	return null;
}

function toNumber(raw: unknown): number | null {
	if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
	if (typeof raw === "string") {
		const n = parseFloat(raw);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function toBoolean(raw: unknown): boolean | null {
	if (typeof raw === "boolean") return raw;
	if (typeof raw === "string") {
		if (/^(true|yes|1)$/i.test(raw)) return true;
		if (/^(false|no|0)$/i.test(raw)) return false;
	}
	if (typeof raw === "number") return raw !== 0;
	return null;
}

function toDate(raw: unknown, tz: string): string | null {
	if (typeof raw !== "string") return null;
	const d = new Date(raw);
	if (isNaN(d.getTime())) return null;
	return formatInTimezone(d, tz, "date");
}

function toDateTime(raw: unknown, tz: string): string | null {
	if (typeof raw !== "string") return null;
	const d = new Date(raw);
	if (isNaN(d.getTime())) return null;
	return formatInTimezone(d, tz, "datetime");
}

/**
 * Format a Date in the given timezone.
 * "local" uses the system timezone via getFullYear/getMonth/etc. (local methods).
 * Any IANA string uses Intl.DateTimeFormat to extract the parts.
 */
function formatInTimezone(d: Date, tz: string, mode: "date" | "datetime"): string {
	const pad = (n: number) => String(n).padStart(2, "0");

	if (tz === "local") {
		if (mode === "date") {
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		}
		return (
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
			`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
		);
	}

	// Use Intl to decompose the date in the target timezone
	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: tz,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		...(mode === "datetime" && {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		}),
	});
	const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));

	if (mode === "date") {
		return `${parts.year}-${parts.month}-${parts.day}`;
	}
	// hour12:false can return "24" for midnight — normalize to "00"
	const hour = parts.hour === "24" ? "00" : parts.hour;
	return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
}

function toArray(raw: unknown, mapping: FieldMapping): unknown[] | null {
	if (raw === null || raw === undefined) return null;

	// issuelinks: collapse outwardIssue/inwardIssue into flat refs so the
	// renderer can wikilink each one. Carries summary for filename slug.
	if (mapping.jiraFieldId === "issuelinks") {
		const links = Array.isArray(raw) ? (raw as JiraIssueLink[]) : [];
		const refs = collectIssueLinkRefs(links);
		return refs.length > 0 ? refs : null;
	}

	if (!Array.isArray(raw)) return null;

	const out: unknown[] = [];
	for (const item of raw) {
		if (typeof item === "string") {
			out.push(item);
		} else if (item && typeof item === "object") {
			const o = item as Record<string, unknown>;
			if (typeof o.name === "string") out.push(o.name);
			else if (typeof o.value === "string") out.push(o.value);
			else if (typeof o.displayName === "string") out.push(o.displayName);
		}
	}
	return out.length > 0 ? out : null;
}

function toUser(raw: unknown): string | null {
	if (!raw || typeof raw !== "object") {
		return typeof raw === "string" ? raw : null;
	}
	const u = raw as JiraUser;
	return u.displayName || u.name || null;
}

function toUserArray(raw: unknown): string[] | null {
	if (!Array.isArray(raw)) return null;
	const out: string[] = [];
	for (const u of raw) {
		const name = toUser(u);
		if (name) out.push(name);
	}
	return out.length > 0 ? out : null;
}

/* -------------------------------------------------------------------------- */
/*  [3] + [4] WikiLink + YAML serialization                                   */
/* -------------------------------------------------------------------------- */

function serializeForYaml(
	plain: unknown,
	mapping: FieldMapping,
): string | string[] {
	if (Array.isArray(plain)) {
		return plain
			.map((el) => serializeScalar(el, mapping))
			.filter((s): s is string => s !== null);
	}
	const s = serializeScalar(plain, mapping);
	return s === null ? "" : s;
}

function serializeScalar(
	v: unknown,
	mapping: FieldMapping,
): string | null {
	if (v === null || v === undefined) return null;

	// IssueLink ref → wikilink with filename slug.
	if (isIssueLinkValue(v)) {
		const target = v.summary ? `${v.key}_${slugify(v.summary)}` : v.key;
		return yamlString(`[[${sanitizeWikiTarget(target)}]]`);
	}

	if (mapping.isWikiLink) {
		if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return null;
		const text = String(v);
		return yamlString(`[[${sanitizeWikiTarget(text)}]]`);
	}

	if (typeof v === "boolean") return v ? "true" : "false";
	if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
	if (typeof v !== "string") return null;
	const s = v;
	if (isBareYamlTimestamp(s)) return s;
	return yamlString(s);
}

function yamlString(s: string): string {
	return `"${s
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\r\n/g, "\\n")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\n")}"`;
}

function isBareYamlTimestamp(s: string): boolean {
	return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(
		s,
	);
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function isNullish(v: unknown): boolean {
	if (v === null || v === undefined) return true;
	if (typeof v === "string" && v.length === 0) return true;
	if (Array.isArray(v) && v.length === 0) return true;
	return false;
}

/**
 * Determine which Jira REST `fields` to request based on enabled
 * mappings. Always includes `summary` and `updated` for filename and
 * incremental-sync needs. Description is included unconditionally so
 * the body renderer always has it (PRD §3.3.1).
 */
export function buildRequestedFields(mappings: FieldMapping[]): string[] {
	const set = new Set<string>(["summary", "updated", "description"]);
	for (const m of mappings) {
		if (!m.isEnabled) continue;
		// Custom JSON paths typically navigate from the root; include the
		// top-level segment after `fields.`.
		if (m.jsonPath) {
			const after = m.jsonPath.replace(/^fields\./, "");
			const head = after.split(/[.[]/)[0];
			if (head) set.add(head);
		}
		if (m.jiraFieldId === "epic") {
			set.add("epic");
			set.add("customfield_10014");
			set.add("customfield_10008");
			continue;
		}
		set.add(m.jiraFieldId);
	}
	return [...set];
}

/* -------------------------------------------------------------------------- */
/*  Validation (used by the modal)                                            */
/* -------------------------------------------------------------------------- */

export function validateMapping(
	candidate: FieldMapping,
	all: FieldMapping[],
): { ok: true } | { ok: false; reason: string } {
	if (!candidate.obsidianKey || !/^[a-z][a-z0-9_]*$/.test(candidate.obsidianKey)) {
		return {
			ok: false,
			reason:
				"Obsidian key must be lowercase letters, digits and underscores, starting with a letter.",
		};
	}
	const collision = all.find(
		(m) =>
			m.jiraFieldId !== candidate.jiraFieldId &&
			m.obsidianKey === candidate.obsidianKey,
	);
	if (collision) {
		return {
			ok: false,
			reason: `Obsidian key "${candidate.obsidianKey}" is already used by ${collision.jiraFieldId}.`,
		};
	}
	const allowedTypes: FieldValueType[] = [
		"text",
		"number",
		"date",
		"datetime",
		"boolean",
		"array",
		"user",
		"user_array",
	];
	if (!allowedTypes.includes(candidate.valueType)) {
		return { ok: false, reason: `Invalid value type "${candidate.valueType}".` };
	}
	return { ok: true };
}
