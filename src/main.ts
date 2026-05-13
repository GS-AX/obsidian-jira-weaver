import { Notice, Plugin } from "obsidian";

import { i18n, resolveLocale, t } from "./i18n";
import { JiraClient, JiraClientError } from "./jiraClient";
import { FileManager } from "./fileManager";
import { JiraWeaverSettingTab } from "./settings";
import { buildRequestedFields } from "./fieldResolver";
import { SyncScheduler, type SyncOptions } from "./syncScheduler";
import { SYNC_LOG_VIEW_TYPE, SyncLogView } from "./syncLogView";
import {
	DEFAULT_SETTINGS,
	buildDefaultFieldMappings,
	emptySyncResult,
	type FieldCatalogEntry,
	type JiraIssue,
	type JqlProfile,
	type JiraPluginSettings,
	type SupportedLocale,
	type SyncLogEntry,
	type SyncResult,
} from "./types";

import enLocale from "../locales/en.json";
import koLocale from "../locales/ko.json";
import jaLocale from "../locales/ja.json";
import zhLocale from "../locales/zh.json";

i18n.registerDefaults({
	"notice.settingsIncomplete":
		"Jira Weaver: please complete connection settings before syncing.",
	"notice.syncStart": "Jira Weaver: syncing…",
	"notice.syncDone":
		"Jira Weaver sync complete — created {{created}}, updated {{updated}}, skipped {{skipped}}, errors {{errors}}.",
	"notice.syncDoneWithMarkerWarnings":
		"Jira Weaver sync complete — created {{created}}, updated {{updated}}, skipped {{skipped}}, errors {{errors}}. ⚠ {{markers}} file(s) had no marker.",
	"notice.syncDoneEmpty": "Jira Weaver: no issues matched your JQL.",
	"notice.fieldsReloadStart": "Jira Weaver: reloading field list…",
	"notice.fieldsReloadDone":
		"Jira Weaver: loaded {{count}} fields ({{custom}} custom).",
	"error.network": "Jira Weaver: network error — check connection and domain URL.",
	"error.auth":
		"Jira Weaver: authentication failed — verify your Personal Access Token.",
	"error.jql": "Jira Weaver: JQL error — {{message}}",
	"error.http": "Jira Weaver: Jira returned HTTP {{status}} — {{message}}",
	"error.parse": "Jira Weaver: could not parse Jira response.",
	"error.unexpected": "Jira Weaver: unexpected error — {{message}}",
});

export default class JiraWeaverPlugin extends Plugin {
	settings: JiraPluginSettings = { ...DEFAULT_SETTINGS };
	private scheduler!: SyncScheduler;
	private statusBarEl: HTMLElement | null = null;
	syncLog: SyncLogEntry[] = [];

	async onload(): Promise<void> {
		await this.loadSettings();
		this.bootstrapI18n();

		// Register the sync log view
		this.registerView(SYNC_LOG_VIEW_TYPE, (leaf) => {
			return new SyncLogView(
				leaf,
				() => this.syncLog,
				() => {
					this.syncLog = [];
				},
			);
		});

		this.statusBarEl = this.addStatusBarItem();
		this.scheduler = new SyncScheduler(
			this.app,
			(opts) => this.executeSync(opts),
			{
				getTrigger: () => this.settings.syncTrigger,
				getIntervalMinutes: () => this.settings.syncInterval,
			},
			this.statusBarEl,
		);

		this.addSettingTab(new JiraWeaverSettingTab(this.app, this));

		this.addCommand({
			id: "sync-issues",
			name: "Sync Issues",
			callback: () => this.runManualSync({ force: false }),
		});

		this.addCommand({
			id: "force-sync-issues",
			name: "Force Sync Issues (Overwrite All)",
			callback: () => this.runManualSync({ force: true }),
		});

		this.addCommand({
			id: "reload-field-list",
			name: "Reload Field List",
			callback: () => this.reloadFieldCatalog(),
		});

		this.addCommand({
			id: "open-sync-log",
			name: "Open Sync Log",
			callback: () => this.openSyncLog(),
		});

		this.scheduler.applyTrigger();
	}

	onunload(): void {
		this.scheduler?.detach();
	}

	private bootstrapI18n(): void {
		i18n.load("en", enLocale as Record<string, string>);
		i18n.load("ko", koLocale as Record<string, string>);
		i18n.load("ja", jaLocale as Record<string, string>);
		i18n.load("zh", zhLocale as Record<string, string>);
		this.applyLanguage();
	}

	applyLanguage(): void {
		const locale: SupportedLocale = resolveLocale(this.settings.language);
		i18n.setLocale(locale);
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<JiraPluginSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };

