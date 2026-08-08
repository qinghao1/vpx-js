#include <cmath>
#include <cstdint>
#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif

extern "C" {

constexpr float C_CONTACTVEL = 0.099f;
constexpr float C_LOWNORMVEL = 0.0001f;
constexpr float PHYS_TOUCH   = 0.05f;

#define EXPORT __attribute__((visibility("default")))

EXPORT float elasticityWithFalloff(float e, float f, float v) {
    return f > 0 ? e / (1 + f * fabsf(v) * (1.f / 18.53f)) : e;
}

EXPORT int solveQuadratic(float a, float b, float c, float* t1, float* t2) {
    float d = b*b - 4*a*c;
    if (d < 0) return 0;
    float s = sqrtf(d), inv = -0.5f / a;
    *t1 = (b + s) * inv;
    *t2 = (b - s) * inv;
    return 1;
}

EXPORT float hitTestPlane(
    float bx, float by, float bz, float vx, float vy, float vz, float r,
    float nx, float ny, float nz, float d, float dTime, int enabled,
    float* ox, float* oy, float* oz, float* oDist, int* oContact, float* oBnv) {
    if (!enabled) return -1;
    float bnv = nx*vx + ny*vy + nz*vz;
    if (bnv > C_CONTACTVEL) return -1;
    float bnd = nx*bx + ny*by + nz*bz - r - d;
    if (bnd < r * -2) return -1;
    if (fabsf(bnv) <= C_CONTACTVEL) {
        if (fabsf(bnd) > PHYS_TOUCH) return -1;
        *ox = nx; *oy = ny; *oz = nz;
        *oDist = bnd; *oContact = 1; *oBnv = bnv;
        return 0;
    }
    float t = bnd / -bnv;
    if (t < 0) t = 0;
    if (!isfinite(t) || t < 0 || t > dTime) return -1;
    *ox = nx; *oy = ny; *oz = nz;
    *oDist = bnd; *oContact = 0;
    return t;
}

EXPORT float hitTestCircle(
    float bx, float by, float bz, float vx, float vy, float vz, float br,
    float cx, float cy, float cr, float zLow, float zHigh, float dTime, int enabled, int frozen,
    float* ox, float* oy, float* oz, float* oDist, int* oContact, float* oBnv) {
    if (!enabled || frozen) return -1;
    float dx = bx - cx, dy = by - cy;
    float dvx = vx, dvy = vy;
    float tr = cr + br;
    float sq = dx*dx + dy*dy, d = sqrtf(sq);
    if (d <= 1e-6f) return -1;
    float b = dx*dvx + dy*dvy, bnv = b / d;
    if (bnv > C_LOWNORMVEL) return -1;
    float bnd = d - tr, a = dvx*dvx + dvy*dvy, t = 0;
    int contact = 0;
    if (bnd < PHYS_TOUCH) {
        if (bnd < -br) return -1;
        if (fabsf(bnv) <= C_CONTACTVEL) contact = 1;
        else t = fmaxf(0, -bnd / bnv);
    } else {
        if (a < 1e-8f) return -1;
        float disc = 4*b*b - 4*a*(sq - tr*tr);
        if (disc < 0) return -1;
        float s = sqrtf(disc), inv = -0.5f / a;
        float t1 = (2*b + s) * inv, t2 = (2*b - s) * inv;
        t = (t1*t2 < 0) ? fmaxf(t1,t2) : fminf(t1,t2);
    }
    if (!isfinite(t) || t < 0 || t > dTime) return -1;
    float hz = bz + vz * t;
    if (hz + br*0.5f < zLow || hz - br*0.5f > zHigh) return -1;
    float hx = bx + vx * t, hy = by + vy * t, s2 = (hx-cx)*(hx-cx) + (hy-cy)*(hy-cy);
    if (s2 > 1e-8f) {
        float inv = 1 / sqrtf(s2);
        *ox = (hx-cx)*inv; *oy = (hy-cy)*inv; *oz = 0;
    } else {
        *ox = 0; *oy = 1; *oz = 0;
    }
    *oDist = bnd; *oContact = contact;
    if (contact) *oBnv = bnv;
    return t;
}

EXPORT float hitTestLineZ(
    float bx, float by, float bz, float vx, float vy, float vz, float br,
    float lx, float ly, float zLow, float zHigh, float dTime, int enabled,
    float* ox, float* oy, float* oz, float* oDist, int* oContact, float* oBnv) {
    if (!enabled) return -1;
    float dx = bx - lx, dy = by - ly, sq = dx*dx + dy*dy, d = sqrtf(sq);
    if (d <= 1e-6f) return -1;
    float b = dx*vx + dy*vy, bnv = b / d;
    if (bnv > C_CONTACTVEL) return -1;
    float bnd = d - br, a = vx*vx + vy*vy, t = 0;
    int contact = 0;
    if (bnd < PHYS_TOUCH) {
        if (fabsf(bnv) <= C_CONTACTVEL) contact = 1;
        else t = -bnd / bnv;
    } else {
        if (a < 1e-8f) return -1;
        float disc = 4*b*b - 4*a*(sq - br*br);
        if (disc < 0) return -1;
        float s = sqrtf(disc), inv = -0.5f / a;
        float t1 = (2*b + s)*inv, t2 = (2*b - s)*inv;
        t = (t1*t2 < 0) ? fmaxf(t1,t2) : fminf(t1,t2);
    }
    if (!isfinite(t) || t < 0 || t > dTime) return -1;
    float hz = bz + vz * t;
    if (hz < zLow || hz > zHigh) return -1;
    float hx = bx + vx*t, hy = by + vy*t, nx = hx-lx, ny = hy-ly, len = sqrtf(nx*nx+ny*ny);
    if (len > 1e-8f) { nx/=len; ny/=len; } else { nx=0; ny=1; }
    *ox = nx; *oy = ny; *oz = 0;
    *oDist = bnd; *oContact = contact;
    if (contact) *oBnv = bnv;
    return t;
}

EXPORT float collide3DWall(
    float vx, float vy, float vz, float nx, float ny, float nz,
    float e, float f, float, float* ox, float* oy, float* oz) {
    float dot = vx*nx + vy*ny + vz*nz;
    if (dot >= -C_LOWNORMVEL) {
        *ox = vx; *oy = vy; *oz = vz;
        return dot;
    }
    float ef = f > 0 ? e / (1 + f * fabsf(dot) * (1.f/18.53f)) : e;
    dot *= -(1 + ef);
    *ox = vx + dot*nx; *oy = vy + dot*ny; *oz = vz + dot*nz;
    return dot;
}

// Batch / bench helpers (keep loop inside WASM to avoid JS call overhead)

static inline uint32_t lcg(uint32_t &s) { return s = s*1664525u + 1013904223u; }
static inline float frnd(uint32_t &s, float a, float b) {
    return a + (b-a) * (lcg(s) & 0xFFFFFF) / (float)0xFFFFFF;
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
        v128_t av = wasm_f32x4_abs(vv);
        v128_t denom = wasm_f32x4_add(one, wasm_f32x4_mul(wasm_f32x4_mul(vf, av), k));
        v128_t div = wasm_f32x4_div(ve, denom);
        v128_t mask = wasm_f32x4_gt(vf, zero);
        wasm_v128_store(o + i, wasm_v128_bitselect(div, ve, mask));
    }
    for (; i < n; i++) o[i] = f[i] > 0 ? e[i] / (1 + f[i] * fabsf(v[i]) * (1.f / 18.53f)) : e[i];
#else
    for (int i = 0; i < n; i++) o[i] = f[i] > 0 ? e[i] / (1 + f[i] * fabsf(v[i]) * (1.f / 18.53f)) : e[i];
#endif
}

