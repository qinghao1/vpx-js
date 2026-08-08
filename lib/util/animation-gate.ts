// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export const ANIM_SETTLE_MS = 80
export const ANIM_POLL_MS = 16

type GateState = {
	animating: boolean
	promise: Promise<void> | null
	resolve: (() => void) | null
}

function getState(): GateState {
	const g = globalThis as unknown as { __vpxAnimGate?: GateState }
	if (!g.__vpxAnimGate) g.__vpxAnimGate = { animating: false, promise: null, resolve: null }
	return g.__vpxAnimGate
}

export function isAnimating(): boolean {
	return getState().animating
}

export function beginAnimation(): void {
	const s = getState()
	if (s.resolve) {
		try {
			s.resolve()
		} catch {}
	}
	s.animating = true
	s.promise = new Promise<void>(r => {
		s.resolve = r
	})
}

export function endAnimation(): void {
	const s = getState()
	s.animating = false
	const r = s.resolve
	s.resolve = null
	s.promise = null
	try {
		r?.()
	} catch {}
}

export async function waitIfAnimating(): Promise<void> {
	const s = getState()
	if (s.promise) {
		try {
			await s.promise
		} catch {}
		return
	}
	if (s.animating) {
		await new Promise<void>(r => {
			const check = () => {
				if (!getState().animating) r()
				else setTimeout(check, ANIM_POLL_MS)
			}
			setTimeout(check, ANIM_POLL_MS)
		})
	}
}

export async function yieldToMain(): Promise<void> {
	await waitIfAnimating()
	const g = globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }
	if (typeof requestAnimationFrame === 'function') {
		await new Promise<void>(r => requestAnimationFrame(() => r()))
		if (g.scheduler?.yield) await g.scheduler.yield()
		else await new Promise<void>(rr => setTimeout(rr, 0))
	} else if (g.scheduler?.yield) {
		await g.scheduler.yield()
	} else {
		await new Promise<void>(r => setTimeout(r, 0))
	}
}
