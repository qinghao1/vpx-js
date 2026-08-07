// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Vertex2D, Vertex3D } from './math.js'

/** 2D vertex with editor flags. */
export class RenderVertex extends Vertex2D {
	fSmooth = false
	fSlingshot = false
	fControlPoint = false
}

/** 3D vertex with editor flags. */
export class RenderVertex3D extends Vertex3D {
	fSmooth = false
	fSlingshot = false
	fControlPoint = false
}
