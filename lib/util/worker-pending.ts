// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Shared pending-call bookkeeping for worker pools (decode workers, transpile
// workers): arm a timeout per call, settle exactly once, never fire late.

/** Pending worker call; `timer` is armed by withWorkerTimeout below. */
export interface WorkerPendingEntry<T = unknown> {
	resolve: (value: T) => void
	reject: (reason?: unknown) => void
	timer?: ReturnType<typeof setTimeout>
}

/**
 * Arms the timeout for a pending entry (durations stay pool-specific, and
 * `onTimeout` must not throw — a throw escapes the timer callback). Callers
 * clearTimeout via settleWorkerEntry on every settle path so a resolved
 * entry never fires late.
 */
export function withWorkerTimeout<T>(
	pending: Map<number, WorkerPendingEntry<T>>,
	id: number,
	ms: number,
	message: string,
	onTimeout?: () => void,
): void {
	const entry = pending.get(id)
	if (!entry || entry.timer) return
	entry.timer = setTimeout(() => {
		if (pending.has(id)) {
			pending.delete(id)
			try {
				onTimeout?.()
			} finally {
				entry.reject(new Error(message))
			}
		}
	}, ms)
	// Stays ref'd on purpose: pools unref their workers, so this armed
	// watchdog is the only handle keeping the loop alive while a decode is
	// in flight. Unref'd, the loop can drain mid-decode and the process
	// exits with the call still pending. Idle pools arm no timers, so they
	// still never hold the process open; settle clears the timer.
}

/** Clears the armed timeout (if any) and removes the entry; undefined when already settled. */
export function settleWorkerEntry<T>(
	pending: Map<number, WorkerPendingEntry<T>>,
	id: number,
): WorkerPendingEntry<T> | undefined {
	const entry = pending.get(id)
	if (!entry) return undefined
	if (entry.timer) clearTimeout(entry.timer)
	pending.delete(id)
	return entry
}
