// Browser integration — puppeteer full stack (viewer, physics, DMD, textures)
import { spawn } from 'node:child_process'
import path from 'node:path'

export async function verifyBrowser(): Promise<boolean> {
	console.log('# browser — integration (viewer + physics + DMD)')
	const root = process.cwd()
	const script = path.join(root, 'demo-browser/harness/integration.mjs')
	try {
		const code = await new Promise<number>(res => {
			const p = spawn('node', [script], { stdio: 'inherit' })
			p.on('close', c => res(c ?? 1))
			p.on('error', () => res(1))
		})
		return code === 0
	} catch {
		return false
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const ok = await verifyBrowser()
	process.exit(ok ? 0 : 1)
}
