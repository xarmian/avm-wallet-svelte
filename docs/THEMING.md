# Theming Guide

AVM Wallet uses CSS custom properties (CSS variables) for theming. This allows you to fully customize the appearance of wallet components to match your application's design.

## Quick Start

`Web3Wallet` automatically imports the default light and dark tokens, including in
SvelteKit production builds and SSR. No separate CSS import is required. Existing
imports of `avm-wallet-svelte/styles/theme.css` remain supported and are optional.

Override the CSS custom properties you want to change:

```css
:root {
	--avm-color-primary: 79 70 229; /* Change primary color to indigo */
	--avm-radius-md: 1rem; /* More rounded corners */
}
```

Defaults use `:where(:root)` and `:where(.dark, [data-theme='dark'])`, which have
zero specificity. Your ordinary `:root` rule wins on the root element regardless
of stylesheet load order, including when dark mode is set on that element.
For a nested dark container, override tokens on that container (for example,
`.dark { --avm-color-primary: 165 180 252; }`); declarations on descendants take
precedence over inherited root values. Defaults are never placed on the widget itself.

The dropdown uses `dropdownAlign="auto"` by default: after opening in the browser,
it chooses end alignment only when start would overflow right and end fits.
`dropdownAlign="start"` keeps the original alignment; `dropdownAlign="end"` forces
right alignment. Automatic alignment starts at `start` during SSR.

## Color Format

Colors use space-separated RGB values without the `rgb()` function. This allows for easy opacity modifications:

```css
:root {
	--avm-color-primary: 37 99 235; /* blue-600 */
}

/* Usage */
.button {
	background-color: rgb(var(--avm-color-primary)); /* Solid */
	background-color: rgb(var(--avm-color-primary) / 0.5); /* 50% opacity */
}
```

## Available Properties

### Colors

#### Primary Colors

| Property                     | Default (Light)        | Description          |
| ---------------------------- | ---------------------- | -------------------- |
| `--avm-color-primary`        | `37 99 235` (blue-600) | Primary action color |
| `--avm-color-primary-hover`  | `29 78 216` (blue-700) | Primary hover state  |
| `--avm-color-primary-active` | `30 64 175` (blue-800) | Primary active state |

`--avm-color-on-primary` is `255 255 255` in light mode and `23 23 23` in dark
mode. Primary-filled controls use it for text; `--avm-text-inverse` remains available
for existing themes.

#### Secondary Colors

| Property                      | Default                  | Description       |
| ----------------------------- | ------------------------ | ----------------- |
| `--avm-color-secondary`       | `107 114 128` (gray-500) | Secondary actions |
| `--avm-color-secondary-hover` | `75 85 99` (gray-600)    | Secondary hover   |

#### Status Colors

| Property              | Default                  | Description    |
| --------------------- | ------------------------ | -------------- |
| `--avm-color-success` | `34 197 94` (green-500)  | Success states |
| `--avm-color-warning` | `234 179 8` (yellow-500) | Warning states |
| `--avm-color-error`   | `239 68 68` (red-500)    | Error states   |
| `--avm-color-info`    | `59 130 246` (blue-500)  | Info states    |

### Backgrounds

| Property                   | Default (Light)          | Description             |
| -------------------------- | ------------------------ | ----------------------- |
| `--avm-bg-primary`         | `255 255 255` (white)    | Main background         |
| `--avm-bg-secondary`       | `249 250 251` (gray-50)  | Secondary background    |
| `--avm-bg-tertiary`        | `243 244 246` (gray-100) | Tertiary background     |
| `--avm-bg-hover`           | `243 244 246` (gray-100) | Hover state background  |
| `--avm-bg-active`          | `229 231 235` (gray-200) | Active state background |
| `--avm-bg-overlay`         | `0 0 0` (black)          | Modal overlay color     |
| `--avm-bg-overlay-opacity` | `0.5`                    | Modal overlay opacity   |

### Text

| Property               | Default (Light)          | Description              |
| ---------------------- | ------------------------ | ------------------------ |
| `--avm-text-primary`   | `17 24 39` (gray-900)    | Primary text             |
| `--avm-text-secondary` | `75 85 99` (gray-600)    | Secondary text           |
| `--avm-text-tertiary`  | `156 163 175` (gray-400) | Tertiary/muted text      |
| `--avm-text-inverse`   | `255 255 255` (white)    | Text on dark backgrounds |

### Borders

| Property             | Default                  | Description    |
| -------------------- | ------------------------ | -------------- |
| `--avm-border-color` | `229 231 235` (gray-200) | Default border |
| `--avm-border-focus` | `59 130 246` (blue-500)  | Focus ring     |
| `--avm-border-error` | `239 68 68` (red-500)    | Error border   |

### Spacing

| Property           | Default   | Description        |
| ------------------ | --------- | ------------------ |
| `--avm-spacing-xs` | `0.25rem` | Extra small (4px)  |
| `--avm-spacing-sm` | `0.5rem`  | Small (8px)        |
| `--avm-spacing-md` | `1rem`    | Medium (16px)      |
| `--avm-spacing-lg` | `1.5rem`  | Large (24px)       |
| `--avm-spacing-xl` | `2rem`    | Extra large (32px) |

### Border Radius

| Property            | Default   | Description        |
| ------------------- | --------- | ------------------ |
| `--avm-radius-sm`   | `0.25rem` | Small (4px)        |
| `--avm-radius-md`   | `0.5rem`  | Medium (8px)       |
| `--avm-radius-lg`   | `0.75rem` | Large (12px)       |
| `--avm-radius-xl`   | `1rem`    | Extra large (16px) |
| `--avm-radius-full` | `9999px`  | Fully rounded      |

