#include <cmath>
#include <cstdint>
#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif

constexpr float C_CONTACTVEL = 0.099f;
constexpr float C_LOWNORMVEL = 0.0001f;
constexpr float PHYS_TOUCH   = 0.05f;

#define EXPORT __attribute__((visibility("default")))

struct Hit {
	float t = -1;
	int contact = 0;
	float nx = 0, ny = 0, nz = 0;
	float dist = 0, bnv = 0;
};

inline float pickTime(float t1, float t2) {
	return t1 * t2 < 0 ? std::fmax(t1, t2) : std::fmin(t1, t2);
}

inline Hit testPlane(float bx, float by, float bz, float vx, float vy, float vz, float r,
                     float nx, float ny, float nz, float d, float dTime) {
	Hit h;
	float bnv = nx * vx + ny * vy + nz * vz;
	if (bnv > C_CONTACTVEL) return h;
	float bnd = nx * bx + ny * by + nz * bz - r - d;
	if (bnd < r * -2) return h;
	if (std::fabs(bnv) <= C_CONTACTVEL) {
		if (std::fabs(bnd) > PHYS_TOUCH) return h;
		h.t = 0; h.contact = 1; h.nx = nx; h.ny = ny; h.nz = nz; h.dist = bnd; h.bnv = bnv;
		return h;
	}
	float t = bnd / -bnv;
	if (t < 0) t = 0;
	if (!std::isfinite(t) || t < 0 || t > dTime) return h;
	h.t = t; h.nx = nx; h.ny = ny; h.nz = nz; h.dist = bnd;
	return h;
}

inline Hit testCircle(float bx, float by, float bz, float vx, float vy, float vz, float br,
                      float cx, float cy, float cr, float zl, float zh, float dTime) {
	Hit h;
	float dx = bx - cx, dy = by - cy;
	float tr = cr + br;
	float sq = dx * dx + dy * dy, d = std::sqrt(sq);
	if (d <= 1e-6f) return h;
	float b = dx * vx + dy * vy, bnv = b / d;
	if (bnv > C_LOWNORMVEL) return h;
	float bnd = d - tr, a = vx * vx + vy * vy;
	int contact = 0; float t = 0;
	if (bnd < PHYS_TOUCH) {
		if (bnd < -br) return h;
		if (std::fabs(bnv) <= C_CONTACTVEL) contact = 1;
		else t = std::fmax(0, -bnd / bnv);
	} else {
		if (a < 1e-8f) return h;
		float disc = 4 * b * b - 4 * a * (sq - tr * tr);
		if (disc < 0) return h;
		float s = std::sqrt(disc), inv = -0.5f / a;
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv);
	}
	if (!std::isfinite(t) || t < 0 || t > dTime) return h;
	float hz = bz + vz * t;
	if (hz + br * 0.5f < zl || hz - br * 0.5f > zh) return h;
	float hx = bx + vx * t, hy = by + vy * t, s2 = (hx - cx) * (hx - cx) + (hy - cy) * (hy - cy);
	float nx, ny;
	if (s2 > 1e-8f) { float inv = 1 / std::sqrt(s2); nx = (hx - cx) * inv; ny = (hy - cy) * inv; }
	else { nx = 0; ny = 1; }
	h.t = t; h.contact = contact; h.nx = nx; h.ny = ny; h.nz = 0; h.dist = bnd; h.bnv = contact ? bnv : 0;
	return h;
}

inline Hit testLineZ(float bx, float by, float bz, float vx, float vy, float vz, float br,
                     float lx, float ly, float zl, float zh, float dTime) {
	Hit h;
	float dx = bx - lx, dy = by - ly, sq = dx * dx + dy * dy, d = std::sqrt(sq);
	if (d <= 1e-6f) return h;
	float b = dx * vx + dy * vy, bnv = b / d;
	if (bnv > C_CONTACTVEL) return h;
	float bnd = d - br, a = vx * vx + vy * vy;
	int contact = 0; float t = 0;
	if (bnd < PHYS_TOUCH) {
		if (std::fabs(bnv) <= C_CONTACTVEL) contact = 1;
		else t = -bnd / bnv;
	} else {
		if (a < 1e-8f) return h;
		float disc = 4 * b * b - 4 * a * (sq - br * br);
		if (disc < 0) return h;
		float s = std::sqrt(disc), inv = -0.5f / a;
		t = pickTime((2 * b + s) * inv, (2 * b - s) * inv);
	}
	if (!std::isfinite(t) || t < 0 || t > dTime) return h;
	float hz = bz + vz * t;
	if (hz < zl || hz > zh) return h;
	float hx = bx + vx * t, hy = by + vy * t, nx = hx - lx, ny = hy - ly, len = std::sqrt(nx * nx + ny * ny);
	if (len > 1e-8f) { nx /= len; ny /= len; } else { nx = 0; ny = 1; }
	h.t = t; h.contact = contact; h.nx = nx; h.ny = ny; h.nz = 0; h.dist = bnd; h.bnv = contact ? bnv : 0;
	return h;
}