		if (
			!this.settings.fieldMappings ||
			this.settings.fieldMappings.length === 0
		) {
			this.settings.fieldMappings = buildDefaultFieldMappings();
		}

		// v0.5.0 migration: promote legacy single-profile fields to jqlProfiles
		if (!this.settings.jqlProfiles || this.settings.jqlProfiles.length === 0) {
			if (this.settings.jqlQuery) {
				this.settings.jqlProfiles = [
					{
						id: crypto.randomUUID(),
						name: "Default",
						jqlQuery: this.settings.jqlQuery,
						targetFolder: this.settings.targetFolder || "Jira/Issues",
						maxResults: this.settings.maxResults || 50,
						enabled: true,
					},
				];
				await this.saveSettings();
			}
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshScheduler(): void {
		this.scheduler?.applyTrigger();
	}

	/* ------------------------------------------------------------------ */
	/*  Sync Log view                                                      */
	/* ------------------------------------------------------------------ */

	async openSyncLog(): Promise<void> {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(SYNC_LOG_VIEW_TYPE);
		if (leaves.length > 0) {
			void workspace.revealLeaf(leaves[0]);
			return;
		}
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: SYNC_LOG_VIEW_TYPE, active: true });
			void workspace.revealLeaf(leaf);
		}
	}

	private pushLogEntry(entry: SyncLogEntry): void {
		this.syncLog.unshift(entry);
		if (this.syncLog.length > 200) this.syncLog.pop();
		// Refresh open views
		this.app.workspace.getLeavesOfType(SYNC_LOG_VIEW_TYPE).forEach((leaf) => {
			if (leaf.view instanceof SyncLogView) leaf.view.refresh();
		});
	}

	/* ------------------------------------------------------------------ */
	/*  Manual sync entry                                                  */
	/* ------------------------------------------------------------------ */

	async runManualSync(options: { force: boolean }): Promise<void> {
		if (this.scheduler.isRunning()) return;
		if (!this.settingsComplete()) {
			new Notice(t("notice.settingsIncomplete"));
			return;
		}
		try {
			await this.scheduler.triggerManual(options);
		} catch (e) {
			this.reportError(e);
		}
	}

	private settingsComplete(): boolean {
		const s = this.settings;
		if (!s.jiraDomain || !s.personalAccessToken) return false;
		if (s.authMode === "basic" && !s.jiraEmail) return false;
		const enabledProfiles = (s.jqlProfiles ?? []).filter(
			(p) => p.enabled && p.jqlQuery && p.targetFolder,
		);
		return enabledProfiles.length > 0;
	}

	private async executeSync(opts: SyncOptions): Promise<SyncResult> {
		if (!this.settingsComplete()) {
			if (opts.mode === "manual") new Notice(t("notice.settingsIncomplete"));
			return emptySyncResult();
		}

		if (opts.mode === "manual") new Notice(t("notice.syncStart"));

		const aggregate = emptySyncResult();

		const profiles = (this.settings.jqlProfiles ?? []).filter(
			(p) => p.enabled && p.jqlQuery && p.targetFolder,
		);

		for (const profile of profiles) {
			const start = Date.now();
			let profileResult: SyncResult;
			try {
				profileResult = await this.doSyncProfile(profile, opts);
			} catch (e) {
				this.reportError(e);
				profileResult = emptySyncResult();
				profileResult.errors = 1;
			}

			// Aggregate
			aggregate.created += profileResult.created;
			aggregate.updated += profileResult.updated;
			aggregate.skipped += profileResult.skipped;
			aggregate.errors += profileResult.errors;
			aggregate.errorDetails.push(...profileResult.errorDetails);
			aggregate.markerWarnings.push(...profileResult.markerWarnings);

			// Log entry per profile
			this.pushLogEntry({
				id: crypto.randomUUID(),
				timestamp: new Date().toISOString(),
				profileName: profile.name,
				result: profileResult,
				durationMs: Date.now() - start,
				mode: opts.mode,
			});
		}

		this.reportResult(aggregate, opts);
		return aggregate;
	}

	private async doSyncProfile(
		profile: JqlProfile,
		opts: SyncOptions,
	): Promise<SyncResult> {
		const client = this.buildClient();
		const fm = new FileManager(this.app);
		await fm.ensureFolder(profile.targetFolder);
		await fm.buildKeyMap(profile.targetFolder);

		const requestedFields = buildRequestedFields(this.settings.fieldMappings);
		const search = await client.searchIssues({
			jql: profile.jqlQuery,
			maxResults: profile.maxResults,
			fields: requestedFields,
		});

		const result = emptySyncResult();
		const ctx = {
			jiraDomain: this.settings.jiraDomain,
			syncedAt: new Date(),
			targetFolder: profile.targetFolder,
			mappings: this.settings.fieldMappings,
			nullFieldBehavior: this.settings.nullFieldBehavior,
			noMarkerBehavior: this.settings.noMarkerBehavior,
		};

		for (const issue of search.issues ?? []) {
			try {
				const detail = await fm.syncIssue(
					issue as JiraIssue,
					ctx,
					{ force: opts.force },
				);
				if (detail.outcome === "created") result.created++;
				else if (detail.outcome === "updated") result.updated++;
				else result.skipped++;

				if (detail.markerWarning) {
					result.markerWarnings.push({
						key: issue?.key ?? "?",
						path: detail.markerWarning.path,
						behavior: detail.markerWarning.behavior,
					});
				}
			} catch (e) {
				result.errors++;
				result.errorDetails.push({
					key: issue?.key ?? "?",
					reason: e instanceof Error ? e.message : String(e),
				});
				console.error("[Jira Weaver] issue sync failed", issue?.key, e);
			}
		}

		return result;
	}

	private buildClient(): JiraClient {
		return new JiraClient({
			jiraDomain: this.settings.jiraDomain,
			personalAccessToken: this.settings.personalAccessToken,
			authMode: this.settings.authMode,
			jiraEmail: this.settings.jiraEmail,
		});
	}

	private reportResult(r: SyncResult, opts: SyncOptions): void {
		const total = r.created + r.updated + r.skipped + r.errors;

		if (opts.mode === "interval" && r.errors === 0) return;

		if (total === 0) {
			if (opts.mode !== "interval") new Notice(t("notice.syncDoneEmpty"));
			return;
		}

		const msg =
			r.markerWarnings.length > 0
				? t("notice.syncDoneWithMarkerWarnings", {
						created: r.created,
						updated: r.updated,
						skipped: r.skipped,
						errors: r.errors,
						markers: r.markerWarnings.length,
					})
				: t("notice.syncDone", {
						created: r.created,
						updated: r.updated,
						skipped: r.skipped,
						errors: r.errors,
					});

		new Notice(msg, 6000);

		if (r.markerWarnings.length > 0) {
			console.warn(
				"[Jira Weaver] marker missing — affected files:",
				r.markerWarnings,
			);
		}
	}

	/* ------------------------------------------------------------------ */
	/*  Field catalog                                                      */
	/* ------------------------------------------------------------------ */

	async reloadFieldCatalog(): Promise<void> {
		if (!this.settings.jiraDomain || !this.settings.personalAccessToken) {
			new Notice(t("notice.settingsIncomplete"));
			return;
		}
		new Notice(t("notice.fieldsReloadStart"));
		try {
			const client = this.buildClient();
			const raw = await client.listFields();
			const catalog: FieldCatalogEntry[] = raw.map((f) => ({
				id: f.id,
				name: f.name,
				custom: !!f.custom,
				schema: f.schema as FieldCatalogEntry["schema"],
			}));
			this.settings.fieldCatalog = catalog;
			this.settings.fieldCatalogFetchedAt = new Date().toISOString();

			const byId = new Map(catalog.map((f) => [f.id, f]));
			this.settings.fieldMappings = this.settings.fieldMappings.map((m) => {
				const cat = byId.get(m.jiraFieldId);
				if (!cat) return { ...m, missing: true };
				return { ...m, jiraFieldName: cat.name, missing: false };
			});

			await this.saveSettings();
			const customCount = catalog.filter((f) => f.custom).length;
			new Notice(
				t("notice.fieldsReloadDone", {
					count: catalog.length,
					custom: customCount,
				}),
			);
		} catch (e) {
			this.reportError(e);
		}
	}

	/* ------------------------------------------------------------------ */

	private reportError(e: unknown): void {
		if (e instanceof JiraClientError) {
			switch (e.code) {
				case "settingsIncomplete":
					new Notice(t("notice.settingsIncomplete"));
					return;
				case "network":
					new Notice(t("error.network"));
					return;
				case "auth":
					new Notice(t("error.auth"));
					return;
				case "jql":
					new Notice(t("error.jql", { message: e.detail ?? e.message }));
					return;
				case "parse":
					new Notice(t("error.parse"));
					return;
				case "http":
					new Notice(
						t("error.http", {
							status: e.httpStatus ?? "?",
							message: e.detail ?? e.message,
						}),
					);
					return;
			}
		}
		new Notice(
			t("error.unexpected", {
				message: e instanceof Error ? e.message : String(e),
			}),
		);
		console.error("[Jira Weaver] unexpected error", e);
	}
}