EXPORT void batchHitTestCircle(int n, float bx, float by, float bz, float vx, float vy, float vz, float br, float* cx, float* cy, float* cr, float* zl, float* zh, float dTime, float* outT, int* outContact, float* outNx, float* outNy, float* outNz, float* outDist, float* outBnv) {
    for (int i=0;i<n;i++) {
        float cxi=cx[i], cyi=cy[i], cri=cr[i], zli=zl[i], zhi=zh[i];
        float dx=bx-cxi, dy=by-cyi;
        float tr=cri+br;
        float sq=dx*dx+dy*dy, d=sqrtf(sq);
        if (d<=1e-6f) { outT[i]=-1; outContact[i]=0; continue; }
        float b=dx*vx+dy*vy, bnv=b/d;
        if (bnv>C_LOWNORMVEL) { outT[i]=-1; outContact[i]=0; continue; }
        float bnd=d-tr, a=vx*vx+vy*vy, t=0; int contact=0;
        if (bnd<PHYS_TOUCH) {
            if (bnd<-br) { outT[i]=-1; outContact[i]=0; continue; }
            if (fabsf(bnv)<=C_CONTACTVEL) contact=1; else t=fmaxf(0,-bnd/bnv);
        } else {
            if (a<1e-8f) { outT[i]=-1; outContact[i]=0; continue; }
            float disc=4*b*b-4*a*(sq-tr*tr);
            if (disc<0) { outT[i]=-1; outContact[i]=0; continue; }
            float s=sqrtf(disc), inv=-0.5f/a;
            float t1=(2*b+s)*inv, t2=(2*b-s)*inv;
            t=(t1*t2<0)?fmaxf(t1,t2):fminf(t1,t2);
        }
        if (!isfinite(t)||t<0||t>dTime) { outT[i]=-1; outContact[i]=0; continue; }
        float hz=bz+vz*t;
        if (hz+br*0.5f<zli||hz-br*0.5f>zhi) { outT[i]=-1; outContact[i]=0; continue; }
        float hx=bx+vx*t, hy=by+vy*t, s2=(hx-cxi)*(hx-cxi)+(hy-cyi)*(hy-cyi);
        float nx, ny;
        if (s2>1e-8f) { float inv=1/sqrtf(s2); nx=(hx-cxi)*inv; ny=(hy-cyi)*inv; } else { nx=0; ny=1; }
        outT[i]=t; outContact[i]=contact; outNx[i]=nx; outNy[i]=ny; outNz[i]=0; outDist[i]=bnd; outBnv[i]=contact?bnv:0;
    }
}
EXPORT void batchHitTestPlane(int n, float bx, float by, float bz, float vx, float vy, float vz, float r, float* nx, float* ny, float* nz, float* d, float dTime, float* outT, int* outContact, float* outNx, float* outNy, float* outNz, float* outDist, float* outBnv) {
    for (int i=0;i<n;i++) {
        float nxi=nx[i], nyi=ny[i], nzi=nz[i], di=d[i];
        float bnv=nxi*vx+nyi*vy+nzi*vz;
        if (bnv>C_CONTACTVEL) { outT[i]=-1; outContact[i]=0; continue; }
        float bnd=nxi*bx+nyi*by+nzi*bz-r-di;
        if (bnd<r*-2) { outT[i]=-1; outContact[i]=0; continue; }
        float t; int contact=0;
        if (fabsf(bnv)<=C_CONTACTVEL) { if (fabsf(bnd)>PHYS_TOUCH) { outT[i]=-1; outContact[i]=0; continue; } t=0; contact=1; }
        else { t=bnd/-bnv; if(t<0) t=0; if(!isfinite(t)||t<0||t>dTime) { outT[i]=-1; outContact[i]=0; continue; } }
        outT[i]=t; outContact[i]=contact; outNx[i]=nxi; outNy[i]=nyi; outNz[i]=nzi; outDist[i]=bnd; outBnv[i]=contact?bnv:0;
    }
}
EXPORT void batchHitTestLineZ(int n, float bx, float by, float bz, float vx, float vy, float vz, float br, float* lx, float* ly, float* zl, float* zh, float dTime, float* outT, int* outContact, float* outNx, float* outNy, float* outNz, float* outDist, float* outBnv) {
    for (int i=0;i<n;i++) {
        float lxi=lx[i], lyi=ly[i], zli=zl[i], zhi=zh[i];
        float dx=bx-lxi, dy=by-lyi, sq=dx*dx+dy*dy, d=sqrtf(sq);
        if (d<=1e-6f) { outT[i]=-1; outContact[i]=0; continue; }
        float b=dx*vx+dy*vy, bnv=b/d;
        if (bnv>C_CONTACTVEL) { outT[i]=-1; outContact[i]=0; continue; }
        float bnd=d-br, a=vx*vx+vy*vy, t=0; int contact=0;
        if (bnd<PHYS_TOUCH) { if(fabsf(bnv)<=C_CONTACTVEL) contact=1; else t=-bnd/bnv; }
        else {
            if(a<1e-8f) { outT[i]=-1; outContact[i]=0; continue; }
            float disc=4*b*b-4*a*(sq-br*br);
            if(disc<0) { outT[i]=-1; outContact[i]=0; continue; }
            float s=sqrtf(disc), inv=-0.5f/a;
            float t1=(2*b+s)*inv, t2=(2*b-s)*inv;
            t=(t1*t2<0)?fmaxf(t1,t2):fminf(t1,t2);
        }
        if(!isfinite(t)||t<0||t>dTime) { outT[i]=-1; outContact[i]=0; continue; }
        float hz=bz+vz*t;
        if(hz<zli||hz>zhi) { outT[i]=-1; outContact[i]=0; continue; }
        float hx=bx+vx*t, hy=by+vy*t, nx=hx-lxi, ny=hy-lyi, len=sqrtf(nx*nx+ny*ny);
        if(len>1e-8f){ nx/=len; ny/=len; } else { nx=0; ny=1; }
        outT[i]=t; outContact[i]=contact; outNx[i]=nx; outNy[i]=ny; outNz[i]=0; outDist[i]=bnd; outBnv[i]=contact?bnv:0;
    }
}

