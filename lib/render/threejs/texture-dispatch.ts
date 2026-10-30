// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Shared decode dispatch (which worker decodes what) for the browser image
// pool and the node HDR pool.

/**
 * Per-worker in-flight decode counts behind one scheduling policy, so both
 * decode pools stay dumb callers. Only the schedule changes with
 * preference — decoded bytes are identical either way.
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
	 * Zeroes every count. Call only when all pending work is rejected and
	 * dropped — no worker has anything in flight afterwards.
	 */
	resetAll(): void {
		for (const key of this.loads.keys()) this.loads.set(key, 0)
	}
}
