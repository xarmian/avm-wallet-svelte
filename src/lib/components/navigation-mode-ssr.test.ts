import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeAll, expect, it } from 'vitest';

let labels: Record<string, string>;

beforeAll(async () => {
	// A separate Node process renders without jsdom or browser module resolution.
	const { stdout } = await promisify(execFile)(process.execPath, [
		'--input-type=module',
		'-e',
		`
		delete process.env.VITEST;
		const { createServer } = await import('vite');
		const server = await createServer({
			server: { middlewareMode: true },
			logLevel: 'silent'
		});
		try {
			const { render } = await server.ssrLoadModule('svelte/server');
			const { default: Web3Wallet } = await server.ssrLoadModule('/src/lib/components/Web3Wallet.svelte');
			const { createWalletScope, registerScope } = await server.ssrLoadModule('/src/lib/state/scope.svelte.ts');
			const x = { address: 'XXXXXX1234567890XXXX', name: 'Account X', walletId: 'pera', authenticated: false, isWatch: false };
			const y = { ...x, address: 'YYYYYY1234567890YYYY', name: 'Account Y' };
			const cases = [
				['default', {}, [x, y]],
				['selection', { accountMode: 'selection', currentAccount: y }, [x, y]],
				['navigation-null', { accountMode: 'navigation', currentAccount: null }, [x, y]],
				['navigation-omitted', { accountMode: 'navigation' }, [x, y]],
				['navigation-current', { accountMode: 'navigation', currentAccount: y }, [x, y]],
				['navigation-address', { accountMode: 'navigation', currentAccount: y }, [x, { ...y, name: undefined }]],
				['navigation-disconnected', { accountMode: 'navigation', currentAccount: { ...y, walletId: 'defly' } }, [x, y]],
				['navigation-empty', { accountMode: 'navigation' }, []]
			];
			const labels = {};
			for (const [name, props, accounts] of cases) {
				const scope = createWalletScope('ssr-' + name);
				scope.walletStore.addAccounts(accounts);
				registerScope(scope);
				const { body } = render(Web3Wallet, { props: { algodClient: {}, scope: scope.scopeId, ...props } });
				labels[name] = body;
			}
			console.log(JSON.stringify(labels));
		} finally {
			await server.close();
		}
		`
	]);
	labels = JSON.parse(stdout);
}, 30000);

it.each([
	['default', 'Account X'],
	['selection', 'Account X'],
	['navigation-null', 'Your accounts'],
	['navigation-omitted', 'Your accounts'],
	['navigation-current', 'Account Y'],
	['navigation-address', 'YYYYYY...YYYY'],
	['navigation-disconnected', 'Your accounts'],
	['navigation-empty', 'Your accounts']
])('renders the %s trigger on the server without browser APIs', (mode, expected) => {
	expect(labels[mode]).toContain(expected);
	if (mode.startsWith('navigation')) expect(labels[mode]).not.toContain('Account X');
});