extern "C" {

EXPORT float elasticityWithFalloff(float e, float f, float v) {
	return f > 0 ? e / (1 + f * std::fabs(v) * (1.f / 18.53f)) : e;
}

EXPORT int solveQuadratic(float a, float b, float c, float* t1, float* t2) {
	float d = b * b - 4 * a * c;
	if (d < 0) return 0;
	float s = std::sqrt(d), inv = -0.5f / a;
	*t1 = (b + s) * inv;
	*t2 = (b - s) * inv;
	return 1;
}

EXPORT float hitTestPlane(float bx, float by, float bz, float vx, float vy, float vz, float r,
                          float nx, float ny, float nz, float d, float dTime, int enabled,
                          float* ox, float* oy, float* oz, float* oDist, int* oContact, float* oBnv) {
	if (!enabled) return -1;
	Hit h = testPlane(bx, by, bz, vx, vy, vz, r, nx, ny, nz, d, dTime);
	if (h.t < -0.5f) return -1;
	*ox = h.nx; *oy = h.ny; *oz = h.nz; *oDist = h.dist; *oContact = h.contact; if (h.contact) *oBnv = h.bnv;
	return h.t;
}

EXPORT float hitTestCircle(float bx, float by, float bz, float vx, float vy, float vz, float br,
                           float cx, float cy, float cr, float zl, float zh, float dTime, int enabled,
                           float* ox, float* oy, float* oz, float* oDist, int* oContact, float* oBnv) {
	if (!enabled) return -1;
	Hit h = testCircle(bx, by, bz, vx, vy, vz, br, cx, cy, cr, zl, zh, dTime);
	if (h.t < -0.5f) return -1;
	*ox = h.nx; *oy = h.ny; *oz = h.nz; *oDist = h.dist; *oContact = h.contact; if (h.contact) *oBnv = h.bnv;
	return h.t;
}

EXPORT float hitTestLineZ(float bx, float by, float bz, float vx, float vy, float vz, float br,
                          float lx, float ly, float zl, float zh, float dTime, int enabled,
                          float* ox, float* oy, float* oz, float* oDist, int* oContact, float* oBnv) {
	if (!enabled) return -1;
	Hit h = testLineZ(bx, by, bz, vx, vy, vz, br, lx, ly, zl, zh, dTime);
	if (h.t < -0.5f) return -1;
	*ox = h.nx; *oy = h.ny; *oz = h.nz; *oDist = h.dist; *oContact = h.contact; if (h.contact) *oBnv = h.bnv;
	return h.t;
}

EXPORT float collide3DWall(float vx, float vy, float vz, float nx, float ny, float nz,
                           float e, float f, float, float* ox, float* oy, float* oz) {
	float dot = vx * nx + vy * ny + vz * nz;
	if (dot >= -C_LOWNORMVEL) { *ox = vx; *oy = vy; *oz = vz; return dot; }
	float ef = f > 0 ? e / (1 + f * std::fabs(dot) * (1.f / 18.53f)) : e;
	dot *= -(1 + ef);
	*ox = vx + dot * nx; *oy = vy + dot * ny; *oz = vz + dot * nz;
	return dot;
}

static inline uint32_t lcg(uint32_t &s) { return s = s * 1664525u + 1013904223u; }
static inline float frnd(uint32_t &s, float a, float b) {
	return a + (b - a) * (lcg(s) & 0xFFFFFF) / float(0xFFFFFF);
}

EXPORT void batchElasticityWithFalloff(int n, float* e, float* f, float* v, float* o) {
#ifdef __wasm_simd128__
	const v128_t k = wasm_f32x4_splat(1.f / 18.53f);
	const v128_t one = wasm_f32x4_splat(1.f);
	const v128_t zero = wasm_f32x4_splat(0.f);
	int i = 0;
	for (; i + 4 <= n; i += 4) {
		v128_t ve = wasm_v128_load(e + i);
		v128_t vf = wasm_v128_load(f + i);
		v128_t vv = wasm_v128_load(v + i);
		v128_t denom = wasm_f32x4_add(one, wasm_f32x4_mul(wasm_f32x4_mul(vf, wasm_f32x4_abs(vv)), k));
		v128_t div = wasm_f32x4_div(ve, denom);
		wasm_v128_store(o + i, wasm_v128_bitselect(div, ve, wasm_f32x4_gt(vf, zero)));
	}
	for (; i < n; i++) o[i] = f[i] > 0 ? e[i] / (1 + f[i] * std::fabs(v[i]) * (1.f / 18.53f)) : e[i];
#else
	for (int i = 0; i < n; i++) o[i] = f[i] > 0 ? e[i] / (1 + f[i] * std::fabs(v[i]) * (1.f / 18.53f)) : e[i];
#endif
}

EXPORT void batchHitTestCircle(int n, float bx, float by, float bz, float vx, float vy, float vz, float br,
                               float* cx, float* cy, float* cr, float* zl, float* zh, float dTime,
                               float* outT, int* outContact, float* outNx, float* outNy, float* outNz, float* outDist, float* outBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testCircle(bx, by, bz, vx, vy, vz, br, cx[i], cy[i], cr[i], zl[i], zh[i], dTime);
		outT[i] = h.t; outContact[i] = h.contact; outNx[i] = h.nx; outNy[i] = h.ny; outNz[i] = h.nz; outDist[i] = h.dist; outBnv[i] = h.bnv;
	}
}

