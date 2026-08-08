// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { GamelistDB } from 'wpc-emu'
import { PinMameEmulator } from '../../emu/pinmame/pinmame-emu.js'
import { downloadGameEntry } from '../../emu/rom-fetcher.js'
import { Emulator } from '../../emu/wpc-emu.js'
import type { IEmulator } from '../../game/iemulator.js'
import type { Player } from '../../game/player.js'
import { logger } from '../../util/logger.js'
import type { VbsArray } from '../vbs-array.js'

const FLIPTRONICS: Record<number, string> = { 112: 'F2', 114: 'F4', 116: 'F6', 118: 'F8' }

export class VpmController {
	private emulator: IEmulator = new Emulator()
	private gameName = ''
	private splashInfoLine = ''
	private loadPromise: Promise<void> | null = null
	private readonly gameSettings = new Map<string, { Settings: { Value: Record<string, unknown> } }>()

	readonly Switch: Record<number, number>
	readonly Dip: Record<number, number>
	readonly Lamp: Record<number, number>
	readonly Solenoid: Record<number, number>
	readonly GIString: Record<number, number>
	readonly Games: any

	constructor(private readonly player: Player) {
		this.Switch = this.boolProxy(
			(i) => this.emulator.getSwitchInput(i),
			(n, v) => {
				if (n < 89) return this.emulator.setSwitchInput(n, v)
				const key = FLIPTRONICS[n]
				if (key) return this.emulator.setFliptronicsInput(key, v), true
				logger().error('INVALID_SWITCH_ID:', n)
				return false
			},
		)
		this.Dip = this.numProxy(
			() => this.emulator.getDipSwitchByte(),
			(_, v) => (this.emulator.setDipSwitchByte(v), true),
		)
		this.Lamp = this.numProxy(
			(i) => this.emulator.getLampState(i),
			() => true,
		)
		this.Solenoid = this.numProxy(
			(i) => this.emulator.getSolenoidState(i),
			() => true,
		)
		this.GIString = this.numProxy(
			(i) => this.emulator.getGIState(i),
			() => true,
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
		this.Run = this.Run.bind(this)
		this.Stop = this.Stop.bind(this)
	}

	get GameName(): string {
		return this.gameName
	}
	set GameName(v: string) {
		this.gameName = v
		this.loadPromise = this._loadGame(v).catch((e) => logger().error('DOWNLOAD_FAILED:', e))
	}
	async whenReady(): Promise<void> {
		if (this.loadPromise) await this.loadPromise
	}

	private async _loadGame(name: string): Promise<void> {
		if (GamelistDB.getByPinmameName(name)) {
			const { wpcDbEntry, romFile } = await downloadGameEntry(name)
			await (this.emulator as Emulator).loadGame(wpcDbEntry, romFile)
			this.player.setEmulator(this.emulator)
			return
		}
		const emu = new PinMameEmulator()
		this.emulator = emu
		const rom = await this.fetchRom(name)
		await emu.loadGame(name, rom)
		this.player.setEmulator(emu)
	}

	private async fetchRom(name: string): Promise<Uint8Array> {
		for (const url of [`/pinmame/roms/${name}.zip`, `/roms/${name}.zip`]) {
			try {
				const r = await fetch(url)
				if (r.ok) return new Uint8Array(await r.arrayBuffer())
			} catch {}
		}
		logger().warn(`[pinmame] no ROM for ${name} — mock`)
		return new Uint8Array()
	}

	get Running(): boolean {
		return this.emulator.getPaused() && this.emulator.isInitialized()
	}
	get Pause(): boolean {
		return this.emulator.getPaused()
	}
	set Pause(v: boolean) {
		this.emulator.setPaused(v)
	}
	get Version(): string {
		return '00990201'
	}
	Run(): void {
		logger().debug('RUN', this.gameName)
	}
	Stop(): void {
		logger().debug('STOP')
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
	get ShowFrame(): boolean {
		return false
	}
	set ShowFrame(v: boolean) {
		this.stub('ShowFrame', v)
	}
	get DoubleSize(): boolean {
		return false
	}
	set DoubleSize(v: boolean) {
		this.stub('DoubleSize', v)
	}
	get Antialias(): boolean {
		return false
	}
	set Antialias(v: boolean) {
		this.stub('Antialias', v)
	}
	get BorderSizeX(): number {
		return 0
	}
	set BorderSizeX(v: number) {
		this.stub('BorderSizeX', v)
	}
	get BorderSizeY(): number {
		return 0
	}
	set BorderSizeY(v: number) {
		this.stub('BorderSizeY', v)
	}
	get WindowPosX(): number {
		return 0
	}
	set WindowPosX(v: number) {
		this.stub('WindowPosX', v)
	}
	get WindowPosY(): number {
		return 0
	}
	set WindowPosY(v: number) {
		this.stub('WindowPosY', v)
	}
	get LockDisplay(): boolean {
		return false
	}
	set LockDisplay(v: boolean) {
		this.stub('LockDisplay', v)
	}
	get Hidden(): boolean {
		return false
	}
	set Hidden(v: boolean) {
		this.stub('Hidden', v)
	}
	get ShowDMDOnly(): boolean {
		return false
	}
	set ShowDMDOnly(v: boolean) {
		this.stub('ShowDMDOnly', v)
	}
	get HandleKeyboard(): boolean {
		return false
	}
	set HandleKeyboard(v: boolean) {
		this.stub('HandleKeyboard', v)
	}
	get ShowTitle(): boolean {
		return false
	}
	set ShowTitle(v: boolean) {
		this.stub('ShowTitle', v)
	}

	SetDisplayPosition(x: number, y: number, hWnd: unknown): void {
		this.stub('SetDisplayPosition', { x, y, hWnd })
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
	get ChangedLEDs(): number[][] {
		return this.emulator.emulatorState.getChangedLEDs()
	}

	private stub(name: string, v?: unknown): void {
		logger().debug(name, v)
	}

	private numProxy(get: (n: number) => number, set: (n: number, v: number) => boolean): Record<number, number> {
		return new Proxy({} as Record<number, number>, {
			get: (_, p) => get(Number(p)),
			set: (_, p, v) => set(Number(p), v as number),
		})
	}
	private boolProxy(get: (n: number) => number, set: (n: number, v?: boolean) => boolean): Record<number, number> {
		return new Proxy({} as Record<number, number>, {
			get: (_, p) => get(Number(p)),
			set: (_, p, v) => {
				const n = Number(p)
				if (v === 1 || v === true) return set(n, true)
				if (v === 0 || v === false) return set(n, false)
				return set(n)
			},
		})
	}
}
