import { Modal, Notice, Setting, type App, type TFile } from "obsidian";

import { i18n, t } from "./i18n";
import { FieldMappingModal } from "./fieldMappingModal";
import type JiraWeaverPlugin from "./main";
import type { FieldCatalogEntry, FieldMapping } from "./types";

i18n.registerDefaults({
	"mapping.presetHeader": "Preset",
	"mapping.exportPreset": "Export preset",
	"mapping.importPreset": "Import preset",
	"mapping.exportDone": "Mappings exported to {{path}}.",
	"mapping.importDone": "Imported {{count}} field mappings.",
	"mapping.importError": "Import failed: {{reason}}",

	"mapping.header": "Field Mapping",
	"mapping.reload": "Reload fields",
	"mapping.reloadDesc":
		"Fetch the current Jira field list from /rest/api/2/field. Required to see custom fields.",
	"mapping.lastFetched": "Last fetched: {{at}}",
	"mapping.lastFetchedNever": "Last fetched: never",
	"mapping.search": "Search fields…",
	"mapping.systemFields": "System fields",
	"mapping.customFields": "Custom fields",
	"mapping.availableEmpty":
		"No fields cached yet — click \"Reload fields\" after entering connection details.",
	"mapping.activeHeader": "Active mappings",
	"mapping.activeEmpty": "No active mappings. Enable fields on the left.",
	"mapping.edit": "Edit",
	"mapping.up": "↑",
	"mapping.down": "↓",
	"mapping.addCustom": "Add custom field manually",
	"mapping.addCustomTitle": "Add custom field",
	"mapping.addCustomFieldId": "Jira field ID",
	"mapping.addCustomFieldIdDesc":
		"e.g. customfield_10016 — exactly as it appears in the Jira REST API.",
	"mapping.addCustomDisplayName": "Display name (optional)",
	"mapping.addCustomConfirm": "Add",
	"mapping.addCustomCancel": "Cancel",
	"mapping.addCustomDuplicate": "A mapping for {{id}} already exists.",
	"mapping.missingBadge": "⚠ missing in Jira",
	"mapping.wikiBadge": "🔗",
	"mapping.descriptionLocked":
		"description is always rendered into the body section, never Frontmatter.",
});

export class FieldMappingPanel {
	private filter = "";

	constructor(
		private app: App,
		private plugin: JiraWeaverPlugin,
		private container: HTMLElement,
	) {}

	render(): void {
		this.container.empty();

		const headerRow = this.container.createDiv({ cls: "jira-weaver-mapping-header" });
		headerRow.createEl("h3", { text: t("mapping.header") });

		const reloadBtn = headerRow.createEl("button", { text: `↺ ${t("mapping.reload")}` });
		reloadBtn.addEventListener("click", () => this.handleReload(reloadBtn));

		// Preset export / import
		const exportBtn = headerRow.createEl("button", { text: `↑ ${t("mapping.exportPreset")}` });
		exportBtn.addEventListener("click", () => this.exportPreset());

		const importBtn = headerRow.createEl("button", { text: `↓ ${t("mapping.importPreset")}` });
		importBtn.addEventListener("click", () => this.importPreset());

		const fetchedAt = this.plugin.settings.fieldCatalogFetchedAt;
		const fetchedLabel = fetchedAt
			? t("mapping.lastFetched", { at: formatTimestamp(fetchedAt) })
			: t("mapping.lastFetchedNever");
		headerRow.createEl("span", {
			text: ` ${fetchedLabel}`,
			cls: "jira-weaver-mapping-fetched",
		});

		const grid = this.container.createDiv({ cls: "jira-weaver-mapping-grid" });
		grid.style.display = "grid";
		grid.style.gridTemplateColumns = "1fr 1fr";
		grid.style.gap = "16px";

		this.renderAvailable(grid.createDiv());
		this.renderActive(grid.createDiv());
	}

	private async handleReload(btn: HTMLButtonElement): Promise<void> {
		btn.disabled = true;
		try {
			await this.plugin.reloadFieldCatalog();
			this.render();
		} catch {
			// Notice surfaced by reloadFieldCatalog itself.
		} finally {
			btn.disabled = false;
		}
	}

