// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/** Hit object type discriminator. */
export enum CollisionType {
	Null = 0,
	Point,
	LineSeg,
	LineSegSlingshot,
	Joint,
	Circle,
	Flipper,
	Plunger,
	Spinner,
	Ball,
	Poly,
	Triangle,
	Plane,
	Line,
	Gate,
	Textbox,
	DispReel,
	LightSeq,
	Primitive,
	HitTarget,
	Trigger,
	Kicker,
}
