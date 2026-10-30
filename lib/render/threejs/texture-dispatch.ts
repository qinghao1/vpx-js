// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Shared decode dispatch: which worker decodes what. Playfield taxonomy
// lives in texture-tags.ts; everything about scheduling workers lives here
// so the browser image pool and the node HDR pool share one implementation.

/**
 * Per-worker in-flight decode counts behind one scheduling policy. Both
 * decode pools track the same thing (browser: array slots, node: worker
 * handles); the tracker owns the policy so the pools stay dumb callers.
 * Only the schedule changes with preference — decoded bytes are identical
 * either way: playfield bakes jump to the least-loaded worker so an 8K EXR
 * never waits behind two full decodes, everything else stays round-robin.
 */
export class WorkerLoadTracker {
	private readonly loads = new Map<object, number>()

	/**
	 * Least-busy slot for playfield work, round-robin slot otherwise.
	 * A playfield detour preserves the round-robin cursor (returns `next`
	 * unchanged) so regular work resumes where it left off.
	 */
	pick<W extends object>(workers: W[], preferLeastBusy: boolean, next: number): { worker: W; next: number } {
		if (!preferLeastBusy) {
			if (!workers.length) throw new Error('no decode worker')
			const slot = next % workers.length
			return { worker: workers[slot], next: slot + 1 }
		}
		let best = 0
		let bestLoad = Number.MAX_SAFE_INTEGER
		for (let slot = 0; slot < workers.length; slot++) {
			const known = this.loads.get(workers[slot])
			if (known === undefined) this.loads.set(workers[slot], 0)
			const load = known ?? 0
			if (load < bestLoad) {
				best = slot
				bestLoad = load
			}
		}
		if (!workers.length) throw new Error('no decode worker')
		return { worker: workers[best], next }
	}

	busy(worker: object): void {
		this.loads.set(worker, (this.loads.get(worker) ?? 0) + 1)
	}

	idle(worker: object): void {
		// Unknown workers idle to zero: only tracked workers can be busy.
		this.loads.set(worker, Math.max(0, (this.loads.get(worker) ?? 1) - 1))
	}

	/** Forgets a dead worker so its stale count can never bias dispatch. */
	drop(worker: object): void {
		this.loads.delete(worker)
	}

	/**
	 * Zeroes every count. Call when all pending work is rejected and dropped:
	 * no worker has anything in flight afterwards, so survivors must not keep
	 * a stale bias in least-busy dispatch.
	 */
	resetAll(): void {
		for (const key of this.loads.keys()) this.loads.set(key, 0)
	}
}
