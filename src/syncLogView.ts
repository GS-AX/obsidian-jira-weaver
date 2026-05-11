import { ItemView, type WorkspaceLeaf } from "obsidian";
import { i18n, t } from "./i18n";
import type { SyncLogEntry } from "./types";

export const SYNC_LOG_VIEW_TYPE = "jira-weaver-sync-log";

i18n.registerDefaults({
	"log.viewTitle": "Jira Weaver Log",
	"log.empty": "No sync runs recorded yet.",
	"log.clear": "Clear log",
	"log.created": "Created",
	"log.updated": "Updated",
	"log.skipped": "Skipped",
	"log.errors": "Errors",
	"log.markerWarnings": "Warnings",
	"log.modeManual": "Manual",
	"log.modeStartup": "Startup",
	"log.modeInterval": "Interval",
	"log.errorDetail": "Errors detail",
});

/** Callback supplied by main.ts to avoid a circular dependency. */
export type ClearLogFn = () => void;

export class SyncLogView extends ItemView {
	private onClear: ClearLogFn;
	private getEntries: () => SyncLogEntry[];

	constructor(
		leaf: WorkspaceLeaf,
		getEntries: () => SyncLogEntry[],
		onClear: ClearLogFn,
	) {
		super(leaf);
		this.getEntries = getEntries;
		this.onClear = onClear;
	}

	getViewType(): string {
		return SYNC_LOG_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t("log.viewTitle");
	}

	getIcon(): string {
		return "list-checks";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		/* nothing to clean up */
	}

	/** Called by main.ts after every sync run to refresh the view. */
	refresh(): void {
		if (this.containerEl.isConnected) this.render();
	}

	/* ------------------------------------------------------------------ */

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		const headerEl = contentEl.createDiv({ cls: "jira-weaver-log-header" });
		headerEl.createEl("h4", { text: t("log.viewTitle") });

		const clearBtn = headerEl.createEl("button", { text: t("log.clear") });
		clearBtn.addEventListener("click", () => {
			this.onClear();
			this.render();
		});

		const entries = this.getEntries();
		if (entries.length === 0) {
			contentEl.createEl("p", {
				text: t("log.empty"),
				cls: "jira-weaver-log-empty",
			});
			return;
		}

		const listEl = contentEl.createDiv({ cls: "jira-weaver-log-list" });
		for (const entry of entries) {
			this.renderEntry(listEl, entry);
		}
	}

	private renderEntry(host: HTMLElement, entry: SyncLogEntry): void {
		const el = host.createDiv({ cls: "jira-weaver-log-entry" });

		// Header row: time · profile · mode · duration
		const headerEl = el.createDiv({ cls: "jira-weaver-log-entry-header" });
		const ts = new Date(entry.timestamp);
		headerEl.createEl("span", {
			text: formatTimestamp(ts),
			cls: "jira-weaver-log-time",
		});
		headerEl.createEl("span", {
			text: entry.profileName,
			cls: "jira-weaver-log-profile",
		});
		const modeKey = `log.mode${capitalize(entry.mode)}`;
		headerEl.createEl("span", {
			text: t(modeKey),
			cls: "jira-weaver-log-mode",
		});
		headerEl.createEl("span", {
			text: `${entry.durationMs} ms`,
			cls: "jira-weaver-log-duration",
		});

		// Stats row
		const statsEl = el.createDiv({ cls: "jira-weaver-log-entry-stats" });
		const r = entry.result;
		addStat(statsEl, t("log.created"), r.created);
		addStat(statsEl, t("log.updated"), r.updated);
		addStat(statsEl, t("log.skipped"), r.skipped);
		if (r.errors > 0) {
			const errEl = addStat(statsEl, t("log.errors"), r.errors);
			errEl.style.color = "var(--color-red)";
		}
		if (r.markerWarnings.length > 0) {
			addStat(statsEl, t("log.markerWarnings"), r.markerWarnings.length);
		}

		// Error detail lines
		if (r.errorDetails.length > 0) {
			const detailEl = el.createDiv({ cls: "jira-weaver-log-entry-errors" });
			for (const e of r.errorDetails) {
				detailEl.createEl("p", {
					text: `${e.key}: ${e.reason}`,
					cls: "jira-weaver-log-error-detail",
				});
			}
		}
	}
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function addStat(host: HTMLElement, label: string, value: number): HTMLElement {
	const el = host.createEl("span", {
		text: `${label}: ${value}`,
		cls: "jira-weaver-log-stat",
	});
	return el;
}

function formatTimestamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	);
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
