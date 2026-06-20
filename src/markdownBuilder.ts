import {
	SECTION_MARKER,
	type FieldMapping,
	type JiraIssue,
	type NullFieldBehavior,
} from "./types";
import { i18n, t } from "./i18n";
import {
	resolveAllFields,
	type ResolvedField,
	slugify,
} from "./fieldResolver";

/**
 * v0.1.0+ i18n defaults for file body rendering. Migrated to
 * locales/*.json in the final stage.
 */
i18n.registerDefaults({
	"file.viewInJira": "View in Jira",
	"file.status": "Status",
	"file.priority": "Priority",
	"file.descriptionHeader": "📋 Description",
	"file.relatedInfoHeader": "🔗 Related Info",
	"file.tableField": "Field",
	"file.tableValue": "Value",
	"file.lastSynced": "Last synced: {{timestamp}}",
	"file.myNotesHeader": "✏️ My Notes",
	"file.noDescription": "_(No description)_",
	"file.unassigned": "_Unassigned_",

	// Per-key labels for the Related Info table. Custom fields fall
	// back to FieldMapping.jiraFieldName when no key is registered.
	"file.label.title": "Title",
	"file.label.type": "Type",
	"file.label.status": "Status",
	"file.label.priority": "Priority",
	"file.label.assignee": "Assignee",
	"file.label.reporter": "Reporter",
	"file.label.created": "Created",
	"file.label.updated": "Updated",
	"file.label.due_date": "Due Date",
	"file.label.labels": "Labels",
	"file.label.components": "Components",
	"file.label.fix_versions": "Fix Versions",
	"file.label.linked_issues": "Linked Issues",
	"file.label.epic": "Epic",
});

export interface BuildContext {
	jiraDomain: string;
	syncedAt: Date;
	mappings: FieldMapping[];
	nullFieldBehavior: NullFieldBehavior;
	dateTimezone: string;
}

/* -------------------------------------------------------------------------- */
/*  Public                                                                     */
/* -------------------------------------------------------------------------- */

export function buildNewFile(issue: JiraIssue, ctx: BuildContext): string {
	const synced = buildSyncedRegion(issue, ctx);
	return `${synced}\n\n## ${t("file.myNotesHeader")}\n\n`;
}

export function buildSyncedRegion(
	issue: JiraIssue,
	ctx: BuildContext,
): string {
	const resolved = resolveAllFields(issue, ctx.mappings, {
		nullFieldBehavior: ctx.nullFieldBehavior,
		dateTimezone: ctx.dateTimezone,
	});
	const fm = buildFrontmatter(issue, resolved, ctx);
	const body = buildBody(issue, resolved, ctx);
	return `${fm}\n${body}\n${SECTION_MARKER}`;
}

/* -------------------------------------------------------------------------- */
/*  Frontmatter                                                                */
/* -------------------------------------------------------------------------- */

function buildFrontmatter(
	issue: JiraIssue,
	resolved: ResolvedField[],
	ctx: BuildContext,
): string {
	const lines: string[] = ["---"];

	// jira_key is synthetic (PRD §3.3.2 places it first).
	lines.push(`jira_key: ${yamlString(issue.key)}`);

	for (const r of resolved) {
		// undefined → omit; null → write `null` literal.
		if (r.yaml === undefined) continue;
		if (r.yaml === null) {
			lines.push(`${r.mapping.obsidianKey}: null`);
			continue;
		}
		if (Array.isArray(r.yaml)) {
			if (r.yaml.length === 0) continue;
			lines.push(`${r.mapping.obsidianKey}:`);
			for (const el of r.yaml) lines.push(`  - ${el}`);
		} else {
			lines.push(`${r.mapping.obsidianKey}: ${r.yaml}`);
		}
	}

	// jira_url is synthetic, last (PRD §3.3.2).
	lines.push(`jira_url: ${yamlString(buildIssueUrl(ctx.jiraDomain, issue.key))}`);

	lines.push("---");
	return lines.join("\n");
}

