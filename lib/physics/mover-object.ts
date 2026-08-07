/**
 * Spinner, Gate, Flipper, Plunger and Ball
 */
import type { PlayerPhysics } from '../game/player-physics'

export interface MoverObject {
	updateDisplacements(dTime: number): void

	updateVelocities(physics: PlayerPhysics): void
}
