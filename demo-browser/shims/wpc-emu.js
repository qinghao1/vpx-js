export const GamelistDB = {
	getByPinmameName: () => null,
	getByName: () => null,
	findByName: () => null,
}
export const WpcEmuApi = {
	getVersion: () => 'stub',
	initVMwithRom: async () => {
		throw new Error('wpc-emu stub — use PinMAME in browser')
	},
}
export const WpcEmuWebWorkerApi = {}
export class Emulator {
	async loadGame() {
		throw new Error('wpc-emu stub')
	}
	isInitialized() {
		return false
	}
	getVersion() {
		return 'stub'
	}
	setPaused() {}
	getPaused() {
		return false
	}
	registerAudioConsumer() {}
	emuSimulateCycle() {
		return 0
	}
	getDmdFrame() {
		return new Uint8Array()
	}
	getDmdDimensions() {
		return { x: 0, y: 0 }
	}
	getSwitchInput() {
		return 0
	}
	getLampState() {
		return 0
	}
	getSolenoidState() {
		return 0
	}
	getGIState() {
		return 0
	}
	setFliptronicsInput() {}
	getDipSwitchByte() {
		return 0
	}
	setDipSwitchByte() {}
	get emulatorState() {
		return {
			getChangedLamps: () => [],
			getChangedSolenoids: () => [],
			getChangedGI: () => [],
			getChangedLEDs: () => [],
			getDmdScreen: () => new Uint8Array(),
		}
	}
}
export default { GamelistDB, WpcEmuApi, WpcEmuWebWorkerApi, Emulator }
