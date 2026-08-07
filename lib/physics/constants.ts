// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export const PHYSICS_STEPTIME = 1000
export const PHYSICS_STEPTIME_S = PHYSICS_STEPTIME * 1e-6
export const DEFAULT_STEPTIME = 10000
export const DEFAULT_STEPTIME_S = 0.01
export const PHYS_FACTOR = PHYSICS_STEPTIME_S / DEFAULT_STEPTIME_S

export const DEFAULT_TABLE_GRAVITY = 0.97
export const DEFAULT_TABLE_CONTACTFRICTION = 0.075
export const DEFAULT_TABLE_SCATTERANGLE = 0.5
export const DEFAULT_TABLE_ELASTICITY = 0.25
export const DEFAULT_TABLE_ELASTICITY_FALLOFF = 0
export const DEFAULT_TABLE_PFSCATTERANGLE = 0
export const DEFAULT_TABLE_MIN_SLOPE = 6.0
export const DEFAULT_TABLE_MAX_SLOPE = 6.0

export const HIT_SHAPE_DETAIL_LEVEL = 7.0
export const MAX_REELS = 32

/** VP units: 1U = 0.53975mm, 1T = 10ms, Earth g ≈ 1.81751 U/T². */
export const GRAVITYCONST = 1.81751

export const C_PRECISION = 0.01
export const C_TOL_ENDPNTS = 0.0
export const C_TOL_RADIUS = 0.005
export const PHYS_SKIN = 25.0
export const PHYS_TOUCH = 0.05
export const C_LOWNORMVEL = 0.0001
export const C_CONTACTVEL = 0.099

export const C_EMBEDVELLIMIT = 5
export const C_EMBEDSHOT_PLANE = 0
export const C_EMBEDDED = 0.0
export const C_EMBEDSHOT = 0.05
export const C_DISP_GAIN = 0.9875
export const C_DISP_LIMIT = 5.0
export const C_BALL_SPIN_HACK = 0

export const STATICTIME = 0.005
export const STATICCNTS = 10

export const C_INTERATIONS = 20

export const VELOCITY_EPSILON = 0.05

export const JOYRANGEMN = -65536
export const JOYRANGEMX = 65536
