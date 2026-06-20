import { Modal, Notice, PluginSettingTab, Setting, type App } from "obsidian";
import type JiraWeaverPlugin from "./main";
import { i18n, t } from "./i18n";
import { FieldMappingPanel } from "./fieldMappingTab";
import type {
	AuthMode,
	JqlProfile,
	LanguageSetting,
	NoMarkerBehavior,
	SyncTrigger,
} from "./types";

i18n.registerDefaults({
	"settings.title": "Jira Weaver",

	// Connection
	"settings.connectionHeader": "Connection",
	"settings.domainName": "Jira domain",
	"settings.domainDesc":
		"Base URL of your Jira instance, e.g. https://mycompany.atlassian.net.",
	"settings.domainPlaceholder": "https://mycompany.atlassian.net",

	// Auth
	"settings.authHeader": "Authentication",
	"settings.authModeName": "Auth mode",
	"settings.authModeDesc":
		"Bearer token for Jira Server / Data Center. Basic auth (email + API token) for Jira Cloud.",
	"settings.authModeBearer": "Bearer token (Server / Data Center)",
	"settings.authModeBasic": "Basic auth (Cloud)",
	"settings.emailName": "Jira email",
	"settings.emailDesc": "Email address used with Basic auth (Jira Cloud only).",
	"settings.emailPlaceholder": "you@company.com",
	"settings.tokenName": "Personal Access Token",
	"settings.tokenDesc":
		"Token used to authenticate API requests. Stored locally; never shared.",
	"settings.tokenPlaceholder": "ATATxxxxxxxx",

	// JQL Profiles
	"settings.profilesHeader": "JQL Profiles",
	"settings.profilesDesc":
		"Each enabled profile is synced in sequence. Add multiple profiles to sync different JQL queries into different folders.",
	"settings.profileAdd": "Add profile",
	"settings.profileNew": "New Profile",
	"settings.profileName": "Profile name",
	"settings.profileEnabled": "Enabled",
	"settings.profileJql": "JQL query",
	"settings.profileFolder": "Target folder",
	"settings.profileMaxResults": "Max results",
	"settings.profileDelete": "Delete",
	"settings.profileAtLeastOne": "At least one profile is required.",

	// Advanced
	"settings.advancedHeader": "Advanced",
	"settings.nullBehaviorName": "Null field behavior",
	"settings.nullBehaviorDesc":
		"How to handle Jira fields whose value is null/empty. \"omit\" leaves the key out; \"explicit\" writes null.",
	"settings.nullBehaviorOmit": "Omit (default)",
	"settings.nullBehaviorExplicit": "Explicit null",

	// Timezone
	"settings.timezoneName": "Date timezone",
	"settings.timezoneDesc":
		"Timezone used when converting Jira date/datetime fields and the Last synced timestamp. \"Local\" follows your system clock.",
	"settings.timezoneLocal": "Local (system)",

	// Language
	"settings.languageName": "Language",
	"settings.languageDesc":
		"Plugin UI, notices, and generated file content language. \"Auto\" follows your Obsidian app language.",
	"settings.languageAuto": "Auto-detect",
	"settings.languageEn": "English",
	"settings.languageKo": "한국어",
	"settings.languageJa": "日本語",
	"settings.languageZh": "中文(简体)",

	// Trigger
	"settings.triggerHeader": "Trigger",
	"settings.triggerName": "Sync trigger",
	"settings.triggerDesc":
		"How sync runs are started. \"Manual\" uses the command palette only. \"On startup\" syncs once when Obsidian opens. \"Interval\" syncs periodically.",
	"settings.triggerManual": "Manual",
	"settings.triggerOnStartup": "On startup",
	"settings.triggerInterval": "Interval",
	"settings.intervalName": "Sync interval (minutes)",
	"settings.intervalDesc":
		"Used only when trigger is \"Interval\". Minimum 1, maximum 1440.",

	// Memo protection
	"settings.memoHeader": "Memo protection",
	"settings.memoBehaviorName": "When the marker is missing",
	"settings.memoBehaviorDesc":
		"How to sync a file whose <!-- jira-weaver:end --> marker has been removed (memo protection unavailable).",
	"settings.memoBehaviorOverwrite": "Overwrite (default)",
	"settings.memoBehaviorSkip": "Skip the file",
	"settings.memoBehaviorAppend": "Append new block to file end",
});

