import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { Grammar } from './scripting/grammar/grammar.js'

// bin/*.ts self-execute on import, so their exit codes are covered via subprocess instead.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx')

function runCli(
	script: string,
	args: string[] = [],
	env: NodeJS.ProcessEnv = {},
): { status: number | null; stderr: string; stdout: string } {
	const result = spawnSync(tsxBin, [join(repoRoot, script), ...args], {
		cwd: repoRoot,
		encoding: 'utf-8',
		env: { ...process.env, ...env },
		timeout: 120000,
	})
	if (result.error) {
		throw result.error
	}
	return { status: result.status, stderr: result.stderr, stdout: result.stdout }
}

describe('legacy CLI exit codes', () => {
	let validVbs = ''
	let corruptVpx = ''

	beforeAll(() => {
		const fixtureDir = mkdtempSync(join(tmpdir(), 'vpx-js-cli-'))
		validVbs = join(fixtureDir, 'sample.vbs')
		writeFileSync(validVbs, 'Sub Test()\n\tDim value\n\tvalue = 1\nEnd Sub\n')
		corruptVpx = join(fixtureDir, 'corrupt.vpx')
		writeFileSync(corruptVpx, 'not a vpx file')
	})

	describe('failures exit nonzero', () => {
		it('vbs2js without args', () => {
			const run = runCli('bin/vbs2js.ts')
			expect(run.status).toBe(1)
			expect(run.stderr).toContain('USAGE')
		})

		it('vbs2js with missing file', () => {
			const run = runCli('bin/vbs2js.ts', [join(repoRoot, 'does-not-exist.vbs')])
			expect(run.status).toBe(1)
			expect(run.stderr).toContain('does-not-exist.vbs')
		})

		it('vbs-benchmark without args', () => {
			const run = runCli('bin/vbs-benchmark.ts')
			expect(run.status).toBe(1)
			expect(run.stderr).toContain('USAGE')
		})

		it('vpt2glb with missing file', () => {
			expect(runCli('bin/vpt2glb.ts', [join(repoRoot, 'does-not-exist.vpx')]).status).toBe(1)
		})

		it('vptscript with missing path', () => {
			expect(runCli('bin/vptscript.ts', [join(repoRoot, 'does-not-exist.vpx')]).status).toBe(1)
		})

		it('vptscript with corrupt table', () => {
			expect(runCli('bin/vptscript.ts', [corruptVpx]).status).toBe(1)
		})
	})

	describe('success still exits zero', () => {
		it('vbs2js transpiles a valid script', () => {
			const run = runCli('bin/vbs2js.ts', [validVbs])
			expect(run.status).toBe(0)
			expect(run.stdout).toContain('function Test')
		})

		it('vbs-benchmark transpiles a valid script', () => {
			const run = runCli('bin/vbs-benchmark.ts', [validVbs])
			expect(run.status).toBe(0)
			expect(run.stdout).toContain('Test')
		})

		it('vpt2glb prints usage without args', () => {
			const run = runCli('bin/vpt2glb.ts')
			expect(run.status).toBe(0)
			expect(run.stdout).toContain('USAGE')
		})

		it('vptscript prints usage without args', () => {
			const run = runCli('bin/vptscript.ts')
			expect(run.status).toBe(0)
			expect(run.stdout).toContain('USAGE')
		})

		it('vptscript prints a real table script', () => {
			const run = runCli('bin/vptscript.ts', [join(repoRoot, 'test', 'fixtures', 'table-empty.vpx')])
			expect(run.status).toBe(0)
			expect(run.stdout.length).toBeGreaterThan(0)
		})
	})

	describe('vbs2js output matches the Grammar library', () => {
		it('prints Grammar.vbsToJs output by default', () => {
			const vbs = readFileSync(validVbs, 'utf-8')
			const run = runCli('bin/vbs2js.ts', [validVbs])
			expect(run.status).toBe(0)
			expect(run.stdout).toBe(`${new Grammar().vbsToJs(vbs)}\n`)
		})

		it('prints Grammar.format output with --format-only', () => {
			const vbs = readFileSync(validVbs, 'utf-8')
			const run = runCli('bin/vbs2js.ts', [validVbs, '--format-only'])
			expect(run.status).toBe(0)
			expect(run.stdout).toBe(`${new Grammar().format(vbs)}\n`)
		})
	})

	describe('vpt2glb deprecated flags warn', () => {
		it('--compress-vertices warns on stderr', () => {
			const run = runCli('bin/vpt2glb.ts', [join(repoRoot, 'does-not-exist.vpx'), '--compress-vertices'])
			expect(run.status).toBe(1)
			expect(run.stderr).toContain('--compress-vertices is deprecated')
		})

		it('--skip-optimize warns on stderr', () => {
			const run = runCli('bin/vpt2glb.ts', [join(repoRoot, 'does-not-exist.vpx'), '--skip-optimize'])
			expect(run.status).toBe(1)
			expect(run.stderr).toContain('--skip-optimize is deprecated')
		})
	})

	describe('vptscript file and folder modes', () => {
		it('--save writes a <name>.vbs file next to the table', () => {
			const dir = mkdtempSync(join(tmpdir(), 'vpx-js-vptscript-save-'))
			const vpx = join(dir, 'table-empty.vpx')
			copyFileSync(join(repoRoot, 'test', 'fixtures', 'table-empty.vpx'), vpx)
			const run = runCli('bin/vptscript.ts', [vpx, '--save'])
			expect(run.status).toBe(0)
			expect(run.stdout).toContain('Writing to')
			const vbs = join(dir, 'table-empty.vbs')
			expect(existsSync(vbs)).toBe(true)
			expect(readFileSync(vbs, 'utf-8').length).toBeGreaterThan(0)
		})

		it('prints every table script in folder mode', () => {
			const dir = mkdtempSync(join(tmpdir(), 'vpx-js-vptscript-folder-'))
			copyFileSync(join(repoRoot, 'test', 'fixtures', 'table-empty.vpx'), join(dir, 'table-empty.vpx'))
			const run = runCli('bin/vptscript.ts', [dir])
			expect(run.status).toBe(0)
			expect(run.stdout.length).toBeGreaterThan(0)
		})

		it('exits nonzero when every table in a folder fails', () => {
			const dir = mkdtempSync(join(tmpdir(), 'vpx-js-vptscript-allfail-'))
			copyFileSync(corruptVpx, join(dir, 'corrupt.vpx'))
			const run = runCli('bin/vptscript.ts', [dir])
			expect(run.status).toBe(1)
			expect(run.stderr.length).toBeGreaterThan(0)
		})
	})

	describe('vpinball-runner exit codes', () => {
		it('--help exits zero', () => {
			const run = runCli('bin/vpinball-runner.ts', ['--help'])
			expect(run.status).toBe(0)
			expect(run.stdout).toContain('vpinball-runner')
		})

		it('without VPX input exits nonzero', () => {
			const run = runCli('bin/vpinball-runner.ts')
			expect(run.status).toBe(1)
			expect(run.stderr).toContain('no VPX input')
		})

		it('--doctor exit code matches its PASS/FAIL verdict in any environment', () => {
			const run = runCli('bin/vpinball-runner.ts', ['--doctor'])
			if (run.status === 0) {
				expect(run.stdout).toContain('[result] PASS')
			} else {
				expect(run.status).toBe(1)
				expect(run.stdout).toMatch(/FAIL|NOT FOUND/)
			}
		})

		it.skipIf(!existsSync('/bin/true'))('--ini uses the given session INI', () => {
			const dir = mkdtempSync(join(tmpdir(), 'vpx-js-ini-'))
			const customIni = join(dir, 'custom.ini')
			writeFileSync(customIni, '[Player]\nSoundVolume = 42\n')
			const run = runCli('bin/vpinball-runner.ts', ['--vpx=table-flipper', '--ini', customIni], {
				VPINBALL_BIN: '/bin/true',
				DISPLAY: ':0',
			})
			expect(run.status).toBe(0)
			expect(run.stdout).toContain(`-Ini ${customIni}`)
			expect(run.stdout).toContain('SoundVolume = 42')
		})

		it.skipIf(!existsSync('/bin/true'))('--ini falls back to the session INI when missing', () => {
			const dir = mkdtempSync(join(tmpdir(), 'vpx-js-ini-fallback-'))
			const run = runCli('bin/vpinball-runner.ts', ['--vpx=table-flipper', '--ini', join(dir, 'missing.ini')], {
				VPINBALL_BIN: '/bin/true',
				DISPLAY: ':0',
			})
			expect(run.status).toBe(0)
			expect(run.stdout).toContain('[vpinball] ini:')
			expect(run.stdout).not.toContain('missing.ini')
		})
	})
})
