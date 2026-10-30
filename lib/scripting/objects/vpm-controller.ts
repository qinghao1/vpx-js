// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import wpcEmuPkg from 'wpc-emu'

const GamelistDB = (wpcEmuPkg as any)?.GamelistDB ?? (wpcEmuPkg as any)?.default?.GamelistDB ?? wpcEmuPkg

import { PinMameEmulator } from '../../emu/pinmame/pinmame-emu.js'
import { downloadGameEntry } from '../../emu/rom-fetcher.js'
import { Emulator } from '../../emu/wpc-emu.js'
import type { IEmulator } from '../../game/iemulator.js'
import type { Player } from '../../game/player.js'
import { logger } from '../../util/logger.js'
import type { VbsArray } from '../vbs-array.js'

export class VpmController {
	private static readonly FLIPTRONICS: Record<number, string> = { 112: 'F2', 114: 'F4', 116: 'F6', 118: 'F8' }
	private static romBaseUrls: string[] = []

	/** Prepend custom ROM base URLs (e.g. a Vite `/@fs/...` dev prefix) to the browser ROM lookup. */
	static setRomBaseUrls(urls: string[]): void {
		VpmController.romBaseUrls = [...urls]
	}

	private emulator: IEmulator = new Emulator()
	private gameName = ''
	private splashInfoLine = ''
	private timeFence = 0
	private loadPromise: Promise<void> | null = null
	private readonly gameSettings = new Map<string, { Settings: { Value: Record<string, unknown> } }>()
	private readonly solMaskCache = new Map<number, number>()
	private readonly dipCache = new Map<number, number>()
	private readonly switchCache = new Map<number, boolean>()

	readonly Switch: Record<number, number>
	readonly Dip: Record<number, number>
	readonly SolMask: Record<number, number>
	readonly Lamp: Record<number, number>
	readonly Solenoid: Record<number, number>
	readonly GIString: Record<number, number>
	readonly Games: any
	readonly Mech: Record<number, number>
	readonly GetMech: Record<number, number>

	constructor(private readonly player: Player) {
		this.Switch = this.indexProxy(
			i => {
				// Upstream get_Switch returns VARIANT_BOOL (-1/0, never 1/0), and
				// table scripts compare against True (-1), so normalize both the
				// script-written cache and the raw emulator value here.
				const cached = this.switchCache.get(i)
				if (cached !== undefined) return cached ? -1 : 0
				return this.emulator.getSwitchInput(i) ? -1 : 0
			},
			(n, raw) => {
				const v = raw === 1 || raw === true ? true : raw === 0 || raw === false ? false : undefined
				if (v === true) this.switchCache.set(n, true)
				else if (v === false) this.switchCache.set(n, false)
				else if (v === undefined) this.switchCache.delete(n)
				const f = VpmController.FLIPTRONICS[n]
				if (f && this.emulator instanceof Emulator) {
					this.emulator.setFliptronicsInput(f, v)
					return true
				}
				return this.emulator.setSwitchInput(n, v)
			},
		)
		this.Dip = this.indexProxy(
			n => this.dipCache.get(n) ?? this.emulator.getDipSwitchByte(n),
			(n, v) => {
				const byte = (v as number) & 0xff
				this.dipCache.set(n, byte)
				this.emulator.setDipSwitchByte(byte, n)
				return true
			},
		)
		this.SolMask = this.indexProxy(
			i => this.solMaskCache.get(i) ?? this.emulator.getSolMask?.(i) ?? 0,
			(n, v) => {
				this.solMaskCache.set(n, v as number)
				this.emulator.setSolMask?.(n, v as number)
				return true
			},
		)
		this.Lamp = this.indexProxy(
			i => this.emulator.getLampState(i),
			() => true,
		)
		this.Solenoid = this.indexProxy(
			i => this.emulator.getSolenoidState(i),
			() => true,
		)
		this.GIString = this.indexProxy(
			i => this.emulator.getGIState(i),
			() => true,
		)
		this.Mech = this.indexProxy(
			() => 0,
			(n, v) => {
				this.stub('Mech', { n, v })
				return true
			},
		)
		this.GetMech = this.indexProxy(
			i => {
				this.stub('GetMech', i)
				return 0
			},
			() => false,
		)

		const getGame = (name: string) => {
			const key = String(name ?? '')
			let g = this.gameSettings.get(key)
			if (!g) {
				g = { Settings: { Value: {} as Record<string, unknown> } }
				this.gameSettings.set(key, g)
			}
			return g
		}
		const fn = ((name: string) => getGame(name)) as unknown as Record<string, unknown>
		this.Games = new Proxy(fn, {
			get: (_t, p) =>
				typeof p === 'string' && !['length', 'name', 'prototype'].includes(p)
					? ((fn as Record<string, unknown>)[p] ?? getGame(p))
					: undefined,
			apply: (_t, _this, a) => getGame(String(a[0])),
		})
	}

