// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { EmulatorState } from '../emu/emulator-state.js'
import type { Vertex2D } from '../math/vector.js'

/**
 * Fixed emu-sync quantum, ms. Mirrors PlayerPhysics' EMU_SYNC_MS: the loop
 * accumulates ~1 ms per 1 kHz iteration and flushes whole quanta, never tails.
 */
export const EMU_QUANTUM_MS = 10

/** Marker exposing the batcher behind a quantum-synced proxy (avoids double-wrapping on controller reload). */
const kQuantumSync = Symbol('vpxjs.quantumEmuSync')

/**
 * Batches per-iteration emu flushes into at most one whole-quantum wasm
 * round-trip per tick, carrying sub-quantum remainders forward.
 *
 * PlayerPhysics flushes its accumulator mid-loop and again for the tail, so a
 * 60 Hz tick crosses wasm twice (10 ms plus a <10 ms fragment, alternating
 * 1-vs-2 under jitter). The proxy below accumulates instead; Player ends each
 * tick with {@link QuantumEmuSync.flushTick}, which forwards the largest
 * whole-quantum multiple in a single call. Totals are conserved — remainders
 * are carried, never dropped — so emu-side state matches the unbatched cadence.
 *
 * A Proxy, not a delegating class, so `instanceof` against the real adapter
 * keeps working for controller-reload reuse checks; every member except
 * emuSimulateCycle is bound straight to the target.
 */
export class QuantumEmuSync {
	private pendingMs = 0
	private cachedProxy?: IEmulator

	private constructor(private readonly target: IEmulator) {}

	/** Wraps emu unless it already is a quantum-synced proxy (re-setting the same emu must not nest batchers). */
	public static wrap(emu: IEmulator): QuantumEmuSync {
		const existing = (emu as unknown as Record<symbol, unknown>)[kQuantumSync]
		if (existing instanceof QuantumEmuSync) return existing
		return new QuantumEmuSync(emu)
	}

	/** Proxy to hand to the physics loop: accumulates time, forwards everything else to the target. */
	public get proxy(): IEmulator {
		if (!this.cachedProxy) {
			const sync = this
			this.cachedProxy = new Proxy(this.target, {
				get(target, prop) {
					if (prop === kQuantumSync) return sync
					if (prop === 'emuSimulateCycle') return (ms: number) => sync.accumulate(ms)
					const value = Reflect.get(target, prop, target)
					// A class is not an instance method: binding it renames it
					// to "bound ..." and breaks construct identity checks.
					if (typeof value === 'function' && prop !== 'constructor') return value.bind(target)
					return value
				},
			})
		}
		return this.cachedProxy
	}

	/** Accumulates ms instead of crossing wasm; returns ms accounted, mirroring the adapters. */
	public accumulate(ms: number): number {
		if (!Number.isFinite(ms) || ms <= 0) return ms
		this.pendingMs += ms
		return ms
	}

	/**
	 * Ends a tick: forwards the largest whole-quantum multiple in one call,
	 * carrying the remainder. Returns ms forwarded (0 while below a quantum).
	 * Every Player.updatePhysics call must end here, or emu time stalls.
	 */
	public flushTick(): number {
		const quantum = Math.floor(this.pendingMs / EMU_QUANTUM_MS) * EMU_QUANTUM_MS
		if (quantum <= 0) return 0
		this.pendingMs -= quantum
		this.target.emuSimulateCycle(quantum)
		return quantum
	}
}

/**
 * Canonical emulator contract. Implemented by the wpc-emu and PinMAME
 * adapters in lib/emu/, consumed by the game layer (Player, physics).
 */
export interface IEmulator {
	readonly emulatorState: EmulatorState
	readonly isMock?: boolean

	isInitialized(): boolean
	getVersion(): string
	setPaused(v: boolean): void
	getPaused(): boolean
	/**
	 * Implementations delivering Float32Array PCM (PinMAME) hand out pooled
	 * borrows valid until the next drain — consumers must copy
	 * synchronously, not retain them.
	 */
	registerAudioConsumer(cb: (msg: unknown) => void): void

	emuSimulateCycle(ms: number): number
	getDmdFrame(): Uint8Array
	getDmdDimensions(): Vertex2D
	setCabinetInput(n: number): void
	setSwitchInput(n: number, enable?: boolean): boolean
	getSwitchInput(n: number): number
	getLampState(n: number): number
	getSolenoidState(n: number): number
	getGIState(n: number): number
	setFliptronicsInput(v: string, enable?: boolean): void
	getDipSwitchByte(bank?: number): number
	setDipSwitchByte(v: number, bank?: number): void
	getSolMask?(low: number): number
	setSolMask?(low: number, mask: number): void
	setTimeFence?(time: number): void
}