EXPORT float benchElasticityWithFalloff(int n, uint32_t seed) {
    float s=0; uint32_t c=seed;
    for (int i=0;i<n;i++) {
        float e=frnd(c,0.1f,1), f=frnd(c,0,1.5f), v=frnd(c,-50,50);
        s += f>0 ? e/(1+f*fabsf(v)*(1.f/18.53f)) : e;
    }
    return s;
}

EXPORT float benchHitTestCircle(int n, uint32_t seed) {
    float s=0; uint32_t c=seed;
    for (int i=0;i<n;i++) {
        float bx=frnd(c,-100,100), by=frnd(c,-100,100), bz=frnd(c,10,90);
        float vx=frnd(c,-300,300), vy=frnd(c,-300,300), vz=frnd(c,-50,50);
        float dx=bx, dy=by, dvx=vx, dvy=vy, tr=55, sq=dx*dx+dy*dy, d=sqrtf(sq);
        if (d<=1e-6f) continue;
        float b=dx*dvx+dy*dvy, bnv=b/d;
        if (bnv>0.0001f) continue;
        float bnd=d-tr, a=dvx*dvx+dvy*dvy, t=0;
        if (bnd<0.05f) {
            if (bnd<-25) continue;
            if (fabsf(bnv)>0.099f) t=fmaxf(0,-bnd/bnv);
        } else {
            if (a<1e-8f) continue;
            float disc=4*b*b-4*a*(sq-tr*tr);
            if (disc<0) continue;
            float sd=sqrtf(disc), inv=-0.5f/a, t1=(2*b+sd)*inv, t2=(2*b-sd)*inv;
            t=(t1*t2<0)?fmaxf(t1,t2):fminf(t1,t2);
        }
        if (!isfinite(t)||t<0||t>0.3f) continue;
        if (bz+vz*t+12.5f < 0 || bz+vz*t-12.5f > 100) continue;
        s+=t;
    }
    return s + (c&1)*1e-6f;
}

EXPORT float benchHitTestPlane(int n, uint32_t seed) {
    float s=0; uint32_t c=seed;
    for (int i=0;i<n;i++) {
        float bx=frnd(c,-500,500), by=frnd(c,-500,500), bz=frnd(c,0,200);
        float vx=frnd(c,-200,200), vy=frnd(c,-200,200), vz=frnd(c,-100,100);
        float bnv=vz;
        if (bnv>0.099f) continue;
        float bnd=bz-25;
        if (bnd<-50) continue;
        float t;
        if (fabsf(bnv)<=0.099f) { if (fabsf(bnd)>0.05f) continue; t=0; }
        else { t=bnd/-bnv; if (t<0) t=0; if (!isfinite(t)||t>0.5f) continue; }
        s+=t;
    }
    return s + (c&1)*1e-6f;
}

} // extern "C"
