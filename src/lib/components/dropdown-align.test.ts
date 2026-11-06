import { expect, it } from 'vitest';
import { resolveDropdownAlign } from './dropdown-align.js';

it.each([
	['a left trigger', { left: 16, right: 196 }, 280, 1024, 'start'],
	['a right-edge trigger', { left: 820, right: 1000 }, 280, 1024, 'end'],
	['a panel wider than the viewport', { left: 400, right: 580 }, 1200, 1024, 'start'],
	['a trigger where neither side fits', { left: 100, right: 280 }, 400, 480, 'start']
] as const)(
	'uses the expected alignment for %s',
	(_name, trigger, panelWidth, viewportWidth, expected) => {
		expect(resolveDropdownAlign(trigger, panelWidth, viewportWidth)).toBe(expected);
	}
);
