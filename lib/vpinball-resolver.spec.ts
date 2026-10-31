// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
// Lives under lib/ because vitest only includes lib/**/*.spec.ts.

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
	expandFixture,
	extractGameName,
	resolvePathToUrl,
	resolveUrlToPath,
	resolveVpxPath,
} from '../test/harness/vpinball-resolver.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const flipperVpx = join(repoRoot, 'test', 'fixtures', 'table-flipper.vpx')

describe('vpinball resolver', () => {
	describe('expandFixture', () => {
		it('resolves a short name to the fixtures dir', () => {
			const resolved = expandFixture('flipper')
			expect(resolved).toBe(flipperVpx)
			expect(resolved !== null && existsSync(resolved)).toBe(true)
		})

		it('resolves a table- prefixed name to the same file', () => {
			expect(expandFixture('table-flipper')).toBe(flipperVpx)
		})

		it('returns null for unknown and blank names', () => {
			expect(expandFixture('no-such-xyz')).toBeNull()
			expect(expandFixture('')).toBeNull()
			expect(expandFixture('   ')).toBeNull()
		})
	})

	describe('resolveVpxPath', () => {
		it('passes an absolute existing path through', () => {
			expect(resolveVpxPath(flipperVpx)).toBe(flipperVpx)
		})

		it('decodes a Vite /@fs param to the same path', () => {
			expect(resolveVpxPath(`/@fs${flipperVpx}`)).toBe(flipperVpx)
		})

		it('expands a fixture short name', () => {
			expect(resolveVpxPath('flipper')).toBe(flipperVpx)
		})

		it('returns null for urls and blank input', () => {
			expect(resolveVpxPath('http://example.com/table.vpx')).toBeNull()
			expect(resolveVpxPath('')).toBeNull()
		})
	})

	describe('extractGameName', () => {
		it('reads cGameName assignments', () => {
			expect(extractGameName('cGameName = "twd_160h"')).toBe('twd_160h')
		})

		it('reads Controller.GameName assignments', () => {
			expect(extractGameName(`Controller.GameName="tz_94h"`)).toBe('tz_94h')
		})

		it('returns null when no game name is present', () => {
			expect(extractGameName('Sub Foo()\nEnd Sub\n')).toBeNull()
		})

		it('ignores cGameName values in VBScript comments', () => {
			expect(extractGameName(`'Const cGameName = "mm_10"\nConst cGameName="mm_109b"`)).toBe('mm_109b')
		})

		it('ignores REM-commented and trailing-comment assignments', () => {
			expect(extractGameName(`REM cGameName = "mm_10"\nController.GameName="tz_94h"`)).toBe('tz_94h')
			expect(extractGameName(`Const cGameName="mm_109b" ' was "mm_10"`)).toBe('mm_109b')
		})

		it('ignores colon-separated trailing REM comments', () => {
			expect(extractGameName(`x = 1 : REM cGameName = "olddead"\nConst cGameName="mm_109b"`)).toBe('mm_109b')
		})

		it('keeps REMARK identifiers as code', () => {
			expect(extractGameName(`REMARK = 1\nConst cGameName="mm_109b"`)).toBe('mm_109b')
		})
	})

	describe('browser url round-trip', () => {
		it('resolvePathToUrl output resolves back to the same vpx', () => {
			const url = resolvePathToUrl(flipperVpx, null)
			expect(url).toContain('/@fs')
			const { vpxPath, romPath } = resolveUrlToPath(url)
			expect(vpxPath).toBe(flipperVpx)
			expect(romPath).toBeNull()
		})

		it('carries an explicit rom path through the round-trip', () => {
			const rom = join(repoRoot, 'test', 'fixtures', 'test_pattern.png')
			const url = resolvePathToUrl(flipperVpx, rom)
			const { vpxPath, romPath } = resolveUrlToPath(url)
			expect(vpxPath).toBe(flipperVpx)
			expect(romPath).toBe(rom)
		})
	})
})
