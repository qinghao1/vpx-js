import { transpileInWorker } from './transpiler-worker-core.js'

self.onmessage = async (e: MessageEvent) => {
	const { id, vbs, globalFunction, globalObject, tableData } = (e as any).data
	try {
		const js = await transpileInWorker({ vbs, globalFunction, globalObject, tableData })
		;(self as any).postMessage({ id, ok: true, js })
	} catch (err: any) {
		;(self as any).postMessage({ id, ok: false, error: err?.message ?? String(err) })
	}
}
