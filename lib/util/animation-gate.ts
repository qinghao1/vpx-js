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
		if (this.promise) await this.promise
	}

	async yieldToMain(): Promise<void> {
		await this.waitIfAnimating()
		if (typeof requestAnimationFrame === 'function') await new Promise<void>(r => requestAnimationFrame(() => r()))
		const g = globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }
		if (g.scheduler?.yield) await g.scheduler.yield()
		else await new Promise<void>(r => setTimeout(r, 0))
	}
}

export const animationGate = new AnimationGate()