	get GameName(): string {
		return this.gameName
	}
	set GameName(v: string) {
		if (v === this.gameName) return
		this.gameName = v
		this.loadPromise = this._loadGame(v).catch(e => logger().error('DOWNLOAD_FAILED:', e))
	}
	async whenReady(): Promise<void> {
		if (this.loadPromise) await this.loadPromise
	}

	private async _loadGame(name: string): Promise<void> {
		if (GamelistDB.getByPinmameName(name)) {
			const { wpcDbEntry, romFile } = await downloadGameEntry(name)
			// Fresh wpc Emulator, symmetric with the PinMAME branch below —
			// this.emulator may hold a PinMAME instance from an earlier load.
			const emu = new Emulator()
			// No pre-loadGame replay: pre-init setter calls queue inside the
			// adapter and loadGame drains that queue, while the post-loadGame
			// replay below re-applies these same caches.
			this.emulator = emu
			await emu.loadGame(wpcDbEntry, romFile)
			this.player.setEmulator(emu)
			this.replay(emu as unknown as IEmulator)
			return
		}
		const existing = this.player.getPhysics().emu
		if (existing?.isInitialized() && existing instanceof PinMameEmulator) {
			this.replay(existing)
			this.emulator = existing
			return
		}
		const emu = new PinMameEmulator()
		this.replay(emu)
		this.emulator = emu
		const rom = await this.fetchRom(name)
		await emu.loadGame(name, rom)
		this.player.setEmulator(emu)
		this.replay(emu as unknown as IEmulator)
	}

	private replay(emu: IEmulator): void {
		for (const [k, v] of this.dipCache) emu.setDipSwitchByte(v & 0xff, k)
		for (const [k, v] of this.solMaskCache) emu.setSolMask?.(k, v)
		for (const [k, v] of this.switchCache) emu.setSwitchInput(k, v)
	}

	private async fetchBytes(url: string): Promise<Uint8Array | null> {
		try {
			const response = await fetch(url)
			if (response.ok) return new Uint8Array(await response.arrayBuffer())
		} catch {}
		return null
	}

	private async fetchRom(name: string): Promise<Uint8Array> {
		const pendingWindow = globalThis as unknown as {
			__pendingRom?: Uint8Array
			__pendingRomName?: string
			__pendingRomUrl?: string
		}
		if (
			pendingWindow.__pendingRom?.length &&
			(!pendingWindow.__pendingRomName || pendingWindow.__pendingRomName === name)
		) {
			return pendingWindow.__pendingRom
		}
		if (typeof process !== 'undefined' && process.versions?.node) {
			try {
				const fs = await import('node:fs')
				const path = await import('node:path')
				const os = await import('node:os')
				const candidates = [
					path.join(os.homedir(), '.pinmame', 'roms', `${name}.zip`),
					path.join(process.cwd(), 'test', 'fixtures', `${name}.zip`),
					path.join(os.homedir(), 'Downloads', `${name}.zip`),
					path.join(process.cwd(), 'pinmame', 'roms', `${name}.zip`),
				]
				for (const candidate of candidates) {
					if (fs.existsSync(candidate)) {
						return new Uint8Array(fs.readFileSync(candidate))
					}
				}
			} catch {}
		}
		const romParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('rom') : null
		if (romParam) {
			const bytes = await this.fetchBytes(romParam)
			if (bytes) return bytes
		}
		if (typeof location !== 'undefined') {
			const urls = [
				...VpmController.romBaseUrls.map(base => `${base}/${name}.zip`),
				`/pinmame/roms/${name}.zip`,
				`/roms/${name}.zip`,
			]
			for (const url of urls) {
				const bytes = await this.fetchBytes(url)
				if (bytes) return bytes
			}
		}
		logger().warn(`[pinmame] no ROM for ${name} — mock`)
		return new Uint8Array()
	}

	get ROMName(): string {
		return this.gameName
	}
	get Running(): boolean {
		return this.emulator.isInitialized() && !this.emulator.getPaused()
	}
	get Pause(): boolean {
		return this.emulator.getPaused()
	}
	set Pause(v: boolean) {
		this.emulator.setPaused(v)
	}
	get Version(): string {
		return '03070000'
	}
	get IsPlugin(): boolean {
		return false
	}
	get TimeFence(): number {
		return this.timeFence
	}
	set TimeFence(v: number) {
		this.timeFence = v
		;(this.emulator as unknown as { setTimeFence?: (t: number) => void }).setTimeFence?.(v)
	}
	Run(nMinVersion = 0, hParentWnd = 0): void {
		if (!this.gameName) {
			this.stub('Run', { nMinVersion, hParentWnd })
			return
		}
		if (!this.loadPromise)
			this.loadPromise = this._loadGame(this.gameName).catch(e => logger().error('DOWNLOAD_FAILED:', e))
		logger().debug('RUN', this.gameName)
	}
	Stop(): void {
		logger().debug('STOP')
		this.emulator.setPaused(true)
	}

