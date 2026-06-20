import { Modal, Notice, Setting, type App } from "obsidian";

import { i18n, t } from "./i18n";
import { resolveAllFields, validateMapping } from "./fieldResolver";
import type {
	FieldMapping,
	FieldValueType,
	JiraIssue,
	NullFieldBehavior,
} from "./types";

i18n.registerDefaults({
	"modal.title": "Field Settings: {{id}} ({{name}})",
	"modal.obsidianKey": "Obsidian key",
	"modal.obsidianKeyDesc":
		"YAML key written into the file's Frontmatter (lowercase, underscores).",
	"modal.valueType": "Value type",
	"modal.valueTypeDesc": "How the raw Jira value is normalized.",
	"modal.wikiLink": "Wrap in [[wiki link]]",
	"modal.wikiLinkDesc":
		"Wrap the resolved value as an Obsidian wiki link. Useful for ontology/Graph View.",
	"modal.jsonPath": "JSON path",
	"modal.jsonPathDesc":
		"Leave empty for auto-extraction. Supports dot, [index] and [*] wildcard, e.g. fields.sprint[0].name.",
	"modal.preview": "Preview",
	"modal.previewMissing": "(no preview — connect Jira and reload fields to see live data)",
	"modal.cancel": "Cancel",
	"modal.save": "Save",
	"modal.invalid": "Cannot save: {{reason}}",
});

type ValueTypeOption = { value: FieldValueType; label: string };

const VALUE_TYPES: ValueTypeOption[] = [
	{ value: "text", label: "text" },
	{ value: "number", label: "number" },
	{ value: "date", label: "date" },
	{ value: "datetime", label: "datetime" },
	{ value: "boolean", label: "boolean" },
	{ value: "array", label: "array" },
	{ value: "user", label: "user" },
	{ value: "user_array", label: "user_array" },
];

export interface FieldMappingModalParams {
	mapping: FieldMapping;
	allMappings: FieldMapping[];
	/** Optional sample issue used for the live preview cell. */
	sampleIssue?: JiraIssue | null;
	nullFieldBehavior: NullFieldBehavior;
	dateTimezone: string;
	onSave: (next: FieldMapping) => void;
}

export class FieldMappingModal extends Modal {
	private draft: FieldMapping;
	private previewEl: HTMLElement | null = null;

	constructor(app: App, private params: FieldMappingModalParams) {
		super(app);
		this.draft = { ...params.mapping };
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", {
			text: t("modal.title", {
				id: this.draft.jiraFieldId,
				name: this.draft.jiraFieldName,
			}),
		});

		new Setting(contentEl)
			.setName(t("modal.obsidianKey"))
			.setDesc(t("modal.obsidianKeyDesc"))
			.addText((text) =>
				text.setValue(this.draft.obsidianKey).onChange((v) => {
					this.draft.obsidianKey = v.trim();
					this.refreshPreview();
				}),
			);

		new Setting(contentEl)
			.setName(t("modal.valueType"))
			.setDesc(t("modal.valueTypeDesc"))
			.addDropdown((dd) => {
				for (const opt of VALUE_TYPES) dd.addOption(opt.value, opt.label);
				dd.setValue(this.draft.valueType).onChange((v) => {
					this.draft.valueType = v as FieldValueType;
					this.refreshPreview();
				});
			});

		new Setting(contentEl)
			.setName(t("modal.wikiLink"))
			.setDesc(t("modal.wikiLinkDesc"))
			.addToggle((tg) =>
				tg.setValue(this.draft.isWikiLink).onChange((v) => {
					this.draft.isWikiLink = v;
					this.refreshPreview();
				}),
			);

		new Setting(contentEl)
			.setName(t("modal.jsonPath"))
			.setDesc(t("modal.jsonPathDesc"))
			.addText((text) =>
				text
					.setPlaceholder("fields.customfield_10016[0].name")
					.setValue(this.draft.jsonPath ?? "")
					.onChange((v) => {
						const trimmed = v.trim();
						this.draft.jsonPath = trimmed.length > 0 ? trimmed : null;
						this.refreshPreview();
					}),
			);

		const previewWrap = contentEl.createDiv({ cls: "jira-weaver-preview" });
		previewWrap.createEl("strong", { text: `${t("modal.preview")}: ` });
		this.previewEl = previewWrap.createSpan();
		this.refreshPreview();

		const buttons = contentEl.createDiv({ cls: "modal-button-container jira-weaver-modal-buttons" });

		const cancelBtn = buttons.createEl("button", { text: t("modal.cancel") });
		cancelBtn.addEventListener("click", () => this.close());

		const saveBtn = buttons.createEl("button", {
			text: t("modal.save"),
			cls: "mod-cta",
		});
		saveBtn.addEventListener("click", () => this.attemptSave());
	}

	private attemptSave(): void {
		const v = validateMapping(this.draft, this.params.allMappings);
		if (!v.ok) {
			new Notice(t("modal.invalid", { reason: v.reason }));
			return;
		}
		this.params.onSave(this.draft);
		this.close();
	}

	private refreshPreview(): void {
		if (!this.previewEl) return;
		const sample = this.params.sampleIssue;
		if (!sample) {
			this.previewEl.setText(t("modal.previewMissing"));
			return;
		}
		const [resolved] = resolveAllFields(sample, [this.draft], {
			nullFieldBehavior: this.params.nullFieldBehavior,
			dateTimezone: this.params.dateTimezone,
		});
		if (!resolved || resolved.yaml === undefined) {
			this.previewEl.setText(`${this.draft.obsidianKey}: (omitted)`);
			return;
		}
		if (resolved.yaml === null) {
			this.previewEl.setText(`${this.draft.obsidianKey}: null`);
			return;
		}
		if (Array.isArray(resolved.yaml)) {
			this.previewEl.setText(
				`${this.draft.obsidianKey}: [${resolved.yaml.join(", ")}]`,
			);
			return;
		}
		this.previewEl.setText(`${this.draft.obsidianKey}: ${resolved.yaml}`);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
