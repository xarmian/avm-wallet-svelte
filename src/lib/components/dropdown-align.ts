/** Prefer start unless it overflows right and end fits inside the viewport. */
export function resolveDropdownAlign(
	trigger: { left: number; right: number },
	panelWidth: number,
	viewportWidth: number
): 'start' | 'end' {
	return trigger.left + panelWidth > viewportWidth &&
		trigger.right - panelWidth >= 0 &&
		trigger.right <= viewportWidth
		? 'end'
		: 'start';
}
