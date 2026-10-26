import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { discoverVpinball, getDynamicLinkerEnv } from '../test/harness/vpinball-resolver.js'

function canExecute(filePath: string): boolean {
	try {
		fs.accessSync(filePath, fs.constants.X_OK)
		return true
	} catch {
		return false
	}
}

function firstExisting(candidates: string[]): string | undefined {
	return candidates.find(candidate => fs.existsSync(candidate))
}

// Fallback: any shader* dir holding .glfx/.fxh sources.
function scanForShaderDir(binDir: string): string | undefined {
	for (const dir of [binDir, path.join(binDir, '..')]) {
		try {
			for (const entry of fs.readdirSync(dir)) {
				if (!entry.toLowerCase().startsWith('shader')) continue
				const full = path.join(dir, entry)
				try {
					if (
						fs.statSync(full).isDirectory() &&
						fs.readdirSync(full).some(file => file.endsWith('.glfx') || file.endsWith('.fxh'))
					) {
						return full
					}
				} catch {}
			}
		} catch {}
	}
	return undefined
}

export async function runDoctor(): Promise<boolean> {
	console.log('# vpinball doctor — pre-flight diagnostics')
	const disc = discoverVpinball()
	console.log(`\n[discovery] ${disc.binPath ? `found ${disc.binPath} (${disc.source})` : 'NOT FOUND'}`)
	if (!disc.binPath || !disc.binDir) {
		console.log('  → run: npm run vpinball:setup  or  bash scripts/setup-vpinball.sh')
		console.log('  → or set VPINBALL_BIN=/path/to/VPinballX_GL')
		console.log('  → or clone: git clone https://github.com/vpinball/vpinball.git ~/projects/vpinball')
		return false
	}
	let ok = true
	const binPath = disc.binPath
	const binDir = disc.binDir
	const stat = fs.statSync(binPath)
	console.log(`\n[perm] ${binPath}`)
	console.log(
		`  size: ${(stat.size / 1024 / 1024).toFixed(2)} MB  mode: ${(stat.mode & 0o777).toString(8)}  x_ok: ${canExecute(binPath) ? 'yes' : 'no'}`,
	)
	try {
		const fileOut = execSync(`file "${binPath}" 2>&1`, { encoding: 'utf-8' }).trim()
		console.log(`  file: ${fileOut}`)
	} catch {}
	console.log('\n[linker] shared deps')
	if (process.platform === 'linux') {
		try {
			const ldd = execSync(`ldd "${binPath}" 2>&1`, { encoding: 'utf-8' })
			const missing = ldd.split('\n').filter(line => line.includes('not found'))
			if (missing.length) {
				ok = false
				console.log('  MISSING:')
				for (const missingDep of missing) console.log(`    ${missingDep.trim()}`)
				console.log(
					'  Hint: sudo apt update && sudo apt install libsdl3-0 libsdl3-image0 libsdl3-ttf0 libfreeimage3 libhidapi-hidraw0 libopenal1 || sudo apt install libSDL3* libfreeimage*',
				)
			} else {
				console.log('  all deps resolved (ldd)')
			}
			const lines = ldd.split('\n').slice(0, 12)
			for (const line of lines) if (line.trim()) console.log(`    ${line.trim()}`)
		} catch (err: unknown) {
			console.log(`  ldd failed: ${(err as Error).message}`)
		}
	} else if (process.platform === 'darwin') {
		try {
			const otool = execSync(`otool -L "${binPath}" 2>&1`, { encoding: 'utf-8' })
			console.log(otool.split('\n').slice(0, 20).join('\n'))
		} catch (err: unknown) {
			console.log(`  otool failed: ${(err as Error).message}`)
		}
	}
	console.log('\n[layout] shaders / scripts / plugins')
	const shaderDir =
		firstExisting([
			path.join(binDir, 'shaders-10.8.1'),
			path.join(binDir, 'shaders'),
			path.join(binDir, '../shaders-10.8.1'),
		]) ?? scanForShaderDir(binDir)
	if (shaderDir) {
		console.log(`  shaders: ${shaderDir} (${fs.readdirSync(shaderDir).length} files)`)
	} else {
		ok = false
		console.log('  shaders: NOT FOUND (expected shaders-10.8.1/ with SMAA.glfx etc.)')
	}
	const scriptPath = firstExisting([
		path.join(binDir, 'scripts/core.vbs'),
		path.join(binDir, '../scripts/core.vbs'),
		path.join(binDir, 'scripts/vpmkeys.vbs'),
	])
	console.log(scriptPath ? `  scripts: ${scriptPath}` : '  scripts: not found (optional — scripts/core.vbs)')
	const pluginDir = firstExisting([path.join(binDir, 'plugins'), path.join(binDir, '../plugins')])
	if (pluginDir) {
		console.log(`  plugins: ${pluginDir} (${fs.readdirSync(pluginDir).join(', ')})`)
	}
	console.log('\n[pinmame] ROM search')
	const pinmamePaths = [
		path.join(os.homedir(), '.pinmame/roms'),
		path.join(os.homedir(), 'pinmame/roms'),
		path.join(os.homedir(), 'Downloads'),
	]
	for (const romDir of pinmamePaths) {
		const exists = fs.existsSync(romDir)
		const count = exists ? fs.readdirSync(romDir).filter(file => file.endsWith('.zip')).length : 0
		console.log(`  ${romDir}: ${exists ? `${count} zips` : 'not found'}`)
	}
	console.log('\n[env] dynamic linker')
	const env = getDynamicLinkerEnv(binDir)
	for (const [key, value] of Object.entries(env)) console.log(`  ${key}=${value}`)
	console.log(`\n[result] ${ok ? 'PASS' : 'FAIL — see hints above'}`)
	return ok
}