EXPORT void batchHitTestPlane(int n, float bx, float by, float bz, float vx, float vy, float vz, float r,
                              float* nx, float* ny, float* nz, float* d, float dTime,
                              float* outT, int* outContact, float* outNx, float* outNy, float* outNz, float* outDist, float* outBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testPlane(bx, by, bz, vx, vy, vz, r, nx[i], ny[i], nz[i], d[i], dTime);
		outT[i] = h.t; outContact[i] = h.contact; outNx[i] = h.nx; outNy[i] = h.ny; outNz[i] = h.nz; outDist[i] = h.dist; outBnv[i] = h.bnv;
	}
}

EXPORT void batchHitTestLineZ(int n, float bx, float by, float bz, float vx, float vy, float vz, float br,
                              float* lx, float* ly, float* zl, float* zh, float dTime,
                              float* outT, int* outContact, float* outNx, float* outNy, float* outNz, float* outDist, float* outBnv) {
	for (int i = 0; i < n; i++) {
		Hit h = testLineZ(bx, by, bz, vx, vy, vz, br, lx[i], ly[i], zl[i], zh[i], dTime);
		outT[i] = h.t; outContact[i] = h.contact; outNx[i] = h.nx; outNy[i] = h.ny; outNz[i] = h.nz; outDist[i] = h.dist; outBnv[i] = h.bnv;
	}
}

EXPORT float benchElasticityWithFalloff(int n, uint32_t seed) {
	float s = 0; uint32_t c = seed;
	for (int i = 0; i < n; i++) { float e = frnd(c, 0.1f, 1), f = frnd(c, 0, 1.5f), v = frnd(c, -50, 50); s += elasticityWithFalloff(e, f, v); }
	return s;
}
EXPORT float benchHitTestCircle(int n, uint32_t seed) {
	float s = 0; uint32_t c = seed;
	for (int i = 0; i < n; i++) {
		float bx = frnd(c, -100, 100), by = frnd(c, -100, 100), bz = frnd(c, 10, 90);
		float vx = frnd(c, -300, 300), vy = frnd(c, -300, 300), vz = frnd(c, -50, 50);
		Hit h = testCircle(bx, by, bz, vx, vy, vz, 25, 0, 0, 30, 0, 100, 0.3f);
		if (h.t >= 0) s += h.t;
	}
	return s + (c & 1) * 1e-6f;
}
EXPORT float benchHitTestPlane(int n, uint32_t seed) {
	float s = 0; uint32_t c = seed;
	for (int i = 0; i < n; i++) {
		float bx = frnd(c, -500, 500), by = frnd(c, -500, 500), bz = frnd(c, 0, 200);
		float vx = frnd(c, -200, 200), vy = frnd(c, -200, 200), vz = frnd(c, -100, 100);
		Hit h = testPlane(bx, by, bz, vx, vy, vz, 25, 0, 0, 1, 0, 0.5f);
		if (h.t >= 0) s += h.t;
	}
	return s + (c & 1) * 1e-6f;
}

} // extern "C"
