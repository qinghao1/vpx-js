// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { expect } from 'chai'
import {
	createSessionIni,
	discoverVpinball,
	getArg,
	getNativeArgs,
	hasFlag,
	parseVpxArgs,
	resolveRomPath,
	resolveVpxPath,
	resolveVpxSession,
} from './vpinball-resolver.js'

describe('vpinball-resolver arg parsing', () => {
	describe('getArg', () => {
		it('returns the default when the flag is absent', () => {
			expect(getArg([], 'vpx', null)).to.equal(null)
			expect(getArg(['--other=1'], 'vpx', 'fallback')).to.equal('fallback')
		})

		it('returns the --name=value payload', () => {
			expect(getArg(['--vpx=table-flipper'], 'vpx', null)).to.equal('table-flipper')
		})

		it('last occurrence wins on repeats', () => {
			expect(getArg(['--vpx=first.vpx', '--vpx=second.vpx'], 'vpx', null)).to.equal('second.vpx')
		})

		it('does not match other flag names sharing a prefix', () => {
			expect(getArg(['--vpxfoo=1'], 'vpx', null)).to.equal(null)
			expect(getArg(['--vpxfoo=1', '--vpx=ok.vpx'], 'vpx', null)).to.equal('ok.vpx')
		})

		it('ignores the space-separated form (documented: --name=value only)', () => {
			expect(getArg(['--vpx', 'table.vpx'], 'vpx', null)).to.equal(null)
		})

		it('keeps values containing = intact', () => {
			expect(getArg(['--url=http://x/?a=b'], 'url', null)).to.equal('http://x/?a=b')
		})
	})

	describe('parseVpxArgs', () => {
		it('extracts --vpx/--rom/--url and leaves the rest', () => {
			const parsed = parseVpxArgs(['--vpx=a.vpx', '--rom=b.zip', '--url=http://x', '--audit'])
			expect(parsed.vpx).to.equal('a.vpx')
			expect(parsed.rom).to.equal('b.zip')
			expect(parsed.url).to.equal('http://x')
			expect(parsed.rest).to.deep.equal(['--audit'])
		})

		it('last occurrence wins on repeats', () => {
			const parsed = parseVpxArgs(['--vpx=first.vpx', '--vpx=second.vpx'])
			expect(parsed.vpx).to.equal('second.vpx')
		})

		it('accepts the space-separated form', () => {
			const parsed = parseVpxArgs(['--vpx', 'a.vpx', '--rom', 'b.zip'])
			expect(parsed.vpx).to.equal('a.vpx')
			expect(parsed.rom).to.equal('b.zip')
			expect(parsed.rest).to.deep.equal([])
		})

		it('space form and equals form mix with last-wins', () => {
			const parsed = parseVpxArgs(['--vpx=first.vpx', '--vpx', 'second.vpx'])
			expect(parsed.vpx).to.equal('second.vpx')
		})

		it('treats a bare http(s) token as the url', () => {
			const parsed = parseVpxArgs(['https://localhost:3000/?vpx=a'])
			expect(parsed.url).to.equal('https://localhost:3000/?vpx=a')
			expect(parsed.rest).to.deep.equal([])
		})

		it('keeps non-flag tokens in rest', () => {
			const parsed = parseVpxArgs(['flipper', '--audit'])
			expect(parsed.vpx).to.equal(null)
			expect(parsed.rest).to.deep.equal(['flipper', '--audit'])
		})
	})

	describe('hasFlag', () => {
		it('matches exact flags only', () => {
			expect(hasFlag(['--audit'], 'audit')).to.equal(true)
			expect(hasFlag(['--audit=x'], 'audit')).to.equal(false)
			expect(hasFlag([], 'audit')).to.equal(false)
		})
	})
})

describe('parseVpxArgs rest forwarding', () => {
	it('keeps unknown flags in rest so runners can forward them', () => {
		const parsed = parseVpxArgs(['--vpx=a.vpx', '--headed', '--width=1280', 'flipper'])
		expect(parsed.vpx).to.equal('a.vpx')
		expect(parsed.rest).to.deep.equal(['--headed', '--width=1280', 'flipper'])
	})

	it('agrees with getArg that the last --vpx= wins', () => {
		const args = ['--vpx=first.vpx', '--vpx=second.vpx']
		expect(getArg(args, 'vpx', null)).to.equal('second.vpx')
		expect(parseVpxArgs(args).vpx).to.equal('second.vpx')
	})
})

