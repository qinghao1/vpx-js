// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { downloadGameEntry } from '../../emu/rom-fetcher.js'
import { Emulator } from '../../emu/wpc-emu.js'
import type { Player } from '../../game/player.js'
import { logger } from '../../util/logger.js'
import type { VbsArray } from '../vbs-array.js'

/**
 * Implementation of the VISUAL PINMAME COM OBJECT PROPERTY/METHOD
 *
 * converted VBS will call this functions using bracket notation, like `Controller.Dip[0]` or `Controller.GameName`
 */
export class VpmController {
	private emulator: Emulator
	private gameName: string = ''
	private splashInfoLine: string = ''
	private readonly player: Player
	public readonly Dip: { [index: number]: number }
	public readonly Switch: { [index: number]: number }
	public readonly Lamp: { [index: number]: number }
	public readonly Solenoid: { [index: number]: number }
	public readonly GIString: { [index: number]: number }

	constructor(player: Player) {
		this.player = player
		this.emulator = new Emulator()

		this.Switch = this.createGetSetBooleanProxy(
			'SWITCH',
			(index) => this.emulator.getSwitchInput(index),
			(switchNr: number, value?: boolean) => {
				if (switchNr < 89) {
					return this.emulator.setSwitchInput(switchNr, value)
				}
				switch (switchNr) {
					case 112:
						this.emulator.setFliptronicsInput('F2', value)
						return true
					case 114:
						this.emulator.setFliptronicsInput('F4', value)
						return true
					case 116:
						this.emulator.setFliptronicsInput('F6', value)
						return true
					case 118:
						this.emulator.setFliptronicsInput('F8', value)
						return true
				}
				logger().error('INVALID_SWITCH_ID:', switchNr)
				return false
			},
		)

		this.Dip = this.createGetSetNumberProxy(
			'DIP',
			() => this.emulator.getDipSwitchByte(),
			(unusedDipIndex: number, value: number) => {
				this.emulator.setDipSwitchByte(value)
				return true
			},
		)
		this.Lamp = this.createGetSetNumberProxy('LAMP', (index) => this.emulator.getLampState(index), SET_NOP)
		this.Solenoid = this.createGetSetNumberProxy('SOLENOID', (index) => this.emulator.getSolenoidState(index), SET_NOP)
		this.GIString = this.createGetSetNumberProxy('GI', (index) => this.emulator.getGIState(index), SET_NOP)

		// those function get called by the vbs-helper.ts script (getOrCall). To make sure
		// their scope is correct, we bind them here!
		this.Run = this.Run.bind(this)
		this.Stop = this.Stop.bind(this)
	}

	// Control
	get GameName(): string {
		return this.gameName
	}
	/** Set GameName. */
	set GameName(gameName: string) {
		logger().debug('SET GAMENAME:', gameName)
		this.gameName = gameName
		// the VPX interface is sync while this call is async - download the game
		this._loadGame(this.gameName).catch((error) => {
			logger().error('DOWNLOAD_FAILED:', error.messages)
		})
	}

	private async _loadGame(gameName: string) {
		const answer = await downloadGameEntry(gameName)
		logger().info('LOADED', answer.wpcDbEntry)
		await this.emulator.loadGame(answer.wpcDbEntry, answer.romFile)
		this.player.setEmulator(this.emulator)
	}

	get Running(): boolean {
		return this.emulator.getPaused() && this.emulator.isInitialized()
	}
	get Pause(): boolean {
		return this.emulator.getPaused()
	}
	/** Set Pause. */
	set Pause(paused: boolean) {
		this.emulator.setPaused(paused)
	}
	/**
	 * Returns the version number of Visual PinMAME as an 8-digit string "vvmmbbrr":
	 * Example: A result of "00990201" signifies "Version 0.99 Beta 2 Rev A
	 *
	 */
	get Version(): string {
		return '00990201'
	}
	public Run() {
		logger().debug('RUN', this.gameName)
		if (this.gameName) {
			// TODO: fetch rom from vpdb.io here
			//return this.emulator.loadGame(this.gameName);
		}
	}
	public Stop(): void {
		logger().debug('STOP')
		//TODO unclear what to do
	}

	// GameSetting
	// NOTE: Dip - implemented using Proxy

	get HandleMechanics(): number {
		return 0
	}
	/** Set HandleMechanics. */
	set HandleMechanics(mechanicNr: number) {
		logger().debug('TODO HandleMechanics', mechanicNr)
	}
	/**
	 * Determine if game uses WPC Numbering of Switches and Lamps
	 * WPCNumbering = Column*10 + Row (11,12,13,14,15,16,17,18,21,22...)
	 * non WPCnumbering = 1,2,3,4,...
	 */
	get WPCNumbering(): number {
		logger().debug('WPCNumbering')
		return 1
	}
	get SampleRate(): number {
		logger().debug('SampleRate')
		return 22050
	}

