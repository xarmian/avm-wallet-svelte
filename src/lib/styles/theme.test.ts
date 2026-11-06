import { readFileSync } from 'node:fs';
import { parse, list } from 'postcss';
import { expect, it } from 'vitest';

const theme = readFileSync('src/lib/styles/theme.css', 'utf8');

it('defines all default tokens only in zero-specificity light and dark rules', () => {
	const selectors: string[] = [];
	parse(theme).walkRules((rule) => {
		if (rule.nodes.some((node) => node.type === 'decl' && node.prop.startsWith('--avm-'))) {
			for (const selector of list.comma(rule.selector)) {
				expect(selector).toMatch(/^:where\([^()]+\)$/);
				selectors.push(selector);
			}
		}
	});
	expect(selectors).toEqual([':where(:root)', ":where(.dark, [data-theme='dark'])"]);
});

it('loads the single theme source from the widget without a consumer import', () => {
	const component = readFileSync('src/lib/components/Web3Wallet.svelte', 'utf8');
	expect(component).toContain("import '../styles/theme.css';");
});
