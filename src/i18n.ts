/**
 * i18n module — PRD §3.8.5
 *
 * Resolution chain when looking up a key:
 *   current locale  →  en (loaded fallback)  →  inline EN_DEFAULTS  →  raw key
 *
 * NOTE on staging: per the implementation plan, the locales/*.json
 * files start empty and are populated in the final step after every
 * t() key has been catalogued across the source. Until then, this
 * module's inline EN_DEFAULTS provides English text so the plugin is
 * usable at every stage. When the locale files land, EN_DEFAULTS is
 * migrated into locales/en.json verbatim.
 */

import { SUPPORTED_LOCALES, type LanguageSetting, type SupportedLocale } from "./types";

type Translations = Record<string, string>;

/**
 * Inline English defaults — temporary home for keys discovered during
 * staged development. Migrated to locales/en.json at the end.
 * Each module that uses t() registers its keys via registerDefaults().
 */
const EN_DEFAULTS: Translations = {};

/**
 * Translation tables loaded by main.ts at startup, keyed by locale.
 * Populated by load(); empty until locale JSON files exist.
 */
const LOADED: Partial<Record<SupportedLocale, Translations>> = {};

type Listener = () => void;

class I18n {
	private current: SupportedLocale = "en";
	private listeners = new Set<Listener>();

	/**
	 * Register a translation table for a locale. Called once per locale
	 * by main.ts at startup. Does not by itself change the active locale.
	 */
	load(locale: SupportedLocale, table: Translations): void {
		LOADED[locale] = table;
	}

	setLocale(locale: SupportedLocale): void {
		if (this.current === locale) return;
		this.current = locale;
		this.notify();
	}

	getCurrentLocale(): SupportedLocale {
		return this.current;
	}

	t(key: string, vars?: Record<string, string | number>): string {
		const raw =
			LOADED[this.current]?.[key] ??
			LOADED.en?.[key] ??
			EN_DEFAULTS[key] ??
			key;
		return interpolate(raw, vars);
	}

	/**
	 * Register inline English fallbacks for keys. Module-local hook —
	 * each source file calls this near the top to declare its strings
	 * during staged development. Once locales/en.json contains a key,
	 * the loaded value takes precedence.
	 */
	registerDefault(key: string, value: string): void {
		if (!(key in EN_DEFAULTS)) EN_DEFAULTS[key] = value;
	}

	registerDefaults(table: Translations): void {
		for (const [k, v] of Object.entries(table)) this.registerDefault(k, v);
	}

	/** All keys this runtime has seen (loaded ∪ EN_DEFAULTS). */
	listKnownKeys(): string[] {
		const keys = new Set<string>(Object.keys(EN_DEFAULTS));
		for (const table of Object.values(LOADED)) {
			if (table) for (const k of Object.keys(table)) keys.add(k);
		}
		return [...keys].sort();
	}

	/** Snapshot of EN_DEFAULTS — used at the final stage to seed en.json. */
	snapshotEnglishDefaults(): Translations {
		return { ...EN_DEFAULTS };
	}

	/* Subscribe / notify so UI can re-render when locale changes. */
	onChange(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	private notify(): void {
		for (const l of this.listeners) {
			try {
				l();
			} catch (e) {
				console.warn("[Jira Weaver] i18n listener failed", e);
			}
		}
	}
}

function interpolate(
	template: string,
	vars?: Record<string, string | number>,
): string {
	if (!vars) return template;
	return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
		const v = vars[name];
		return v === undefined ? match : String(v);
	});
}

export const i18n = new I18n();
export const t = i18n.t.bind(i18n);

/* -------------------------------------------------------------------------- */
/*  Locale resolution (PRD §3.8.3)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Map a user setting (auto / explicit) to a concrete loaded locale.
 *
 *   "auto"  → Obsidian app language → matched supported locale → "en"
 *   "ko"/"en"/"ja"/"zh" → that locale (always falls back via t() resolution)
 */
export function resolveLocale(setting: LanguageSetting): SupportedLocale {
	if (setting !== "auto") return setting;
	const detected = detectAppLocale();
	return detected ?? "en";
}

/**
 * Read Obsidian's UI language. Obsidian writes the chosen language to
 * `localStorage.language` ("en", "ko", "ja", "zh-cn", etc.). We
 * normalise to one of the supported locales; unknown values return null.
 */
function detectAppLocale(): SupportedLocale | null {
	let raw: string | null = null;
	try {
		raw = window.localStorage.getItem("language");
	} catch {
		// Some platforms (mobile, sandboxes) may throw on storage access.
	}
	if (!raw) return null;
	const norm = raw.toLowerCase();
	if (norm.startsWith("ko")) return "ko";
	if (norm.startsWith("ja")) return "ja";
	if (norm.startsWith("zh")) return "zh";
	if (norm.startsWith("en")) return "en";
	if ((SUPPORTED_LOCALES as string[]).includes(norm)) return norm as SupportedLocale;
	return null;
}