	get WPCNumbering(): number {
		return 1
	}
	get SampleRate(): number {
		return 22050
	}
	get SplashInfoLine(): string {
		return this.splashInfoLine
	}
	set SplashInfoLine(v: string) {
		this.splashInfoLine = v
	}
	get HandleMechanics(): number {
		return 0
	}
	set HandleMechanics(v: number) {
		this.stub('HandleMechanics', v)
	}

	get NVRAM(): Uint8Array {
		return new Uint8Array()
	}
	get ChangedNVRAM(): number[][] {
		return []
	}
	get NewSoundCommands(): number[][] {
		return []
	}
	get RawDmdWidth(): number {
		try {
			return this.emulator.getDmdDimensions().x
		} catch {
			return 0
		}
	}
	get RawDmdHeight(): number {
		try {
			return this.emulator.getDmdDimensions().y
		} catch {
			return 0
		}
	}
	get RawDmdPixels(): Uint8Array {
		try {
			return this.emulator.getDmdFrame()
		} catch {
			// Standardize on a zeroed w*h buffer — never a 0-length one.
			return new Uint8Array(this.RawDmdWidth * this.RawDmdHeight)
		}
	}
	get RawDmdColoredPixels(): Uint32Array {
		return new Uint32Array(this.RawDmdPixels.length)
	}

	SetDisplayPosition(x: number, y: number, hWnd: unknown): void {
		this.stub('SetDisplayPosition', { x, y, hWnd })
	}
	B2SSetData(data: number, value: number): void {
		this.stub('B2SSetData', { data, value })
	}
	ShowOptsDialog(hWnd: unknown): void {
		this.stub('ShowOptsDialog', hWnd)
	}
	ShowPathesDialog(hWnd: unknown): void {
		this.stub('ShowPathesDialog', hWnd)
	}
	ShowAboutDialog(hWnd: unknown): void {
		this.stub('ShowAboutDialog', hWnd)
	}
	CheckROMS(n: number): boolean {
		this.stub('CheckROMS', n)
		return true
	}

	get ChangedLamps(): VbsArray<number[]> {
		return this.emulator.emulatorState.getChangedLamps()
	}
	get ChangedSolenoids(): number[][] {
		return this.emulator.emulatorState.getChangedSolenoids()
	}
	get ChangedGI(): number[][] {
		return this.emulator.emulatorState.getChangedGI()
	}
	get ChangedLEDs(): VbsArray<number[]> {
		return this.emulator.emulatorState.getChangedLEDs() as unknown as VbsArray<number[]>
	}

	private stub(name: string, v?: unknown): void {
		logger().debug(name, v)
	}

	private indexProxy(
		get: (index: number) => number,
		set: (index: number, value: unknown) => boolean,
	): Record<number, number> {
		const toIndex = (key: string | symbol): number | null => {
			if (typeof key === 'symbol') return null
			const index = Number(key)
			return Number.isNaN(index) ? null : index
		}
		return new Proxy({} as Record<number, number>, {
			get: (_target, key) => {
				const index = toIndex(key)
				return index === null ? (undefined as any) : get(index)
			},
			set: (_target, key, value) => {
				const index = toIndex(key)
				return index === null ? false : set(index, value)
			},
		})
	}

	static {
		const bools = [
			'ShowFrame',
			'DoubleSize',
			'Antialias',
			'LockDisplay',
			'Hidden',
			'ShowDMDOnly',
			'HandleKeyboard',
			'ShowTitle',
			'ShowPinDMD',
			'ShowWinDMD',
		] as const
		for (const k of bools)
			Object.defineProperty(VpmController.prototype, k, {
				get(this: VpmController) {
					return false
				},
				set(this: VpmController, v: any) {
					this.stub(k, v)
				},
				configurable: true,
				enumerable: true,
			})
		const ints = [
			'BorderSizeX',
			'BorderSizeY',
			'WindowPosX',
			'WindowPosY',
			'FastFrames',
			'CabinetMode',
			'SoundMode',
			'IgnoreRomCrc',
		] as const
		for (const k of ints)
			Object.defineProperty(VpmController.prototype, k, {
				get(this: VpmController) {
					return 0
				},
				set(this: VpmController, v: any) {
					this.stub(k, v)
				},
				configurable: true,
				enumerable: true,
			})
	}
}
