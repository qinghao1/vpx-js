// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { IEmulator } from '../game/iemulator.js'
import { logger } from '../util/logger.js'

/** Caches emu calls while initializing — sync VPX vs async emu. */
export class EmulatorMessageQueue {
	private readonly queue: QueueItem[] = []
	private cleared = false

	/** Queues a message; returns false if already replayed. */
	public addMessage(type: MessageType, value: number): boolean {
		if (this.cleared) {
			logger().warn('ADD STATE TO CLEARED CACHE! ENTRY WILL BE IGNORED!')
			return false
		}
		this.queue.push({ cacheType: type, value })
		return true
	}

	public replayMessages(emu: IEmulator): void {
		this.cleared = true
		logger().debug('Replaying %d messages to emu', this.queue.length)
		for (const { cacheType, value } of this.queue) {
			switch (cacheType) {
				case MessageType.SetSwitchInput:
					emu.setSwitchInput(value, true)
					break
				case MessageType.ClearSwitchInput:
					emu.setSwitchInput(value, false)
					break
				case MessageType.ToggleSwitchInput:
					emu.setSwitchInput(value)
					break
				case MessageType.CabinetInput:
					emu.setCabinetInput(value)
					break
				case MessageType.ExecuteTicks:
					emu.emuSimulateCycle(value)
					break
				case MessageType.SetDipByte:
					emu.setDipSwitchByte(value)
					break
				default:
					logger().warn('UNKNOWN CACHE TYPE', cacheType)
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
