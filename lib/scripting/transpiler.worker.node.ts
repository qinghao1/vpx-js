import { parentPort, isMainThread } from 'node:worker_threads'
import { transpileInWorker } from './transpiler-worker-core.js'

if (!isMainThread) {
	parentPort?.on('message', async (msg: any) => {
		const { id, vbs, globalFunction, globalObject, tableData } = msg
		try {
			const js = await transpileInWorker({ vbs, globalFunction, globalObject, tableData })
			parentPort?.postMessage({ id, ok: true, js })
		} catch (e: any) {
			parentPort?.postMessage({ id, ok: false, error: e?.message ?? String(e), stack: e?.stack })
		}
	})
}
