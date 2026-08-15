// Browser integration — puppeteer full stack (viewer, physics, DMD, textures)
import { execSync, spawn } from 'node:child_process'
import path from 'node:path'

export async function verifyBrowser(): Promise<boolean> {
	console.log('# browser — integration (viewer + physics + DMD)')
	const root = process.cwd()
	const script = path.join(root, 'demo-browser/e2e/integration.mjs')
	try {
		const code = await new Promise<number>(res => {
			const p = spawn('node', [script], { stdio: 'inherit' })
			p.on('close', c => res(c ?? 1))
			p.on('error', () => res(1))
			const killStale = () => {
				try {
					execSync('pkill -9 -f "chrome.*headless.*puppeteer" 2>/dev/null || true', {
						timeout: 2000,
						stdio: 'ignore',
					})
				} catch {}
			}
			process.once('exit', killStale)
			process.once('SIGINT', killStale)
			process.once('SIGTERM', killStale)
			p.on('close', killStale)
		})
		return code === 0
	} catch {
		return false
	} finally {
		try {
			execSync('pkill -9 -f "chrome.*headless.*puppeteer" 2>/dev/null || true', {
				timeout: 2000,
				stdio: 'ignore',
			})
		} catch {}
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const ok = await verifyBrowser()
	process.exit(ok ? 0 : 1)
}
