/**
 * wikiLinkResolver — single source of truth for the wiki-link
 * conversion rules in PRD §3.4.3.
 *
 * Responsibilities:
 *   - sanitize wiki-link targets
 *   - wrap a value as `[[…]]`
 *   - build the canonical `KEY_summary_slug` target for issue refs
 *   - flatten Jira `issuelinks` into renderable refs
 *   - locate the epic across known Jira shapes (Cloud/Server/DC)
 *   - slugify summaries for both file names and link targets
 */

import type { JiraIssueLink, JiraIssueLinkRef } from "./types";

/* -------------------------------------------------------------------------- */
/*  Wrapping                                                                   */
/* -------------------------------------------------------------------------- */

/** Strip characters that would break a wiki link target. */
export function sanitizeWikiTarget(s: string): string {
	return s.replace(/[[\]|#^]/g, "").trim();
}

/** Wrap a target as `[[X]]` after sanitization. */
export function wrapWikiLink(target: string): string {
	return `[[${sanitizeWikiTarget(target)}]]`;
}

/* -------------------------------------------------------------------------- */
/*  Issue references                                                           */
/* -------------------------------------------------------------------------- */

export interface IssueLinkValue {
	kind: "issueLink";
	key: string;
	summary?: string;
}

/**
 * Canonical wiki target for an issue reference. Mirrors the file
 * naming convention so `[[KEY_summary]]` resolves to the synced note.
 * Falls back to the bare KEY when summary is unavailable
 * (PRD §3.4.3 rule 3).
 */
export function buildIssueWikiTarget(
	key: string,
	summary?: string,
): string {
	if (!summary) return key;
	return `${key}_${slugify(summary)}`;
}

/**
 * Flatten Jira issuelinks (each carries inward+outward) into a list of
 * renderable refs preserving the linked-to issue.
 */
export function collectIssueLinkRefs(
	links: JiraIssueLink[] | undefined | null,
): IssueLinkValue[] {
	if (!Array.isArray(links)) return [];
	const out: IssueLinkValue[] = [];
	for (const l of links) {
		const ref: JiraIssueLinkRef | undefined = l.outwardIssue ?? l.inwardIssue;
		if (!ref?.key) continue;
		out.push({ kind: "issueLink", key: ref.key, summary: ref.fields?.summary });
	}
	return out;
}

export function isIssueLinkValue(v: unknown): v is IssueLinkValue {
	return (
		typeof v === "object" &&
		v !== null &&
		(v as IssueLinkValue).kind === "issueLink"
	);
}

/* -------------------------------------------------------------------------- */
/*  Epic                                                                       */
/* -------------------------------------------------------------------------- */

export interface EpicResolved {
	key: string;
	summary?: string;
}

/**
 * Locate the epic link across known shapes:
 *   - Jira Cloud:        `epic` object with key/name/summary
 *   - Jira Server / DC:  `customfield_10014` (modern) or
 *                        `customfield_10008` (older) string
 */
export function resolveEpic(
	fields: Record<string, unknown>,
): EpicResolved | null {
	const epic = fields.epic;
	if (epic && typeof epic === "object") {
		const e = epic as { key?: string; name?: string; summary?: string };
		if (e.key) return { key: e.key, summary: e.name ?? e.summary };
	}
	for (const k of ["customfield_10014", "customfield_10008"]) {
		const v = fields[k];
		if (typeof v === "string" && /^[A-Z][A-Z0-9_]+-\d+$/.test(v)) {
			return { key: v };
		}
	}
	return null;
}

/* -------------------------------------------------------------------------- */
/*  Slug                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Filesystem- and Obsidian-safe slug from arbitrary text. Used for
 * both file naming and wiki-link targets so they line up exactly.
 */
export function slugify(s: string): string {
	return s
		.replace(/[\\/:*?"<>|#^[\]]/g, "")
		.replace(/\s+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 80);
}