describe('resolveVpxPath contract', () => {
	it('returns null for empty, blank, and bare-URL inputs', () => {
		expect(resolveVpxPath('')).to.equal(null)
		expect(resolveVpxPath('   ')).to.equal(null)
		expect(resolveVpxPath('http://localhost:3000/?vpx=a')).to.equal(null)
		expect(resolveVpxPath('https://localhost:3000/?vpx=a')).to.equal(null)
	})

	it('returns null (not a resolved guess) for missing files', () => {
		const missing = path.join(os.tmpdir(), `vpx-missing-${process.pid}.vpx`)
		expect(fs.existsSync(missing)).to.equal(false)
		expect(resolveVpxPath(missing)).to.equal(null)
		expect(resolveVpxPath(`/@fs${missing}`)).to.equal(null)
		expect(resolveVpxPath('no-such-fixture-xyz')).to.equal(null)
	})

	it('resolves an existing file to its absolute path', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpx-resolver-'))
		try {
			const file = path.join(dir, 'probe.vpx')
			fs.writeFileSync(file, 'x')
			expect(resolveVpxPath(file)).to.equal(path.resolve(file))
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it('resolves a known fixture short name', () => {
		const resolved = resolveVpxPath('table-flipper')
		expect(resolved).to.be.a('string')
		expect(resolved.endsWith('table-flipper.vpx')).to.equal(true)
		expect(fs.existsSync(resolved)).to.equal(true)
	})
})

describe('resolveRomPath', () => {
	it('returns the explicit file when it exists, null when missing', async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpx-rom-'))
		try {
			const rom = path.join(dir, 'game.zip')
			fs.writeFileSync(rom, 'x')
			expect(await resolveRomPath(rom, null, dir)).to.equal(path.resolve(rom))
			expect(await resolveRomPath(path.join(dir, 'absent.zip'), null, dir)).to.equal(null)
			expect(await resolveRomPath(null, null, dir)).to.equal(null)
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})
})

describe('resolveVpxSession', () => {
	let dir: string
	let vpx: string

	before(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpx-session-'))
		vpx = path.join(dir, 'table-probe.vpx')
		fs.writeFileSync(vpx, '')
	})

	after(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	it('resolves a tmp fixture: paths, table name, native play args, session INI', async () => {
		const session = await resolveVpxSession([`--vpx=${vpx}`])
		try {
			expect(session.vpxPath).to.equal(path.resolve(vpx))
			expect(session.tableName).to.equal('table-probe')
			expect(session.romPath).to.equal(null)
			expect(session.browserUrl.startsWith('http://localhost:3000/')).to.equal(true)
			expect(session.nativeArgs[0]).to.equal('-Play')
			expect(session.nativeArgs).to.include(path.resolve(vpx))
			expect(fs.existsSync(session.iniPath)).to.equal(true)
		} finally {
			fs.rmSync(path.dirname(session.iniPath), { recursive: true, force: true })
		}
	})

	it('preserves an explicit https browser URL verbatim', async () => {
		const url = `https://localhost:3000/?vpx=${encodeURIComponent(`/@fs${vpx}`)}&mode=play`
		const session = await resolveVpxSession([url])
		try {
			expect(session.browserUrl).to.equal(url)
			expect(session.vpxPath).to.equal(path.resolve(vpx))
		} finally {
			fs.rmSync(path.dirname(session.iniPath), { recursive: true, force: true })
		}
	})

	it('throws for missing VPX input', async () => {
		let error: Error | null = null
		try {
			await resolveVpxSession([`--vpx=${path.join(dir, 'absent.vpx')}`])
		} catch (err) {
			error = err as Error
		}
		expect(error?.message ?? '').to.contain('VPX not found')
	})
})

describe('createSessionIni + getNativeArgs', () => {
	it('stages a transient INI with window geometry and ROM dir', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpx-ini-'))
		try {
			const vpx = path.join(dir, 'table-probe.vpx')
			const rom = path.join(dir, 'game.zip')
			fs.writeFileSync(vpx, '')
			fs.writeFileSync(rom, '')
			const iniPath = createSessionIni(vpx, rom, { width: 800, height: 600, x: 10, y: 20 })
			try {
				const content = fs.readFileSync(iniPath, 'utf-8')
				expect(content).to.contain('PlayfieldWndX = 10')
				expect(content).to.contain('PlayfieldWndY = 20')
				expect(content).to.contain('PlayfieldWidth = 800')
				expect(content).to.contain('PlayfieldHeight = 600')
				expect(content).to.contain(`PinMAMEPath = ${dir}`)
			} finally {
				fs.rmSync(path.dirname(iniPath), { recursive: true, force: true })
			}
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it('builds per-mode native args', () => {
		const vpx = '/tmp/table-probe.vpx'
		const ini = '/tmp/VPinballX.ini'
		expect(getNativeArgs(vpx, ini, 'play')).to.deep.equal([
			'-Play',
			path.resolve(vpx),
			'-Ini',
			ini,
			'-DisableTrueFullscreen',
		])
		expect(getNativeArgs(vpx, ini, 'extractvbs')).to.deep.equal(['-ExtractVBS', path.resolve(vpx)])
		expect(getNativeArgs(vpx, ini, 'audit')).to.deep.equal(['-Audit', path.resolve(vpx)])
		expect(getNativeArgs(vpx, ini, 'pov')).to.deep.equal(['-Pov', path.resolve(vpx)])
	})
})

describe('discoverVpinball', () => {
	it('honors VPINBALL_BIN pointing at a binary', () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpx-disc-'))
		const prev = process.env.VPINBALL_BIN
		try {
			const bin = path.join(dir, 'VPinballX_GL')
			fs.writeFileSync(bin, '')
			process.env.VPINBALL_BIN = bin
			const disc = discoverVpinball()
			expect(disc.binPath).to.equal(path.resolve(bin))
			expect(disc.source).to.contain('VPINBALL_BIN')
		} finally {
			if (prev === undefined) delete process.env.VPINBALL_BIN
			else process.env.VPINBALL_BIN = prev
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})
})