	private async exportPreset(): Promise<void> {
		const path = "jira-weaver-preset.json";
		try {
			const json = JSON.stringify(this.plugin.settings.fieldMappings, null, 2);
			const existing = this.app.vault.getAbstractFileByPath(path);
			if (existing) {
				await this.app.vault.modify(existing as TFile, json);
			} else {
				await this.app.vault.create(path, json);
			}
			new Notice(t("mapping.exportDone", { path }));
		} catch (e) {
			new Notice(t("mapping.importError", { reason: e instanceof Error ? e.message : String(e) }));
		}
	}

	private async importPreset(): Promise<void> {
		const path = "jira-weaver-preset.json";
		try {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!file) {
				new Notice(t("mapping.importError", { reason: `File not found: ${path}` }));
				return;
			}
			const json = await this.app.vault.read(file as TFile);
			const mappings = JSON.parse(json) as FieldMapping[];
			if (!Array.isArray(mappings)) throw new Error("Expected an array of mappings");
			this.plugin.settings.fieldMappings = mappings;
			await this.plugin.saveSettings();
			new Notice(t("mapping.importDone", { count: mappings.length }));
			this.render();
		} catch (e) {
			new Notice(t("mapping.importError", { reason: e instanceof Error ? e.message : String(e) }));
		}
	}

	/* ------------------------------------------------------------------ */
	/*  Available Fields panel                                            */
	/* ------------------------------------------------------------------ */

	private renderAvailable(host: HTMLElement): void {
		host.createEl("h4", { text: "📋 " + t("mapping.header") });

		const search = host.createEl("input", {
			type: "search",
			placeholder: t("mapping.search"),
			value: this.filter,
		});
		search.style.width = "100%";
		search.style.marginBottom = "8px";
		search.addEventListener("input", () => {
			this.filter = search.value;
			this.refreshAvailableList(listHost);
		});

		const listHost = host.createDiv();
		this.refreshAvailableList(listHost);
	}

	private refreshAvailableList(host: HTMLElement): void {
		host.empty();
		const catalog = this.plugin.settings.fieldCatalog;
		if (catalog.length === 0) {
			host.createEl("p", {
				text: t("mapping.availableEmpty"),
				cls: "jira-weaver-empty",
			});
			return;
		}

		const filtered = catalog.filter((f) =>
			matchFilter(f, this.filter),
		);
		const system = filtered.filter((f) => !f.custom);
		const custom = filtered.filter((f) => f.custom);

		if (system.length > 0) {
			host.createEl("h5", { text: t("mapping.systemFields") });
			for (const f of system) host.appendChild(this.renderAvailableRow(f));
		}
		if (custom.length > 0) {
			host.createEl("h5", { text: t("mapping.customFields") });
			for (const f of custom) host.appendChild(this.renderAvailableRow(f));
		}
	}

	private renderAvailableRow(field: FieldCatalogEntry): HTMLElement {
		const row = document.createElement("label");
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "6px";
		row.style.padding = "2px 0";

		const mapping = this.findMapping(field.id);
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = mapping?.isEnabled ?? false;

		// description never lives in Frontmatter — disable the checkbox.
		if (field.id === "description") {
			checkbox.disabled = true;
			checkbox.title = t("mapping.descriptionLocked");
		}

		checkbox.addEventListener("change", async () => {
			if (field.id === "description") return;
			await this.toggleField(field, checkbox.checked);
			this.render();
		});

		row.appendChild(checkbox);
		const labelText = document.createElement("span");
		labelText.textContent = `${field.name}`;
		const sub = document.createElement("small");
		sub.style.opacity = "0.6";
		sub.textContent = ` (${field.id})`;
		labelText.appendChild(sub);
		row.appendChild(labelText);
		return row;
	}

	private async toggleField(
		field: FieldCatalogEntry,
		enabled: boolean,
	): Promise<void> {
		const mappings = [...this.plugin.settings.fieldMappings];
		const idx = mappings.findIndex((m) => m.jiraFieldId === field.id);
		if (idx === -1) {
			if (!enabled) return;
			const next: FieldMapping = {
				jiraFieldId: field.id,
				jiraFieldName: field.name,
				obsidianKey: defaultObsidianKey(field),
				valueType: defaultValueType(field),
				isWikiLink: false,
				jsonPath: null,
				isEnabled: true,
				order: mappings.length + 1,
			};
			mappings.push(next);
		} else {
			mappings[idx] = { ...mappings[idx], isEnabled: enabled };
		}
		this.plugin.settings.fieldMappings = mappings;
		await this.plugin.saveSettings();
	}

	/* ------------------------------------------------------------------ */
	/*  Active Mappings panel                                             */
	/* ------------------------------------------------------------------ */

	private renderActive(host: HTMLElement): void {
		host.createEl("h4", { text: "🗂️ " + t("mapping.activeHeader") });

		const enabled = this.plugin.settings.fieldMappings
			.filter((m) => m.isEnabled)
			.sort((a, b) => a.order - b.order);

		if (enabled.length === 0) {
			host.createEl("p", {
				text: t("mapping.activeEmpty"),
				cls: "jira-weaver-empty",
			});
		}

		for (const mapping of enabled) {
			host.appendChild(this.renderActiveRow(mapping, enabled));
		}

		const addBtn = host.createEl("button", {
			text: `+ ${t("mapping.addCustom")}`,
		});
		addBtn.style.marginTop = "8px";
		addBtn.addEventListener("click", () => this.openAddCustomDialog());
	}

	private renderActiveRow(
		mapping: FieldMapping,
		enabledList: FieldMapping[],
	): HTMLElement {
		const row = document.createElement("div");
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "6px";
		row.style.padding = "4px 0";
		row.style.borderBottom = "1px solid var(--background-modifier-border)";

		const upBtn = document.createElement("button");
		upBtn.textContent = t("mapping.up");
		upBtn.title = "Move up";
		upBtn.addEventListener("click", () => this.move(mapping, -1));
		row.appendChild(upBtn);

		const downBtn = document.createElement("button");
		downBtn.textContent = t("mapping.down");
		downBtn.title = "Move down";
		downBtn.addEventListener("click", () => this.move(mapping, +1));
		row.appendChild(downBtn);

		const label = document.createElement("span");
		label.style.flex = "1";
		label.textContent = `${mapping.jiraFieldId} → ${mapping.obsidianKey}`;
		if (mapping.isWikiLink) label.textContent += " " + t("mapping.wikiBadge");
		if (mapping.missing) {
			const badge = document.createElement("span");
			badge.style.color = "var(--color-orange)";
			badge.style.marginLeft = "6px";
			badge.textContent = t("mapping.missingBadge");
			label.appendChild(badge);
		}
		row.appendChild(label);

		const editBtn = document.createElement("button");
		editBtn.textContent = t("mapping.edit");
		editBtn.addEventListener("click", () => this.openEditModal(mapping));
		row.appendChild(editBtn);

		// Mark a quick visual hint when this is the first/last entry.
		if (mapping.order === enabledList[0]?.order) upBtn.disabled = true;
		if (mapping.order === enabledList[enabledList.length - 1]?.order)
			downBtn.disabled = true;
		return row;
	}

	private openEditModal(mapping: FieldMapping): void {
		const modal = new FieldMappingModal(this.app, {
			mapping,
			allMappings: this.plugin.settings.fieldMappings,
			sampleIssue: null,
			nullFieldBehavior: this.plugin.settings.nullFieldBehavior,
			onSave: async (next) => {
				const all = [...this.plugin.settings.fieldMappings];
				const idx = all.findIndex((m) => m.jiraFieldId === mapping.jiraFieldId);
				if (idx >= 0) all[idx] = { ...all[idx], ...next };
				this.plugin.settings.fieldMappings = all;
				await this.plugin.saveSettings();
				this.render();
			},
		});
		modal.open();
	}

	private async move(mapping: FieldMapping, delta: -1 | 1): Promise<void> {
		const enabled = this.plugin.settings.fieldMappings
			.filter((m) => m.isEnabled)
			.sort((a, b) => a.order - b.order);
		const idx = enabled.findIndex(
			(m) => m.jiraFieldId === mapping.jiraFieldId,
		);
		const swapWith = enabled[idx + delta];
		if (!swapWith) return;
		const all = this.plugin.settings.fieldMappings.map((m) => {
			if (m.jiraFieldId === mapping.jiraFieldId) return { ...m, order: swapWith.order };
			if (m.jiraFieldId === swapWith.jiraFieldId) return { ...m, order: mapping.order };
			return m;
		});
		this.plugin.settings.fieldMappings = all;
		await this.plugin.saveSettings();
		this.render();
	}

	private openAddCustomDialog(): void {
		new AddCustomFieldModal(this.app, {
			existing: this.plugin.settings.fieldMappings,
			onAdd: async (id, name) => {
				const mappings = [...this.plugin.settings.fieldMappings];
				if (mappings.some((m) => m.jiraFieldId === id)) {
					new Notice(t("mapping.addCustomDuplicate", { id }));
					return;
				}
				const mapping: FieldMapping = {
					jiraFieldId: id,
					jiraFieldName: name || id,
					obsidianKey: id.replace(/[^a-z0-9_]/gi, "_").toLowerCase(),
					valueType: "text",
					isWikiLink: false,
					jsonPath: null,
					isEnabled: true,
					order: mappings.length + 1,
				};
				mappings.push(mapping);
				this.plugin.settings.fieldMappings = mappings;
				await this.plugin.saveSettings();
				this.render();
			},
		}).open();
	}

	/* ------------------------------------------------------------------ */

	private findMapping(id: string): FieldMapping | undefined {
		return this.plugin.settings.fieldMappings.find((m) => m.jiraFieldId === id);
	}
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function matchFilter(f: FieldCatalogEntry, filter: string): boolean {
	if (!filter) return true;
	const q = filter.toLowerCase();
	return f.id.toLowerCase().includes(q) || f.name.toLowerCase().includes(q);
}

