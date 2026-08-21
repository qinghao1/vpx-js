import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { auditTableStructure, verifyVpinballCompat } from '../../test/harness/verify-vpinball-compat.js'
import { discoverVpinball } from '../../test/harness/vpinball-resolver.js'
import { NodeBinaryReader } from '../io/binary-reader.node.js'
import { Grammar } from '../scripting/grammar/grammar.js'
import { normalizeNewCall } from '../scripting/transpiler.js'
import { Table } from './table/table.js'

const FIXTURES_DIR = path.resolve('test/fixtures')
const FIXTURE_FILES = fs
	.readdirSync(FIXTURES_DIR)
	.filter(fileName => fileName.startsWith('table-') && fileName.endsWith('.vpx'))
	.sort()

describe('VPinball & Table Component Parity Regression', () => {
	it('discovers 25 test fixtures', () => {
		expect(FIXTURE_FILES.length).toBeGreaterThanOrEqual(25)
	})

	describe.each(FIXTURE_FILES)('Fixture: %s', fixtureName => {
		const fixturePath = path.join(FIXTURES_DIR, fixtureName)

		it('loads table model and audits all 22 components without errors', async () => {
			const reader = new NodeBinaryReader(fixturePath)
			const table = await Table.load(reader, { loadTableScript: true })
			expect(table).toBeDefined()

			const audit = auditTableStructure(table)
			expect(audit).toBeDefined()
			expect(audit.itemCounts.totalItems).toBeGreaterThanOrEqual(0)
			expect(audit.physics.allPhysicsValid).toBe(true)
			expect(audit.physics.issues).toHaveLength(0)
			expect(audit.errors).toHaveLength(0)
		})

		it('transpiles table script to syntax-valid JavaScript in V8', async () => {
			const reader = new NodeBinaryReader(fixturePath)
			const table = await Table.load(reader, { loadTableScript: true })
			const rawScript = (table as unknown as { tableScript?: string }).tableScript ?? ''

			if (rawScript.trim().length > 0) {
				const preprocessed = normalizeNewCall(rawScript)
				const grammar = new Grammar()
				const transpiledJs = grammar.vbsToJs(preprocessed)

				expect(typeof transpiledJs).toBe('string')
				// Validate V8 engine compilation
				expect(() => new vm.Script(transpiledJs)).not.toThrow()
			}
		})
	})

	it('executes full verifyVpinballCompat regression suite across all fixtures', async () => {
		const result = await verifyVpinballCompat({ all: true, auditOnly: true })
		expect(result).toBe(true)
	})

	it('validates native VPinball parity if native binary is present', async () => {
		const discovery = discoverVpinball()
		if (discovery.binPath && discovery.binDir) {
			const result = await verifyVpinballCompat({ all: true })
			expect(result).toBe(true)
		} else {
			expect(discovery.binPath).toBeNull()
		}
	})

	const walkingDeadPath = '/home/qinghao1/Downloads/walking_dead.vpx'
	const hasWalkingDead = fs.existsSync(walkingDeadPath)

	it.skipIf(!hasWalkingDead)(
		'validates full 213MB production table (walking_dead.vpx) components, physics, and transpiler',
		async () => {
			const reader = new NodeBinaryReader(walkingDeadPath)
			const table = await Table.load(reader, { loadTableScript: true })
			expect(table).toBeDefined()

			const audit = auditTableStructure(table)
			expect(audit.itemCounts.totalItems).toBeGreaterThan(1000)
			expect(audit.itemCounts.flippers).toBe(6)
			expect(audit.itemCounts.bumpers).toBe(3)
			expect(audit.itemCounts.rubbers).toBe(3)
			expect(audit.itemCounts.lights).toBeGreaterThan(150)
			expect(audit.itemCounts.primitives).toBeGreaterThan(600)
			expect(audit.itemCounts.textures).toBeGreaterThan(100)
			expect(audit.physics.allPhysicsValid).toBe(true)
			expect(audit.physics.issues).toHaveLength(0)

			const rawScript = (table as unknown as { tableScript?: string }).tableScript ?? ''
			expect(rawScript.length).toBeGreaterThan(150_000)

			const preprocessed = normalizeNewCall(rawScript)
			const grammar = new Grammar()
			const transpiledJs = grammar.vbsToJs(preprocessed)
			expect(transpiledJs.length).toBeGreaterThan(150_000)
			expect(() => new vm.Script(transpiledJs)).not.toThrow()
		},
	)
})
