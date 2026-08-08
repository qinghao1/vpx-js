// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export const ANIM_SETTLE_MS = 80
export const ANIM_POLL_MS = 16

export class AnimationGate {
	private animating = false
	private promise: Promise<void> | null = null
	private resolve: (() => void) | null = null

	isAnimating(): boolean {
		return this.animating
	}

	beginAnimation(): void {
		if (this.resolve) {
			try {
				this.resolve()
			} catch {}
		}
		this.animating = true
		this.promise = new Promise<void>(r => {
			this.resolve = r
		})
	}

	endAnimation(): void {
		this.animating = false
		const r = this.resolve
		this.resolve = null
		this.promise = null
		try {
			r?.()
		} catch {}
	}

	async waitIfAnimating(): Promise<void> {
		if (this.promise) {
			try {
				await this.promise
			} catch {}
		}
	}

	async yieldToMain(): Promise<void> {
		await this.waitIfAnimating()
		const g = globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }
		if (typeof requestAnimationFrame === 'function') {
			await new Promise<void>(r => requestAnimationFrame(() => r()))
			if (g.scheduler?.yield) await g.scheduler.yield()
			else await new Promise<void>(r => setTimeout(r, 0))
		} else if (g.scheduler?.yield) {
			await g.scheduler.yield()
		} else {
			await new Promise<void>(r => setTimeout(r, 0))
		}
	}
}

function getSharedGate(): AnimationGate {
	// Vite serves lib/dist-esm and demo-browser as separate ESM graphs;
	// module-local singleton would split, so share via globalThis.
	const g = globalThis as unknown as { __vpxAnimGate?: AnimationGate }
	if (!g.__vpxAnimGate) g.__vpxAnimGate = new AnimationGate()
	return g.__vpxAnimGate
}

export const animationGate: AnimationGate = getSharedGate()

export function isAnimating(): boolean {
	return getSharedGate().isAnimating()
}

export function beginAnimation(): void {
	getSharedGate().beginAnimation()
}

export function endAnimation(): void {
	getSharedGate().endAnimation()
}

export function waitIfAnimating(): Promise<void> {
	return getSharedGate().waitIfAnimating()
}

export function yieldToMain(): Promise<void> {
	return getSharedGate().yieldToMain()
}
