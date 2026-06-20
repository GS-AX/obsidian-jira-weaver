import {
	normalizePath,
	TFile,
	TFolder,
	type App,
	type TAbstractFile,
	type Vault,
} from "obsidian";

import { i18n } from "./i18n";
import {
	buildIssueFilename,
	buildNewFile,
	buildSyncedRegion,
	extractUpdatedFromFrontmatter,
} from "./markdownBuilder";
import {
	SECTION_MARKER,
	type FieldMapping,
	type JiraIssue,
	type NoMarkerBehavior,
	type NullFieldBehavior,
	type SyncResult,
} from "./types";

i18n.registerDefaults({
	"file.markerLost":
		"Marker missing in {{path}} — {{behavior}} (memo protection unavailable).",
});

/**
 * Memo protection (PRD §3.5):
 *   marker present  →  preserve everything after the marker (region C)
 *   marker missing  →  apply settings.noMarkerBehavior:
 *                      - "overwrite": full rewrite (default)
 *                      - "skip":      do nothing, log warning
 *                      - "append":    append fresh synced region to end
 */

export interface IssueSyncResult {
	outcome: "created" | "updated" | "skipped";
	/**
	 * Set when the file was processed via a noMarkerBehavior fallback.
	 * The plugin aggregates these into {@link SyncResult.markerWarnings}.
	 */
	markerWarning?: { path: string; behavior: NoMarkerBehavior };
}

export interface FileManagerContext {
	jiraDomain: string;
	syncedAt: Date;
	targetFolder: string;
	mappings: FieldMapping[];
	nullFieldBehavior: NullFieldBehavior;
	noMarkerBehavior: NoMarkerBehavior;
	dateTimezone: string;
}

export class FileManager {
	private vault: Vault;
	private keyMap: Map<string, TFile> | null = null;

	constructor(private app: App) {
		this.vault = app.vault;
	}

	async ensureFolder(folderPath: string): Promise<void> {
		const path = normalizePath(folderPath);
		if (!path) return;
		const existing = this.vault.getAbstractFileByPath(path);
		if (existing) return;
		await this.vault.createFolder(path);
	}