export class JiraWeaverSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: JiraWeaverPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName(t("settings.title")).setHeading();

		// ── Connection ──────────────────────────────────────────────────
		new Setting(containerEl)
			.setName(t("settings.connectionHeader"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("settings.domainName"))
			.setDesc(t("settings.domainDesc"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.domainPlaceholder"))
					.setValue(this.plugin.settings.jiraDomain)
					.onChange(async (value) => {
						this.plugin.settings.jiraDomain = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		// ── Authentication ──────────────────────────────────────────────
		new Setting(containerEl)
			.setName(t("settings.authHeader"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("settings.authModeName"))
			.setDesc(t("settings.authModeDesc"))
			.addDropdown((dd) => {
				dd.addOption("bearer", t("settings.authModeBearer"));
				dd.addOption("basic", t("settings.authModeBasic"));
				dd.setValue(this.plugin.settings.authMode ?? "bearer");
				dd.onChange(async (v) => {
					this.plugin.settings.authMode = v as AuthMode;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		if (this.plugin.settings.authMode === "basic") {
			new Setting(containerEl)
				.setName(t("settings.emailName"))
				.setDesc(t("settings.emailDesc"))
				.addText((text) =>
					text
						.setPlaceholder(t("settings.emailPlaceholder"))
						.setValue(this.plugin.settings.jiraEmail ?? "")
						.onChange(async (value) => {
							this.plugin.settings.jiraEmail = value.trim();
							await this.plugin.saveSettings();
						}),
				);
		}

		new Setting(containerEl)
			.setName(t("settings.tokenName"))
			.setDesc(t("settings.tokenDesc"))
			.addText((text) => {
				text
					.setPlaceholder(t("settings.tokenPlaceholder"))
					.setValue(this.plugin.settings.personalAccessToken)
					.onChange(async (value) => {
						this.plugin.settings.personalAccessToken = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
				text.inputEl.autocomplete = "off";
				text.inputEl.spellcheck = false;
			});

		// ── JQL Profiles ────────────────────────────────────────────────
		new Setting(containerEl)
			.setName(t("settings.profilesHeader"))
			.setDesc(t("settings.profilesDesc"))
			.setHeading();

		const profileHost = containerEl.createDiv({ cls: "jira-weaver-profiles" });
		this.renderProfiles(profileHost);

		const addBtn = containerEl.createEl("button", {
			text: `+ ${t("settings.profileAdd")}`,
			cls: "jira-weaver-profile-add",
		});
		addBtn.addEventListener("click", () => {
			new JqlProfileModal(this.app, null, (profile) => {
				this.plugin.settings.jqlProfiles.push(profile);
				void this.plugin.saveSettings().then(() => this.display());
			}).open();
		});

		// ── Field Mapping ────────────────────────────────────────────────
		const mappingHost = containerEl.createDiv();
		new FieldMappingPanel(this.app, this.plugin, mappingHost).render();

		// ── Advanced ────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName(t("settings.advancedHeader"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("settings.nullBehaviorName"))
			.setDesc(t("settings.nullBehaviorDesc"))
			.addDropdown((dd) => {
				dd.addOption("omit", t("settings.nullBehaviorOmit"));
				dd.addOption("explicit", t("settings.nullBehaviorExplicit"));
				dd.setValue(this.plugin.settings.nullFieldBehavior);
				dd.onChange(async (v) => {
					this.plugin.settings.nullFieldBehavior =
						v === "explicit" ? "explicit" : "omit";
					await this.plugin.saveSettings();
				});
			});

		// ── Timezone ─────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName(t("settings.timezoneName"))
			.setDesc(t("settings.timezoneDesc"))
			.addDropdown((dd) => {
				const zones: Array<[string, string]> = [
					["local",            t("settings.timezoneLocal")],
					["UTC",              "UTC"],
					["Asia/Seoul",       "Asia/Seoul (KST, UTC+9)"],
					["Asia/Tokyo",       "Asia/Tokyo (JST, UTC+9)"],
					["Asia/Shanghai",    "Asia/Shanghai (CST, UTC+8)"],
					["Asia/Singapore",   "Asia/Singapore (SGT, UTC+8)"],
					["Asia/Kolkata",     "Asia/Kolkata (IST, UTC+5:30)"],
					["Europe/London",    "Europe/London (GMT/BST)"],
					["Europe/Paris",     "Europe/Paris (CET/CEST, UTC+1/2)"],
					["Europe/Berlin",    "Europe/Berlin (CET/CEST, UTC+1/2)"],
					["America/New_York", "America/New_York (ET, UTC-5/4)"],
					["America/Chicago",  "America/Chicago (CT, UTC-6/5)"],
					["America/Denver",   "America/Denver (MT, UTC-7/6)"],
					["America/Los_Angeles", "America/Los_Angeles (PT, UTC-8/7)"],
					["America/Sao_Paulo", "America/Sao_Paulo (BRT, UTC-3)"],
					["Australia/Sydney", "Australia/Sydney (AEST/AEDT, UTC+10/11)"],
				];
				for (const [value, label] of zones) dd.addOption(value, label);
				dd.setValue(this.plugin.settings.dateTimezone ?? "local");
				dd.onChange(async (v) => {
					this.plugin.settings.dateTimezone = v;
					await this.plugin.saveSettings();
				});
			});

		// ── Language ─────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName(t("settings.languageName"))
			.setDesc(t("settings.languageDesc"))
			.addDropdown((dd) => {
				dd.addOption("auto", t("settings.languageAuto"));
				dd.addOption("en", t("settings.languageEn"));
				dd.addOption("ko", t("settings.languageKo"));
				dd.addOption("ja", t("settings.languageJa"));
				dd.addOption("zh", t("settings.languageZh"));
				dd.setValue(this.plugin.settings.language);
				dd.onChange(async (v) => {
					const next = v as LanguageSetting;
					this.plugin.settings.language = next;
					await this.plugin.saveSettings();
					this.plugin.applyLanguage();
					this.display();
				});
			});

		// ── Trigger ──────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName(t("settings.triggerHeader"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("settings.triggerName"))
			.setDesc(t("settings.triggerDesc"))
			.addDropdown((dd) => {
				dd.addOption("manual", t("settings.triggerManual"));
				dd.addOption("onStartup", t("settings.triggerOnStartup"));
				dd.addOption("interval", t("settings.triggerInterval"));
				dd.setValue(this.plugin.settings.syncTrigger);
				dd.onChange(async (v) => {
					this.plugin.settings.syncTrigger = v as SyncTrigger;
					await this.plugin.saveSettings();
					this.plugin.refreshScheduler();
					this.display();
				});
			});

		if (this.plugin.settings.syncTrigger === "interval") {
			new Setting(containerEl)
				.setName(t("settings.intervalName"))
				.setDesc(t("settings.intervalDesc"))
				.addText((text) => {
					text
						.setValue(String(this.plugin.settings.syncInterval))
						.onChange(async (value) => {
							const n = parseInt(value, 10);
							const clamped =
								Number.isFinite(n) && n >= 1 && n <= 1440 ? n : 30;
							this.plugin.settings.syncInterval = clamped;
							await this.plugin.saveSettings();
							this.plugin.refreshScheduler();
						});
					text.inputEl.type = "number";
					text.inputEl.min = "1";
					text.inputEl.max = "1440";
				});
		}

		// ── Memo protection ──────────────────────────────────────────────
		new Setting(containerEl)
			.setName(t("settings.memoHeader"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("settings.memoBehaviorName"))
			.setDesc(t("settings.memoBehaviorDesc"))
			.addDropdown((dd) => {
				dd.addOption("overwrite", t("settings.memoBehaviorOverwrite"));
				dd.addOption("skip", t("settings.memoBehaviorSkip"));
				dd.addOption("append", t("settings.memoBehaviorAppend"));
				dd.setValue(this.plugin.settings.noMarkerBehavior);
				dd.onChange(async (v) => {
					this.plugin.settings.noMarkerBehavior = v as NoMarkerBehavior;
					await this.plugin.saveSettings();
				});
			});
	}

	/* ------------------------------------------------------------------ */

	private renderProfiles(host: HTMLElement): void {
		host.empty();
		const profiles = this.plugin.settings.jqlProfiles;

		if (profiles.length === 0) {
			host.createEl("p", {
				text: t("settings.profilesDesc"),
				cls: "jira-weaver-empty",
			});
			return;
		}

		for (let i = 0; i < profiles.length; i++) {
			const p = profiles[i];
			const row = host.createDiv({ cls: "jira-weaver-profile-row" });

			// Toggle
			const toggleWrap = row.createEl("label", { cls: "jira-weaver-profile-toggle" });
			const checkbox = toggleWrap.createEl("input");
			checkbox.type = "checkbox";
			checkbox.checked = p.enabled;
			checkbox.addEventListener("change", () => {
				profiles[i].enabled = checkbox.checked;
				void this.plugin.saveSettings();
			});

			// Name
			const nameEl = row.createEl("span", {
				text: p.name,
				cls: "jira-weaver-profile-name",
			});
			nameEl.title = `${p.jqlQuery} → ${p.targetFolder}`;

			// Edit button
			const editBtn = row.createEl("button", { text: t("settings.profileName") });
			editBtn.textContent = "✎";
			editBtn.title = t("settings.profileName");
			editBtn.addEventListener("click", () => {
				new JqlProfileModal(this.app, p, (updated) => {
					profiles[i] = updated;
					void this.plugin.saveSettings().then(() => this.display());
				}).open();
			});

			// Delete button
			const delBtn = row.createEl("button", { text: t("settings.profileDelete") });
			delBtn.addClass("jira-weaver-profile-delete");
			delBtn.addEventListener("click", () => {
				if (profiles.length <= 1) {
					new Notice(t("settings.profileAtLeastOne"));
					return;
				}
				profiles.splice(i, 1);
				void this.plugin.saveSettings().then(() => this.display());
			});

			row.appendChild(toggleWrap);
			row.appendChild(nameEl);
			row.appendChild(editBtn);
			row.appendChild(delBtn);
		}
	}
}

/* -------------------------------------------------------------------------- */
/*  JQL Profile Modal                                                          */
/* -------------------------------------------------------------------------- */

type ProfileSaveFn = (profile: JqlProfile) => void;

class JqlProfileModal extends Modal {
	private draft: JqlProfile;

	constructor(
		app: App,
		existing: JqlProfile | null,
		private onSave: ProfileSaveFn,
	) {
		super(app);
		this.draft = existing
			? { ...existing }
			: {
					id: crypto.randomUUID(),
					name: t("settings.profileNew"),
					jqlQuery: "",
					targetFolder: "Jira/Issues",
					maxResults: 50,
					enabled: true,
				};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: t("settings.profilesHeader") });

		new Setting(contentEl)
			.setName(t("settings.profileName"))
			.addText((text) =>
				text.setValue(this.draft.name).onChange((v) => {
					this.draft.name = v;
				}),
			);

		new Setting(contentEl)
			.setName(t("settings.profileEnabled"))
			.addToggle((tg) =>
				tg.setValue(this.draft.enabled).onChange((v) => {
					this.draft.enabled = v;
				}),
			);

		new Setting(contentEl)
			.setName(t("settings.profileJql"))
			.addTextArea((area) => {
				area
					.setValue(this.draft.jqlQuery)
					.onChange((v) => {
						this.draft.jqlQuery = v;
					});
				area.inputEl.rows = 3;
				area.inputEl.addClass("jira-weaver-jql-textarea");
				area.inputEl.spellcheck = false;
			});

		new Setting(contentEl)
			.setName(t("settings.profileFolder"))
			.addText((text) =>
				text
					.setPlaceholder("Jira/Issues")
					.setValue(this.draft.targetFolder)
					.onChange((v) => {
						this.draft.targetFolder = v.trim();
					}),
			);

		new Setting(contentEl)
			.setName(t("settings.profileMaxResults"))
			.addText((text) => {
				text
					.setValue(String(this.draft.maxResults))
					.onChange((v) => {
						const n = parseInt(v, 10);
						this.draft.maxResults = Number.isFinite(n) && n > 0 ? n : 50;
					});
				text.inputEl.type = "number";
				text.inputEl.min = "1";
			});

		const buttons = contentEl.createDiv({ cls: "modal-button-container jira-weaver-modal-buttons" });

		buttons.createEl("button", { text: t("modal.cancel") }).addEventListener("click", () =>
			this.close(),
		);

		const saveBtn = buttons.createEl("button", {
			text: t("modal.save"),
			cls: "mod-cta",
		});
		saveBtn.addEventListener("click", () => {
			this.onSave(this.draft);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