function yamlString(s: string): string {
	return `"${s
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"')
		.replace(/\r\n/g, "\\n")
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\n")}"`;
}

/* -------------------------------------------------------------------------- */
/*  Body (region B)                                                           */
/* -------------------------------------------------------------------------- */

function buildBody(
	issue: JiraIssue,
	resolved: ResolvedField[],
	ctx: BuildContext,
): string {
	const f = issue.fields ?? {};
	const url = buildIssueUrl(ctx.jiraDomain, issue.key);
	const title = f.summary ?? "";
	const heading = `# ${issue.key}: ${title}`.trimEnd();

	const subline = [
		`> **[${t("file.viewInJira")}](${url})**`,
		`${t("file.status")}: \`${f.status?.name ?? "-"}\``,
		`${f.priority?.name ? `${t("file.priority")}: \`${f.priority.name}\`` : ""}`,
	]
		.filter((s) => s.length > 0)
		.join(" | ");

	const rawDesc = f.description ?? "";
	const desc = (typeof rawDesc === "object" && rawDesc !== null)
		? adfToMarkdown(rawDesc).trim()
		: rawDesc.toString().trim();
	const descBlock = `## ${t("file.descriptionHeader")}\n\n${
		desc.length > 0 ? desc : t("file.noDescription")
	}`;

	const relatedTable = buildRelatedInfoTable(resolved);
	const syncedAt = formatInTimezone(ctx.syncedAt, ctx.dateTimezone);
	const meta = `---\n*${t("file.lastSynced", { timestamp: syncedAt })}*`;

	return [heading, "", subline, "", descBlock, "", relatedTable, "", meta].join(
		"\n",
	);
}

function buildRelatedInfoTable(resolved: ResolvedField[]): string {
	const rows: Array<[string, string]> = [];

	for (const r of resolved) {
		// These are already conveyed by the heading and subline.
		if (
			r.mapping.jiraFieldId === "summary" ||
			r.mapping.jiraFieldId === "status" ||
			r.mapping.jiraFieldId === "priority"
		)
			continue;
		if (r.yaml === undefined || r.yaml === null) continue;
		const cell = renderCell(r);
		if (!cell) continue;
		rows.push([labelFor(r.mapping), cell]);
	}

	if (rows.length === 0) {
		return `## ${t("file.relatedInfoHeader")}\n\n_${t("file.unassigned")}_`;
	}

	const header = `| ${t("file.tableField")} | ${t("file.tableValue")} |`;
	const sep = `|---|---|`;
	const body = rows.map(([k, v]) => `| ${k} | ${v} |`).join("\n");
	return `## ${t("file.relatedInfoHeader")}\n\n${header}\n${sep}\n${body}`;
}

/**
 * Display label for a row. Prefers the localised file.label.<obsidianKey>
 * if a translation is registered; otherwise falls back to the human name
 * Jira gave us for the field.
 */
function labelFor(m: FieldMapping): string {
	const key = `file.label.${m.obsidianKey}`;
	const translated = t(key);
	if (translated !== key) return translated;
	return m.jiraFieldName || m.obsidianKey;
}

/**
 * Render a resolved field as a single Markdown table cell, using the
 * already-quoted YAML form so wiki-links and special chars round-trip.
 * For arrays we strip the outer YAML quotes and join with ", ".
 */
function renderCell(r: ResolvedField): string {
	if (r.yaml === undefined || r.yaml === null) return "";
	if (Array.isArray(r.yaml)) {
		return r.yaml.map(unwrapYamlString).filter((s) => s.length > 0).join(", ");
	}
	return unwrapYamlString(r.yaml);
}

function unwrapYamlString(yaml: string): string {
	if (yaml.length >= 2 && yaml.startsWith('"') && yaml.endsWith('"')) {
		return yaml.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
	}
	return yaml;
}

/* -------------------------------------------------------------------------- */
/*  Filenames & helpers                                                       */
/* -------------------------------------------------------------------------- */

