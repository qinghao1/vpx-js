// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Browser integration CLI — runs demo-browser/e2e/integration.mjs.
// Run: npx tsx test/harness/verify-browser.ts
import { tapComment, tapHeader, tapNotOk, tapOk, tapPlan, tapSkip } from './tap.js'
import { exitCodeToStatus, verifyBrowser } from './verify-all.js'

export { exitCodeToStatus, verifyBrowser }

/** Child exit convention (see verify-all.ts): 0 pass, 77 skipped, 1 failure. */
export function browserStatusToExitCode(status: 'pass' | 'fail' | 'skip'): number {
	return status === 'pass' ? 0 : status === 'skip' ? 77 : 1
}

type CheckStatus = 'pass' | 'fail' | 'skip'

if (import.meta.url === `file://${process.argv[1]}`) {
	tapHeader('browser e2e')
	const status: CheckStatus = await verifyBrowser()
	tapPlan(1)
	if (status === 'pass') tapOk(1, 'browser')
	else if (status === 'skip') tapSkip(1, 'browser', 'not run here')
	else tapNotOk(1, 'browser')
	tapComment(`Result: ${status.toUpperCase()}`)
	process.exit(browserStatusToExitCode(status))
}