	//Customization
	get SplashInfoLine(): string {
		return this.splashInfoLine
	}
	/** Set SplashInfoLine. */
	set SplashInfoLine(gameCredits) {
		this.splashInfoLine = gameCredits
	}
	get ShowFrame(): boolean {
		return false
	}
	/** Set ShowFrame. */
	set ShowFrame(showFrame: boolean) {
		logger().debug('ShowFrame', showFrame)
	}
	get DoubleSize(): boolean {
		return false
	}
	/** Set DoubleSize. */
	set DoubleSize(doubleSize: boolean) {
		logger().debug('DoubleSize', doubleSize)
	}
	get Antialias(): boolean {
		return false
	}
	/** Set Antialias. */
	set Antialias(enabled: boolean) {
		logger().debug('Antialias', enabled)
	}
	get BorderSizeX(): number {
		return 0
	}
	/** Set BorderSizeX. */
	set BorderSizeX(size: number) {
		logger().debug('BorderSizeX', size)
	}
	get BorderSizeY(): number {
		return 0
	}
	/** Set BorderSizeY. */
	set BorderSizeY(size: number) {
		logger().debug('BorderSizeY', size)
	}
	get WindowPosX(): number {
		return 0
	}
	/** Set WindowPosX. */
	set WindowPosX(position: number) {
		logger().debug('WindowPosX', position)
	}
	get WindowPosY(): number {
		return 0
	}
	/** Set WindowPosY. */
	set WindowPosY(position: number) {
		logger().debug('WindowPosY', position)
	}
	get LockDisplay(): boolean {
		return false
	}
	/** Set LockDisplay. */
	set LockDisplay(locked: boolean) {
		logger().debug('LockDisplay', locked)
	}
	get Hidden(): boolean {
		return false
	}
	/** Set Hidden. */
	set Hidden(hidden: boolean) {
		logger().debug('Hidden', hidden)
	}
	public SetDisplayPosition(x: number, y: number, hWnd: any): void {
		logger().debug('SetDisplayPosition', { x, y, hWnd })
	}
	public ShowOptsDialog(hWnd: any): void {
		logger().debug('ShowOptsDialog', hWnd)
	}
	public ShowPathesDialog(hWnd: any): void {
		logger().debug('ShowPathesDialog', hWnd)
	}
	public ShowAboutDialog(hWnd: any): void {
		logger().debug('ShowAboutDialog', hWnd)
	}
	/**
	 * Checks the rom set for the current game and displays the results.
	 * @param nShowOptions: 0 = Always displays the results, 1 = Only displays the results if there are errors found, 2 = Never displays the results
	 * @returns true if the roms are good.
	 */
	public CheckROMS(nShowOptions: number): boolean {
		logger().debug('CheckROMS', nShowOptions)
		return true
	}

	// AggregatePollingFunctions
	get ChangedLamps(): VbsArray<number[]> {
		const changedLamps: VbsArray<number[]> = this.emulator.emulatorState.getChangedLamps()
		return changedLamps
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

	// Debugging
	get ShowDMDOnly(): boolean {
		return false
	}
	/** Set ShowDMDOnly. */
	set ShowDMDOnly(show: boolean) {
		logger().debug('ShowDMDOnly', show)
	}
	get HandleKeyboard(): boolean {
		return false
	}
	/** Set HandleKeyboard. */
	set HandleKeyboard(handle: boolean) {
		logger().debug('HandleKeyboard', handle)
	}
	get ShowTitle(): boolean {
		return false
	}
	/** Set ShowTitle. */
	set ShowTitle(show: boolean) {
		logger().debug('ShowTitle', show)
	}

	private createGetSetNumberProxy(
		name: string,
		getFunction: (prop: number) => number,
		setFunction: (prop: number, value: number) => boolean,
	): { [index: number]: number } {
		const handler = {
			get: (target: { [index: number]: number }, prop: string | symbol, receiver?: any): number => {
				logger().debug('GET', name, { target, prop })
				const key = typeof prop === 'symbol' ? NaN : parseInt(prop as string, 10)
				return getFunction(key)
			},

			set: (target: { [index: number]: number }, prop: string | symbol, value: number): boolean => {
				logger().debug('SET', name, { target, prop, value })
				const key = typeof prop === 'symbol' ? NaN : parseInt(prop as string, 10)
				return setFunction(key, value)
			},
		}
		return new Proxy<{ [index: number]: number }>({}, handler)
	}

	private createGetSetBooleanProxy(
		name: string,
		getFunction: (switchNr: number) => number,
		setFunction: (switchNr: number, value?: boolean) => boolean,
	): { [index: number]: number } {
		const handler = {
			get: (target: { [index: number]: number }, switchNr: string | symbol, receiver?: any): number => {
				logger().debug('GET', name, { target, switchNr })
				const key = typeof switchNr === 'symbol' ? NaN : parseInt(switchNr as string, 10)
				return getFunction(key)
			},

			set: (target: { [index: number]: number }, switchNr: string | symbol, value?: number | boolean): boolean => {
				logger().debug('SET', name, { target, switchNr, value })
				const key = typeof switchNr === 'symbol' ? NaN : parseInt((switchNr as string).toString(), 10)
				if (value === 1 || value === true) {
					return setFunction(key, true)
				}
				if (value === 0 || value === false) {
					return setFunction(key, false)
				}
				return setFunction(key)
			},
		}
		return new Proxy<{ [index: number]: number }>({}, handler)
	}
}

function SET_NOP(index: number, value: number): boolean {
	logger().warn('UNEXPECTED SET CALL', { index, value })
	return true
}