function defaultObsidianKey(field: FieldCatalogEntry): string {
	if (!field.custom) return field.id.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
	return field.name.replace(/[^a-z0-9_]/gi, "_").toLowerCase().replace(/^_+|_+$/g, "");
}

function defaultValueType(field: FieldCatalogEntry): FieldMapping["valueType"] {
	const type = field.schema?.type ?? "";
	if (type === "array") return "array";
	if (type === "user") return "user";
	if (type === "number") return "number";
	if (type === "date") return "date";
	if (type === "datetime") return "datetime";
	return "text";
}

function formatTimestamp(iso: string): string {
	const d = new Date(iso);
	if (isNaN(d.getTime())) return iso;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
		d.getHours(),
	)}:${pad(d.getMinutes())}`;
}

/* -------------------------------------------------------------------------- */
/*  AddCustomFieldModal                                                        */
/* -------------------------------------------------------------------------- */

interface AddCustomParams {
	existing: FieldMapping[];
	onAdd: (id: string, name: string) => void;
}

class AddCustomFieldModal extends Modal {
	private id = "";
	private name = "";

	constructor(app: App, private params: AddCustomParams) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: t("mapping.addCustomTitle") });

		new Setting(contentEl)
			.setName(t("mapping.addCustomFieldId"))
			.setDesc(t("mapping.addCustomFieldIdDesc"))
			.addText((text) =>
				text.setPlaceholder("customfield_10016").onChange((v) => {
					this.id = v.trim();
				}),
			);

		new Setting(contentEl)
			.setName(t("mapping.addCustomDisplayName"))
			.addText((text) =>
				text.setPlaceholder("Sprint").onChange((v) => {
					this.name = v.trim();
				}),
			);

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		buttons.style.display = "flex";
		buttons.style.justifyContent = "flex-end";
		buttons.style.gap = "8px";
		buttons.style.marginTop = "1em";

		const cancelBtn = buttons.createEl("button", {
			text: t("mapping.addCustomCancel"),
		});
		cancelBtn.addEventListener("click", () => this.close());

		const addBtn = buttons.createEl("button", {
			text: t("mapping.addCustomConfirm"),
			cls: "mod-cta",
		});
		addBtn.addEventListener("click", () => {
			if (!this.id) return;
			if (this.params.existing.some((m) => m.jiraFieldId === this.id)) {
				new Notice(t("mapping.addCustomDuplicate", { id: this.id }));
				return;
			}
			this.params.onAdd(this.id, this.name);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
