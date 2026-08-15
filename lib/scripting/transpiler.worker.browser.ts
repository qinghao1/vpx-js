if ((globalThis as any).process === undefined) {
	;(globalThis as any).process = { env: {}, cwd: () => '/', nextTick: (cb: (...a: any[]) => void, ...a: any[]) => setTimeout(() => cb(...a), 0), on: () => {}, once: () => {}, off: () => {}, emit: () => {}, removeListener: () => {} }
}
if ((self as any).process === undefined) {
	;(self as any).process = (globalThis as any).process
}
if ((self as any).global === undefined) (self as any).global = self

let transpileInWorker: ((p: any) => Promise<string>) | undefined

self.onmessage = async (e: MessageEvent) => {
	if (!transpileInWorker) {
		try {
			const mod: any = await import('./transpiler-worker-core.js')
			transpileInWorker = mod.transpileInWorker
		} catch (err: any) {
			;(self as any).postMessage({ id: (e as any).data?.id, ok: false, error: err?.message ?? String(err) + (err?.stack ? '\n' + err.stack : '') })
			return
		}
	}
	const { id, vbs, globalFunction, globalObject, tableData } = (e as any).data
	try {
		const js = await transpileInWorker!({ vbs, globalFunction, globalObject, tableData })
		;(self as any).postMessage({ id, ok: true, js })
	} catch (err: any) {
		;(self as any).postMessage({ id, ok: false, error: err?.message ?? String(err) + (err?.stack ? '\n' + err.stack : '') })
	}
}
