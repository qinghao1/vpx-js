// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IEmulator } from '../game/iemulator.js'
import { logger } from '../util/logger.js'

/**
 * The VPX interface is sync, while our implementation is not when initializing.
 *
 * This Caching Service caches all calls to the EMU while its initializing and
 * allows to apply the changes once the emu is ready
 */
export class EmulatorMessageQueue {
	private readonly queue: QueueItem[] = []
	private clearedQueue: boolean = false

	/**
	 * adds new cache entry
	 * @returns true if entry was added to the cache, false if cache has already been consumed!
	 */
	public addMessage(cacheType: MessageType, value: number): boolean {
		if (this.clearedQueue) {
			logger().warn('ADD STATE TO CLEARED CACHE! ENTRY WILL BE IGNORED!')
			return false
		}
		this.queue.push({ cacheType, value })
		return true
	}

	public replayMessages(emulator: IEmulator): void {
		this.clearedQueue = true
		logger().debug('Replaying %d messages to emu', this.queue.length)
		for (const item of this.queue) {
			switch (item.cacheType) {
				case MessageType.SetSwitchInput:
					emulator.setSwitchInput(item.value, true)
					break
				case MessageType.ClearSwitchInput:
					emulator.setSwitchInput(item.value, false)
					break
				case MessageType.ToggleSwitchInput:
					emulator.setSwitchInput(item.value)
					break
				case MessageType.CabinetInput:
					emulator.setCabinetInput(item.value)
					break
				case MessageType.ExecuteTicks:
					emulator.emuSimulateCycle(item.value)
					break
				case MessageType.SetDipByte:
					emulator.setDipSwitchByte(item.value)
					break
				default:
					logger().warn('UNKNOWN CACHE TYPE', item.cacheType)
			}
		}
	}
}

export enum MessageType {
	SetSwitchInput = 1,
	ClearSwitchInput,
	ToggleSwitchInput,
	CabinetInput,
	ExecuteTicks,
	SetDipByte,
}

interface QueueItem {
	cacheType: MessageType
	value: number
}
