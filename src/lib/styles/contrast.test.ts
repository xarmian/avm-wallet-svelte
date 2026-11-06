import { readFileSync, readdirSync } from 'node:fs';
import { parse, type Rule } from 'postcss';
import { expect, it } from 'vitest';

const theme = parse(readFileSync('src/lib/styles/theme.css', 'utf8'));
const tokenBlocks: Record<string, string>[] = [];
theme.walkRules((rule) => {
	const tokens: Record<string, string> = {};
	rule.walkDecls(/^--avm-/, (decl) => {
		tokens[decl.prop.slice(6)] = decl.value;
	});
	if (Object.keys(tokens).length) tokenBlocks.push(tokens);
});
const themes = { light: tokenBlocks[0], dark: { ...tokenBlocks[0], ...tokenBlocks[1] } };

// WCAG 2.2 sRGB linearisation and relative luminance (not rounded before comparison).
function luminance(rgb: number[]) {
	const linear = rgb.map((channel) => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(foreground: number[], background: number[]) {
	const a = luminance(foreground),
		b = luminance(background);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function paint(value: string, tokens: Record<string, string>): number[] {
	if (value === 'white') return [255, 255, 255];
	const [name, alpha] = value.split('@');
	const rgb = tokens[name]?.split(/\s+/).map(Number);
	if (!rgb || rgb.length !== 3 || rgb.some(Number.isNaN))
		throw new Error(`Unknown RGB token: ${name}`);
	if (!alpha) return rgb;
	const base = paint('bg-primary', tokens);
	return rgb.map((channel, i) => channel * Number(alpha) + base[i] * (1 - Number(alpha)));
}
function color(value: string) {
	if (value === 'white') return value;
	const match = value.match(/rgb\(var\(--avm-([\w-]+)\)(?:\s*\/\s*([\d.]+))?\)/);
	if (!match) throw new Error(`Uninventoried color: ${value}`);
	return match[1] + (match[2] ? `@${match[2]}` : '');
}
function declaration(rule: Rule, prop: string) {
	return rule.nodes.find((node) => node.type === 'decl' && node.prop === prop);
}
function value(rule: Rule, prop: string) {
	const node = declaration(rule, prop);
	return node?.type === 'decl' ? node.value : undefined;
}
const rowBackgrounds = ['bg-primary', 'bg-hover', 'color-primary@0.08', 'color-primary@0.12'];
// Transparent descendants inherit these surfaces, including parent hover/selected states.
function inheritedBackgrounds(selector: string) {
	if (selector.startsWith('.account-row__')) return rowBackgrounds;
	if (selector.startsWith('.wallet-provider__') && !selector.endsWith('spinner'))
		return ['bg-primary', 'bg-hover'];
	return ['bg-primary'];
}
const cases = new Map<
	string,
	{ foreground: string; background: string; minimum: number; sources: string[] }
>();
function add(foreground: string, background: string, minimum: number, source: string) {
	const id = `${foreground} / ${background} [${minimum === 4.5 ? 'text' : 'UI'}]`;
	const entry = cases.get(id) ?? { foreground, background, minimum, sources: [] };
	entry.sources.push(source);
	cases.set(id, entry);
}
for (const file of readdirSync('src/lib/components').filter((name) => name.endsWith('.svelte'))) {
	const source = readFileSync(`src/lib/components/${file}`, 'utf8');
	const styles = parse(source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '');
	styles.walkRules((rule) => {
		const baseSelector = rule.selector.split(':')[0];
		const base = styles.nodes.find(
			(node) => node.type === 'rule' && node.selector === baseSelector
		) as Rule | undefined;
		const foreground =
			value(rule, 'color') ??
			(rule.selector.includes(':hover') && base ? value(base, 'color') : undefined);
		if (
			!foreground &&
			!rule.nodes.some(
				(node) =>
					node.type === 'decl' && /^(border|outline)/.test(node.prop) && node.value.includes('rgb(')
			) &&
			rule.selector !== '.account-row__radio-dot'
		)
			return;
		const backgroundValue = value(rule, 'background-color') ?? value(rule, 'background');
		const backgrounds = backgroundValue?.startsWith('rgb(')
			? [color(backgroundValue)]
			: inheritedBackgrounds(rule.selector);
		// Hover rules may inherit their foreground (copy/close buttons and filled buttons).
		if (foreground) {
			const uiOnly = /(?:__chevron|(?:-|__)close|__back|__arrow|__spinner)/.test(baseSelector);
			for (const background of backgrounds)
				add(color(foreground), background, uiOnly ? 3 : 4.5, `${file}: ${rule.selector}`);
		}
		for (const node of rule.nodes) {
			if (
				node.type !== 'decl' ||
				!/^(?:border(?:-(?:color|top-color|bottom|top))?|outline)$/.test(node.prop) ||
				!node.value.includes('rgb(')
			)
				continue;
			for (const background of backgrounds.filter((background) => background !== color(node.value)))
				add(color(node.value), background, 3, `${file}: ${rule.selector} ${node.prop}`);
			// Borders also meet the surrounding panel surface.
			add(color(node.value), 'bg-primary', 3, `${file}: ${rule.selector} outer border`);
		}
		if (rule.selector === '.account-row__radio-dot')
			add('white', 'color-primary', 3, `${file}: selected radio dot`);
	});
}
// All current text is below WCAG's large-text size (18pt, or 14pt bold).
// Guard all three primary states, including the active token reserved for consumer styling.
for (const background of ['color-primary', 'color-primary-hover', 'color-primary-active']) {
	add('color-on-primary', background, 4.5, 'primary-filled controls');
}
add('color-primary', 'bg-primary', 4.5, 'primary as text');
add('color-primary', 'bg-primary', 3, 'primary as border');

// Existing issues outside primary-filled buttons. Each entry is a measured ratio,
// not a blanket exemption: new failures and any further reduction fail the guard.
const knownBelowAA: Record<string, number> = {
	'light border-color / bg-primary [UI]': 1.26,
	'light border-color / bg-hover [UI]': 1.16,
	'light border-color / color-primary@0.08 [UI]': 1.13,
	'light border-color / color-primary@0.12 [UI]': 1.07,
	'light text-tertiary / bg-primary [text]': 2.52,
	'light text-tertiary / bg-hover [text]': 2.31,
	'light text-tertiary / color-primary@0.08 [text]': 2.26,
	'light text-tertiary / color-primary@0.12 [text]': 2.13,
	'light color-success / bg-primary [text]': 2.28,
	'light color-success / bg-hover [text]': 2.09,
	'light color-success / color-primary@0.08 [text]': 2.04,
	'light color-success / color-primary@0.12 [text]': 1.93,
	'light text-secondary / bg-hover [text]': 4.35,
	'light text-secondary / color-primary@0.08 [text]': 4.25,
	'light text-secondary / color-primary@0.12 [text]': 4.01,
	'light color-error / color-error@0.1 [text]': 3.3,
	'light border-color / bg-secondary [UI]': 1.21,
	'light color-error / bg-primary [text]': 3.76,
	'light color-error / bg-hover [text]': 3.45,
	'light text-tertiary / bg-primary [UI]': 2.52,
	'light text-tertiary / bg-hover [UI]': 2.31,
	'dark border-color / bg-primary [UI]': 1.73,
	'dark border-color / bg-hover [UI]': 1.46,
	'dark border-color / color-primary@0.08 [UI]': 1.54,
	'dark border-color / color-primary@0.12 [UI]': 1.44,
	'dark text-tertiary / bg-primary [text]': 3.78,
	'dark text-tertiary / bg-hover [text]': 3.19,
	'dark text-tertiary / color-primary@0.08 [text]': 3.36,
	'dark text-tertiary / color-primary@0.12 [text]': 3.14,
	'dark border-color / bg-secondary [UI]': 1.46,
	'dark white / color-primary [UI]': 2.54
};

for (const [mode, tokens] of Object.entries(themes)) {
	for (const [id, pair] of cases) {
		it(`${mode} ${id} (${pair.sources.join('; ')})`, () => {
			const ratio = contrast(paint(pair.foreground, tokens), paint(pair.background, tokens));
			const known = knownBelowAA[`${mode} ${id}`];
			if (known !== undefined) {
				expect(ratio).toBeLessThan(pair.minimum);
				expect(Number(ratio.toFixed(2))).toBe(known);
			} else {
				expect(ratio).toBeGreaterThanOrEqual(pair.minimum);
			}
		});
	}
}

it('keeps primary controls bound to the on-primary token', () => {
	for (const [file, selector] of [
		['AccountSelector.svelte', '.account-selector__add'],
		['AuthModal.svelte', '.avm-auth-modal-button'],
		['AccountRow.svelte', '.account-row__action--signin']
	]) {
		const source = readFileSync(`src/lib/components/${file}`, 'utf8');
		const styles = parse(source.match(/<style>([\s\S]*?)<\/style>/)![1]);
		styles.walkRules(selector, (rule) => {
			expect(value(rule, 'color')).toBe('rgb(var(--avm-color-on-primary))');
		});
	}
});
