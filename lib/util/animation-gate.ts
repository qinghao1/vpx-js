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
		this.resolve?.()
		this.animating = true
		this.promise = new Promise<void>(r => (this.resolve = r))
	}

	endAnimation(): void {
		this.animating = false
		const r = this.resolve
		this.resolve = null
		this.promise = null
		r?.()
	}

	async waitIfAnimating(): Promise<void> {
		if (!this.promise) return
		// Don't block texture/streaming workers indefinitely if animation
		// is stuck (e.g. cancelled transition). Race with a short timeout.
		const p = this.promise
		await Promise.race([p, new Promise<void>(r => setTimeout(r, 1200))])
	}

	async yieldToMain(): Promise<void> {
		await this.waitIfAnimating()
		// rAF throttles to ~1 fps in background/headless tabs (puppeteer) which
		// would stall texture streaming (101 textures → 100 s). Use scheduler
		// or timeout directly; rAF is only needed for smooth 60 fps animations.
		const g = globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }
		if (g.scheduler?.yield) await g.scheduler.yield()
		else await new Promise<void>(r => setTimeout(r, 0))
	}
}

export const animationGate = new AnimationGate()
