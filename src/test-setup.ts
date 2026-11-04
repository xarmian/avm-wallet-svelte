// jsdom has no canvas. The wallet connect packages load lottie-web at import time, which
// draws to a canvas context, so give every test a no-op context instead of null.
const context = new Proxy({} as Record<PropertyKey, unknown>, {
	get: (target, key) => (key in target ? target[key] : () => {}),
	set: (target, key, value) => {
		target[key] = value;
		return true;
	}
});

HTMLCanvasElement.prototype.getContext = (() =>
	context) as unknown as HTMLCanvasElement['getContext'];
