;(globalThis as any).process ??= {
	env: {},
	browser: true,
	platform: 'browser',
	version: '',
	argv: [],
	cwd: () => '/',
	nextTick: (cb: (...a: any[]) => void, ...a: any[]) =>
		typeof queueMicrotask !== 'undefined' ? queueMicrotask(() => cb(...a)) : setTimeout(() => cb(...a), 0),
	on: () => {},
	once: () => {},
	off: () => {},
	addListener: () => {},
	removeListener: () => {},
	removeAllListeners: () => {},
	emit: () => {},
} as any
;(globalThis as any).global ??= globalThis
;(self as any).process ??= (globalThis as any).process
;(self as any).global ??= (globalThis as any).global
if (!(self as any).process?.on) (self as any).process.on = () => {}
if (!(globalThis as any).process?.on) (globalThis as any).process.on = () => {}

let transpileInWorker: ((p: any) => Promise<string>) | undefined

self.onmessage = async (e: MessageEvent) => {
	if (!transpileInWorker) {
		try {
			const mod: any = await import('./transpiler-worker-core.js')
			transpileInWorker = mod.transpileInWorker
		} catch (err: any) {
			;(self as any).postMessage({
				id: (e as any).data?.id,
				ok: false,
				error: err?.message ?? String(err) + (err?.stack ? '\n' + err.stack : ''),
			})
			return
		}
	}
	const { id, vbs, globalFunction, globalObject, tableData } = (e as any).data
	try {
		const js = await transpileInWorker!({ vbs, globalFunction, globalObject, tableData })
		;(self as any).postMessage({ id, ok: true, js })
	} catch (err: any) {
		;(self as any).postMessage({
			id,
			ok: false,
			error: err?.message ?? String(err) + (err?.stack ? '\n' + err.stack : ''),
		})
	}
}