### Shadows

| Property          | Default            | Description       |
| ----------------- | ------------------ | ----------------- |
| `--avm-shadow-sm` | Small shadow       | Subtle elevation  |
| `--avm-shadow-md` | Medium shadow      | Medium elevation  |
| `--avm-shadow-lg` | Large shadow       | High elevation    |
| `--avm-shadow-xl` | Extra large shadow | Highest elevation |

### Typography

| Property                     | Default         | Description       |
| ---------------------------- | --------------- | ----------------- |
| `--avm-font-family`          | System fonts    | Main font family  |
| `--avm-font-mono`            | Monospace fonts | Code/address font |
| `--avm-font-size-xs`         | `0.75rem`       | Extra small text  |
| `--avm-font-size-sm`         | `0.875rem`      | Small text        |
| `--avm-font-size-base`       | `1rem`          | Base text size    |
| `--avm-font-size-lg`         | `1.125rem`      | Large text        |
| `--avm-font-weight-normal`   | `400`           | Normal weight     |
| `--avm-font-weight-medium`   | `500`           | Medium weight     |
| `--avm-font-weight-semibold` | `600`           | Semibold weight   |
| `--avm-font-weight-bold`     | `700`           | Bold weight       |

### Component Specific

| Property                   | Default                | Description          |
| -------------------------- | ---------------------- | -------------------- |
| `--avm-btn-height`         | `2.5rem`               | Button height        |
| `--avm-btn-radius`         | `var(--avm-radius-md)` | Button border radius |
| `--avm-wallet-list-width`  | `20rem`                | Dropdown width       |
| `--avm-wallet-item-height` | `3.5rem`               | Wallet item height   |
| `--avm-wallet-icon-size`   | `2rem`                 | Wallet icon size     |
| `--avm-modal-width`        | `28rem`                | Modal width          |

## Dark Mode

The theme includes built-in dark mode support. Add the `dark` class or `data-theme="dark"` attribute to enable it:

```html
<body class="dark">
	<!-- Components will use dark theme -->
</body>
```

### Dark Mode Values

| Property              | Dark Mode Value         |
| --------------------- | ----------------------- |
| `--avm-color-primary` | `96 165 250` (blue-400) |
| `--avm-bg-primary`    | `17 24 39` (gray-900)   |
| `--avm-bg-secondary`  | `31 41 55` (gray-800)   |
| `--avm-text-primary`  | `249 250 251` (gray-50) |
| `--avm-border-color`  | `75 85 99` (gray-600)   |

## Contrast

Default primary-filled buttons meet WCAG 2.2 AA's 4.5:1 normal-text contrast
threshold in both themes, including hover and active token values. Light primary
also exceeds 4.5:1 as text on `--avm-bg-primary` (and 3:1 as a border).
When customizing a primary color, check `--avm-color-on-primary` against all three
primary states as well as primary text against the panel background. Dark primary
is intentionally lighter for text on dark panels, so its button text is dark.

This is not a claim that every default pair meets AA. Existing muted text, success
and error text, and some UI indicators/borders fall below their applicable thresholds.
The explicit `knownBelowAA` list in `src/lib/styles/contrast.test.ts` records each
pair and measured ratio; the guard covers component foregrounds, inherited hover
and selected surfaces, and alpha-composited backgrounds. Disabled controls are
exempt under WCAG and are not audited with their disabled opacity.
See [WCAG 2.2 contrast requirements](https://www.w3.org/TR/WCAG22/#contrast-minimum).

## Example Themes

### Purple Theme

```css
:root {
	--avm-color-primary: 139 92 246; /* violet-500 */
	--avm-color-primary-hover: 124 58 237; /* violet-600 */
	--avm-color-primary-active: 109 40 217; /* violet-700 */
}
```

### Green Theme

```css
:root {
	--avm-color-primary: 34 197 94; /* green-500 */
	--avm-color-primary-hover: 22 163 74; /* green-600 */
	--avm-color-primary-active: 21 128 61; /* green-700 */
}
```

### Custom Brand Theme

```css
:root {
	/* Brand colors */
	--avm-color-primary: 255 107 0; /* Orange */
	--avm-color-primary-hover: 230 96 0;

	/* Custom fonts */
	--avm-font-family: 'Inter', system-ui, sans-serif;

	/* Rounder corners */
	--avm-radius-md: 1rem;
	--avm-radius-lg: 1.5rem;

	/* Custom button height */
	--avm-btn-height: 3rem;
}
```

## Using with Tailwind CSS

The theme integrates well with Tailwind CSS:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Optional: Web3Wallet already imports these defaults */
@import 'avm-wallet-svelte/styles/theme.css';

/* Use Tailwind colors */
:root {
	--avm-color-primary: theme('colors.indigo.500');
}
```

## Scoping Themes

You can scope themes to specific containers:

```css
.wallet-container {
	--avm-color-primary: 236 72 153; /* pink-500 */
	--avm-bg-primary: 253 242 248; /* pink-50 */
}
```

```html
<div class="wallet-container">
	<Web3Wallet {algodClient} />
</div>
```

## Browser Support

CSS custom properties are supported in all modern browsers:

- Chrome 49+
- Firefox 31+
- Safari 9.1+
- Edge 15+

Automatic defaults also require `:where()` support.
Browsers without CSS custom properties or `:where()` do not receive these defaults.