export function buildIssueFilename(issue: JiraIssue): string {
	const summary = issue.fields?.summary ?? "";
	const slug = slugify(summary);
	const base = slug ? `${issue.key}_${slug}` : issue.key;
	return `${base}.md`;
}

function buildIssueUrl(domain: string, key: string): string {
	const base = domain.replace(/\/+$/, "");
	return `${base}/browse/${encodeURIComponent(key)}`;
}

function formatInTimezone(d: Date, tz: string): string {
	const pad = (n: number) => String(n).padStart(2, "0");

	if (tz === "local") {
		return (
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
			`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
		);
	}

	const fmt = new Intl.DateTimeFormat("en-CA", {
		timeZone: tz,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
	const hour = parts.hour === "24" ? "00" : parts.hour;
	return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
}

/* -------------------------------------------------------------------------- */
/*  Atlassian Document Format (ADF) → Markdown                               */
/* -------------------------------------------------------------------------- */

type AdfNode = {
	type?: string;
	text?: string;
	content?: AdfNode[];
	attrs?: Record<string, unknown>;
	marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

function adfToMarkdown(node: unknown): string {
	if (!node || typeof node !== "object") return "";
	const n = node as AdfNode;

	switch (n.type) {
		case "doc":
			return (n.content ?? []).map(adfToMarkdown).join("").trimEnd();

		case "paragraph":
			return (n.content ?? []).map(adfToMarkdown).join("") + "\n\n";

		case "heading": {
			const level = (n.attrs?.level as number) ?? 1;
			const text = (n.content ?? []).map(adfToMarkdown).join("");
			return `${"#".repeat(level)} ${text}\n\n`;
		}

		case "text": {
			let s = n.text ?? "";
			for (const mark of n.marks ?? []) {
				if (mark.type === "strong") s = `**${s}**`;
				else if (mark.type === "em") s = `_${s}_`;
				else if (mark.type === "code") s = `\`${s}\``;
				else if (mark.type === "strike") s = `~~${s}~~`;
				else if (mark.type === "link") {
					const href = (mark.attrs?.href as string) ?? "";
					s = `[${s}](${href})`;
				}
			}
			return s;
		}

		case "hardBreak":
			return "\n";

		case "rule":
			return "\n---\n\n";

		case "codeBlock": {
			const lang = (n.attrs?.language as string) ?? "";
			const code = (n.content ?? []).map((c) => c.text ?? "").join("");
			return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
		}

		case "blockquote":
			return (
				(n.content ?? [])
					.map(adfToMarkdown)
					.join("")
					.split("\n")
					.map((l) => (l.length ? `> ${l}` : ">"))
					.join("\n") + "\n"
			);

		case "bulletList":
			return (n.content ?? []).map((item) => adfListItem(item, "- ")).join("");

		case "orderedList": {
			let idx = (n.attrs?.order as number) ?? 1;
			return (n.content ?? [])
				.map((item) => adfListItem(item, `${idx++}. `))
				.join("");
		}

		case "mention":
			return `@${(n.attrs?.text as string) ?? (n.attrs?.id as string) ?? ""}`;

		case "emoji":
			return (n.attrs?.shortName as string) ?? "";

		case "inlineCard":
		case "blockCard":
			return (n.attrs?.url as string) ?? "";

		default:
			return (n.content ?? []).map(adfToMarkdown).join("");
	}
}

function adfListItem(item: AdfNode, prefix: string): string {
	const inner = (item.content ?? []).map(adfToMarkdown).join("").trim();
	return `${prefix}${inner}\n`;
}

/* -------------------------------------------------------------------------- */

/** Public for fileManager — read the `updated:` value from Frontmatter. */
export function extractUpdatedFromFrontmatter(
	frontmatterText: string,
): string | null {
	const m = /^updated:\s*(.+)$/m.exec(frontmatterText);
	if (!m) return null;
	const raw = m[1].trim().replace(/^["']|["']$/g, "");
	return raw.length > 0 ? raw : null;
}
