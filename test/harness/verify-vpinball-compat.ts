// CLI entry for script extraction, table structure & AST parity vs native VPinballX.
// Implementation split (S-M10): audit-table.ts (structure audit) + parity-script.ts (parity driver).
// Exit: 0 pass, 1 failure, 77 skipped (native vpinball not found and no --audit-only).
import { verifyVpinballCompat } from './parity-script.js'
import { tapSkip } from './tap.js'
import { discoverVpinball, parseVpxArgs } from './vpinball-resolver.js'

export { auditTableStructure, type TableStructureAudit } from './audit-table.js'
export { verifyVpinballCompat }

function parseArgs(rawArgs: string[]): {
	all: boolean
	vpx: string | null
	auditOnly: boolean
	updateSnapshots: boolean
	help: boolean
} {
	const parsed = parseVpxArgs(rawArgs)
	let all = false
	let vpx = parsed.vpx
	let auditOnly = false
	let updateSnapshots = false
	let help = false
	for (const token of parsed.rest) {
		if (token === '--all-fixtures' || token === '--all') all = true
		else if (token === '--audit' || token === '--audit-only') auditOnly = true
		else if (token === '--update-snapshots') updateSnapshots = true
		else if (token === '--help' || token === '-h') help = true
		else if (token.endsWith('.vpx') && !token.startsWith('-')) vpx = token
	}
	if (!vpx && !all && !help) all = true
	return { all, vpx, auditOnly, updateSnapshots, help }
}

function printHelp() {
	console.log(`verify-vpinball-compat — script extraction, table structure & AST parity vs native VPinballX

Usage:
  npx tsx test/harness/verify-vpinball-compat.ts --all-fixtures
  npx tsx test/harness/verify-vpinball-compat.ts --vpx=table-flipper
  npx tsx test/harness/verify-vpinball-compat.ts --vpx=/path/to/walking_dead.vpx
  npx tsx test/harness/verify-vpinball-compat.ts --audit-only

Steps per table (dual mode):
  1. Native: VPinballX -ExtractVBS <fixture.vpx> (headless, must exit 0)
  2. vpx-js: Table.load() structure & script extraction
  3. Byte-level + normalized script parity assert
  4. Grammar.vbsToJs AST transpile (error-free) + golden AST snapshot
  5. Table structure & physics constants audit (flippers, bumpers, rubbers, timers)
  6. Native: VPinballX -Audit <fixture.vpx> (headless consistency check)

Options:
  --all-fixtures, --all   Audit all 25 test fixtures
  --vpx=<name|path>       Target specific table fixture
  --audit, --audit-only   vpx-js-only pipeline (steps 2+4+5); runs without native
  --update-snapshots      (Re)bless golden AST snapshots instead of comparing
  --help, -h              Show this help

Exit codes: 0 pass, 1 failure, 77 skipped (native not found, needs --audit-only).
`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const raw = process.argv.slice(2)
	const { all, vpx, auditOnly, updateSnapshots, help } = parseArgs(raw)
	if (help) {
		printHelp()
		process.exit(0)
	}
	if (!auditOnly && !discoverVpinball().binPath) {
		tapSkip(1, 'vpinball-compat', 'native vpinball not found (run npm run vpinball:setup or pass --audit-only)')
		process.exit(77)
	}
	const ok = await verifyVpinballCompat({ vpx, all, auditOnly, updateSnapshots })
	process.exit(ok ? 0 : 1)
}
