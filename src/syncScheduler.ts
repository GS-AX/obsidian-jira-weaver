/**
 * syncScheduler — owns the trigger machinery defined in PRD §3.9.
 *
 *   - manual:   commands palette only
 *   - onStartup: a single sync after the workspace is ready
 *   - interval: periodic timer with offline guard
 *
 * Also owns the in-process Lock (prevents overlapping syncs — PRD
 * §3.9.4) and the status bar element (PRD §3.9.3).
 */

import type { App } from "obsidian";
import { i18n, t } from "./i18n";
import type { SyncResult, SyncTrigger } from "./types";

i18n.registerDefaults({
	"status.idle": "Jira Weaver: Last synced {{time}}",
	"status.idleNever": "Jira Weaver: not yet synced",
	"status.syncing": "Jira Weaver: Syncing…",
	"status.failed": "Jira Weaver: ❌ Sync failed",
	"status.tooltipManual": "Click to sync now",
	"status.tooltipRunning": "Sync in progress",
	"notice.offlineSkip":
		"Jira Weaver: offline — sync skipped, will retry on next interval.",
});

export type RunMode = "manual" | "startup" | "interval";

export interface SyncOptions {
	force: boolean;
	mode: RunMode;
}

/** The plugin's actual sync worker — provided by main.ts. */
export type SyncRunner = (options: SyncOptions) => Promise<SyncResult>;

export interface SyncSchedulerConfig {
	getTrigger: () => SyncTrigger;
	getIntervalMinutes: () => number;
}

export class SyncScheduler {
	private lock = false;
	private intervalHandle: number | null = null;
	private startupHandle: number | null = null;
	private lastSyncedAt: Date | null = null;
	private statusBarEl: HTMLElement | null = null;
	private state: "idle" | "running" | "error" = "idle";

	constructor(
		private app: App,
		private runner: SyncRunner,
		private config: SyncSchedulerConfig,
		statusBarEl: HTMLElement | null,
	) {
		this.statusBarEl = statusBarEl;
		if (this.statusBarEl) {
			this.statusBarEl.addEventListener("click", () => {
				if (this.lock) return;
				void this.run({ force: false, mode: "manual" });
			});
		}
		this.refreshStatus();
	}

	/** True while a sync is in flight (Lock held). */
	isRunning(): boolean {
		return this.lock;
	}

	/**
	 * Reconcile timers with the current trigger setting. Called from
	 * onload and again whenever the user changes settings.syncTrigger
	 * or settings.syncInterval.
	 */
	applyTrigger(): void {
		this.cancelInterval();
		this.cancelStartup();

		const trigger = this.config.getTrigger();

		if (trigger === "onStartup") {
			this.scheduleStartup();
		}
		if (trigger === "interval") {
			this.scheduleInterval();
		}
		this.refreshStatus();
	}

	/** Stop all timers — called on unload. */
	detach(): void {
		this.cancelInterval();
		this.cancelStartup();
	}

	/**
	 * Public entry for both command-palette invocations and status-bar
	 * clicks. Wraps {@link run} with the manual mode so the runner may
	 * surface progress notices.
	 */
	async triggerManual(options: { force: boolean }): Promise<void> {
		await this.run({ force: options.force, mode: "manual" });
	}

	/* ------------------------------------------------------------------ */

	private scheduleStartup(): void {
		// Obsidian's onload may run before the workspace is ready; wait
		// so vault scans and metadata cache are reliable.
		this.app.workspace.onLayoutReady(() => {
			this.startupHandle = window.setTimeout(() => {
				this.startupHandle = null;
				if (!navigator.onLine) {
					console.info(
						"[Jira Weaver] startup sync skipped — offline",
					);
					return;
				}
				void this.run({ force: false, mode: "startup" });
			}, 0);
		});
	}

	private cancelStartup(): void {
		if (this.startupHandle !== null) {
			window.clearTimeout(this.startupHandle);
			this.startupHandle = null;
		}
	}

	private scheduleInterval(): void {
		const minutes = clampInterval(this.config.getIntervalMinutes());
		const ms = minutes * 60 * 1000;
		this.intervalHandle = window.setInterval(() => {
			if (this.lock) return; // a manual sync is in flight
			if (!navigator.onLine) {
				console.info(
					"[Jira Weaver] interval sync skipped — offline",
				);
				return;
			}
			void this.run({ force: false, mode: "interval" });
		}, ms);
	}

	private cancelInterval(): void {
		if (this.intervalHandle !== null) {
			window.clearInterval(this.intervalHandle);
			this.intervalHandle = null;
		}
	}

	/* ------------------------------------------------------------------ */

	private async run(options: SyncOptions): Promise<void> {
		if (this.lock) return;
		this.lock = true;
		this.state = "running";
		this.refreshStatus();
		try {
			await this.runner(options);
			this.lastSyncedAt = new Date();
			this.state = "idle";
		} catch (e) {
			this.state = "error";
			console.error("[Jira Weaver] sync failed", e);
			throw e;
		} finally {
			this.lock = false;
			this.refreshStatus();
		}
	}

	/* ------------------------------------------------------------------ */
	/*  Status bar                                                        */
	/* ------------------------------------------------------------------ */

	private refreshStatus(): void {
		if (!this.statusBarEl) return;

		const trigger = this.config.getTrigger();
		// PRD §3.9.3: status bar is shown when trigger is onStartup or
		// interval. Hide otherwise so manual-only users keep a clean bar.
		if (trigger === "manual") {
			this.statusBarEl.empty();
			this.statusBarEl.removeClass("jira-weaver-status-visible");
			return;
		}
		this.statusBarEl.addClass("jira-weaver-status-visible");
		this.statusBarEl.empty();

		let label: string;
		let title: string;
		if (this.state === "running") {
			label = t("status.syncing");
			title = t("status.tooltipRunning");
		} else if (this.state === "error") {
			label = t("status.failed");
			title = t("status.tooltipManual");
		} else {
			label = this.lastSyncedAt
				? t("status.idle", { time: formatHHMM(this.lastSyncedAt) })
				: t("status.idleNever");
			title = t("status.tooltipManual");
		}

		this.statusBarEl.setText(label);
		this.statusBarEl.title = title;
	}
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function clampInterval(minutes: number): number {
	if (!Number.isFinite(minutes) || minutes < 1) return 30;
	if (minutes > 1440) return 1440; // hard cap at one day
	return Math.floor(minutes);
}

function formatHHMM(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
