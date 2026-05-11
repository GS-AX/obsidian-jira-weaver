#!/usr/bin/env node
/**
 * Verifies that every t("key") call found in src/ exists in all locale JSON files,
 * and that every key in locale files is actually used somewhere in src/.
 *
 * Usage:
 *   npx ts-node scripts/check-i18n.ts
 *   npx tsx scripts/check-i18n.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const LOCALES_DIR = path.join(ROOT, "locales");

// ---------------------------------------------------------------------------
// 1. Collect all t("key") / t('key') calls from src/**/*.ts
// ---------------------------------------------------------------------------

function collectUsedKeys(dir: string): Set<string> {
	const used = new Set<string>();
	// Static t("key") or t('key') calls
	const tCallPattern = /\bt\(\s*["']([^"']+)["']/g;
	// Keys used as object literals inside registerDefaults({...}) — e.g. "file.markerLost": "..."
	const registerDefaultsPattern = /["']([\w.]+)["']\s*:/g;
	// Dynamic key prefixes — keys looked up via template literals like `file.label.${x}`
	// We collect the prefix part so the locale keys can be matched against them.
	const dynamicPrefixPattern = /`([\w.]+)\$\{/g;

	function walk(current: string): void {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.name.endsWith(".ts")) {
				const src = fs.readFileSync(full, "utf-8");

				// Static t("key") calls
				tCallPattern.lastIndex = 0;
				let m: RegExpExecArray | null;
				while ((m = tCallPattern.exec(src)) !== null) {
					used.add(m[1]);
				}

				// Keys registered via registerDefaults({...})
				const registerBlocks = src.match(/registerDefaults\s*\(\s*\{([\s\S]*?)\}\s*\)/g);
				if (registerBlocks) {
					for (const block of registerBlocks) {
						registerDefaultsPattern.lastIndex = 0;
						while ((m = registerDefaultsPattern.exec(block)) !== null) {
							const key = m[1];
							if (key.includes(".")) used.add(key);
						}
					}
				}

				// Dynamic keys via template literals — mark the prefix so we skip those locale keys
				dynamicPrefixPattern.lastIndex = 0;
				while ((m = dynamicPrefixPattern.exec(src)) !== null) {
					used.add(`__dynamic_prefix__${m[1]}`);
				}
			}
		}
	}

	walk(dir);
	return used;
}

// ---------------------------------------------------------------------------
// 2. Load all locale files
// ---------------------------------------------------------------------------

function loadLocales(dir: string): Map<string, Record<string, string>> {
	const locales = new Map<string, Record<string, string>>();
	for (const f of fs.readdirSync(dir)) {
		if (!f.endsWith(".json")) continue;
		const lang = path.basename(f, ".json");
		const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as Record<string, string>;
		locales.set(lang, data);
	}
	return locales;
}

// ---------------------------------------------------------------------------
// 3. Compare and report
// ---------------------------------------------------------------------------

function run(): void {
	const usedKeys = collectUsedKeys(SRC_DIR);
	const locales = loadLocales(LOCALES_DIR);

	let exitCode = 0;

	// Keys used in source but missing from one or more locale files
	const missingByLocale = new Map<string, string[]>();
	for (const [lang, data] of locales) {
		const missing: string[] = [];
		for (const key of usedKeys) {
			if (!(key in data)) missing.push(key);
		}
		if (missing.length) missingByLocale.set(lang, missing);
	}

	// Keys present in locale files but never used in source
	const unusedByLocale = new Map<string, string[]>();
	for (const [lang, data] of locales) {
		const unused = Object.keys(data).filter((k) => !usedKeys.has(k));
		if (unused.length) unusedByLocale.set(lang, unused);
	}

	// ---- Report: missing keys ----
	if (missingByLocale.size > 0) {
		exitCode = 1;
		console.error("\n❌  Keys used in source but MISSING from locale files:");
		for (const [lang, keys] of [...missingByLocale].sort()) {
			console.error(`\n  [${lang}]`);
			for (const k of keys.sort()) console.error(`    - ${k}`);
		}
	}

	// ---- Report: unused keys ----
	if (unusedByLocale.size > 0) {
		// Treat as warning only (don't fail the build)
		console.warn("\n⚠️   Keys in locale files but NOT used in source (stale):");
		for (const [lang, keys] of [...unusedByLocale].sort()) {
			console.warn(`\n  [${lang}]`);
			for (const k of keys.sort()) console.warn(`    - ${k}`);
		}
	}

	// ---- Cross-locale consistency ----
	// Check that all locale files have the same set of keys
	const allLocaleKeys = new Map<string, Set<string>>();
	for (const [lang, data] of locales) {
		allLocaleKeys.set(lang, new Set(Object.keys(data)));
	}
	const langs = [...allLocaleKeys.keys()].sort();
	const referenceSet = allLocaleKeys.get(langs[0])!;
	const crossErrors: string[] = [];

	for (let i = 1; i < langs.length; i++) {
		const lang = langs[i];
		const langKeys = allLocaleKeys.get(lang)!;
		for (const k of referenceSet) {
			if (!langKeys.has(k)) crossErrors.push(`  [${lang}] missing key: ${k}`);
		}
		for (const k of langKeys) {
			if (!referenceSet.has(k)) crossErrors.push(`  [${lang}] extra key not in [${langs[0]}]: ${k}`);
		}
	}

	if (crossErrors.length) {
		exitCode = 1;
		console.error("\n❌  Locale files are NOT in sync with each other:");
		for (const line of crossErrors) console.error(line);
	}

	if (exitCode === 0) {
		const keyCount = usedKeys.size;
		const localeCount = locales.size;
		console.log(
			`\n✅  i18n check passed — ${keyCount} keys verified across ${localeCount} locale(s).`,
		);
	}

	process.exit(exitCode);
}

run();