	async buildKeyMap(targetFolder: string): Promise<Map<string, TFile>> {
		const map = new Map<string, TFile>();
		const folder = this.vault.getAbstractFileByPath(
			normalizePath(targetFolder),
		);
		if (!folder || !isFolder(folder)) {
			this.keyMap = map;
			return map;
		}
		const files = collectMarkdownFiles(folder);
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const key: unknown = cache?.frontmatter?.["jira_key"];
			if (typeof key === "string" && key.length > 0) {
				map.set(key, file);
			}
		}
		this.keyMap = map;
		return map;
	}

	/**
	 * Sync one Jira issue. Errors propagate; the caller turns them into
	 * SyncResult.errorDetails. The richer return type lets the caller
	 * capture marker-warning paths for the result Notice (PRD §3.5.4).
	 *
	 * @param force when true, skip the `updated` comparison and always
	 *              rewrite (memo protection still applies — PRD §3.5.3).
	 */
	async syncIssue(
		issue: JiraIssue,
		ctx: FileManagerContext,
		options: { force?: boolean } = {},
	): Promise<IssueSyncResult> {
		await this.ensureFolder(ctx.targetFolder);
		if (!this.keyMap) await this.buildKeyMap(ctx.targetFolder);

		const existing = this.keyMap?.get(issue.key) ?? null;
		if (!existing) {
			return this.createNew(issue, ctx);
		}

		const localUpdated = await readLocalUpdated(this.vault, existing);
		const jiraUpdated = issue.fields?.updated ?? null;
		if (
			!options.force &&
			localUpdated &&
			jiraUpdated &&
			!isJiraNewer(jiraUpdated, localUpdated)
		) {
			return { outcome: "skipped" };
		}

		return this.rewriteSyncedRegion(existing, issue, ctx);
	}

	private async createNew(
		issue: JiraIssue,
		ctx: FileManagerContext,
	): Promise<IssueSyncResult> {
		const filename = buildIssueFilename(issue);
		const path = normalizePath(`${ctx.targetFolder}/${filename}`);
		// Stale file at this path with no jira_key in frontmatter — treat
		// as a collision and skip rather than overwriting unknown content.
		const existing = this.vault.getAbstractFileByPath(path);
		if (existing) {
			return { outcome: "skipped" };
		}
		const content = buildNewFile(issue, toBuildCtx(ctx));
		const file = await this.vault.create(path, content);
		this.keyMap?.set(issue.key, file);
		return { outcome: "created" };
	}

	/**
	 * Replace regions A+B (Frontmatter + Jira body up to and including
	 * the marker) while preserving everything after the marker (region
	 * C). When the marker is missing, fall back to settings.noMarkerBehavior
	 * (PRD §3.5.2) and surface a warning to the caller.
	 */
	private async rewriteSyncedRegion(
		file: TFile,
		issue: JiraIssue,
		ctx: FileManagerContext,
	): Promise<IssueSyncResult> {
		const oldContent = await this.vault.read(file);
		const markerIdx = oldContent.indexOf(SECTION_MARKER);
		const synced = buildSyncedRegion(issue, toBuildCtx(ctx));

		// Happy path — marker present, region C preserved verbatim.
		if (markerIdx !== -1) {
			const tail = oldContent.slice(markerIdx + SECTION_MARKER.length);
			await this.vault.modify(file, `${synced}${tail}`);
			return { outcome: "updated" };
		}

		const warning = { path: file.path, behavior: ctx.noMarkerBehavior };

		switch (ctx.noMarkerBehavior) {
			case "skip":
				return { outcome: "skipped", markerWarning: warning };

			case "append": {
				// Append a synced region at the end while leaving the original
				// content (which is now considered "memo by default") intact.
				const sep = oldContent.endsWith("\n") ? "\n" : "\n\n";
				const next = `${oldContent}${sep}${synced}\n`;
				await this.vault.modify(file, next);
				return { outcome: "updated", markerWarning: warning };
			}

			case "overwrite":
			default: {
				// Full rewrite — restores the marker + a fresh My Notes header
				// so future syncs are protected again.
				const next = buildNewFile(issue, toBuildCtx(ctx));
				await this.vault.modify(file, next);
				return { outcome: "updated", markerWarning: warning };
			}
		}
	}
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function toBuildCtx(ctx: FileManagerContext) {
	return {
		jiraDomain: ctx.jiraDomain,
		syncedAt: ctx.syncedAt,
		mappings: ctx.mappings,
		nullFieldBehavior: ctx.nullFieldBehavior,
		dateTimezone: ctx.dateTimezone,
	};
}

function isFolder(f: TAbstractFile): f is TFolder {
	return f instanceof TFolder;
}

function collectMarkdownFiles(folder: TFolder): TFile[] {
	const out: TFile[] = [];
	const stack: TFolder[] = [folder];
	while (stack.length > 0) {
		const cur = stack.pop()!;
		for (const child of cur.children) {
			if (isFolder(child)) {
				stack.push(child);
			} else if (child instanceof TFile && child.extension === "md") {
				out.push(child);
			}
		}
	}
	return out;
}

async function readLocalUpdated(
	vault: Vault,
	file: TFile,
): Promise<string | null> {
	const content = await vault.read(file);
	const m = /^---\n([\s\S]*?)\n---/.exec(content);
	if (!m) return null;
	return extractUpdatedFromFrontmatter(m[1]);
}

function isJiraNewer(jira: string, local: string): boolean {
	const j = Date.parse(jira);
	const l = Date.parse(local);
	if (!isNaN(j) && !isNaN(l)) return j > l;
	return jira > local;
}

export function summarizeResults(r: SyncResult): string {
	return `created=${r.created} updated=${r.updated} skipped=${r.skipped} errors=${r.errors} markerWarnings=${r.markerWarnings.length}`;
}
