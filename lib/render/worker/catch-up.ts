// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Worker catch-up for script-settled pre-attach states. The worker boots
// from authored table data, but Table1_Init repaints flasher/primitive state
// (InitVLM GI colors, init visibility) before the bridge attaches, and the
// init diff is consumed main-side only. Anything live that still differs from
// authored is re-emitted every frame until it converges, so a late or stalled
// worker settles on script values instead of authored defaults. Only
// data-backed numeric/bool fields ride: runtime flags have no authored
// counterpart to converge to, and strings have no codec rows.

const CATCH_UP_FIELDS: Record<string, string[]> = {
	flashers: ['color', 'alpha', 'rotX', 'rotY', 'rotZ', 'height', 'isVisible'],
	primitives: ['color', 'alpha', 'isVisible'],
}

interface StatefulItem {
	getState?: () => Record<string, unknown>
	data?: Record<string, unknown>
}

export function collectCatchUp(
	table: { flashers?: Record<string, StatefulItem>; primitives?: Record<string, StatefulItem> },
	overridden: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
	const out: Record<string, Record<string, unknown>> = {}
	for (const [coll, fields] of Object.entries(CATCH_UP_FIELDS)) {
		const items = table[coll as 'flashers'] ?? {}
		for (const [name, item] of Object.entries(items)) {
			if (name in overridden) continue
			const st = item?.getState?.()
			const data = item?.data ?? {}
			if (!st) continue
			const row: Record<string, unknown> = {}
			for (const k of fields) {
				const v = st[k]
				const a = data[k]
				if (typeof v === 'number' && typeof a === 'number') {
					if (v !== a) row[k] = v
				} else if (typeof v === 'boolean' && typeof a === 'boolean') {
					if (v !== a) row[k] = v
				}
			}
			if (Object.keys(row).length > 0) out[name] = row
		}
	}
	return out
}
