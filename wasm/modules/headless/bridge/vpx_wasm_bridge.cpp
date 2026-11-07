// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
// Headless engine bridge for vpx-js: the C ABI a JS host uses to drive the
// real Player/PhysicsEngine of an ENABLE_HEADLESS vpinball build. Tables and
// ROMs load from memory, frames step on demand (Player::StepHeadlessFrame),
// and per-frame state is published as flat float row buffers that the host
// applies to its own scene (vpx-js lib/wasm/). Every value is read through
// upstream's public API: script getters, the display resolver, part data.
// Built by the vpinball-headless CMake target (wasm/modules/headless/patches).

#include "core/stdafx.h"

#include <chrono>
#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

#include "core/VPApp.h"
#include "core/extern.h"
#include "core/player.h"
#include "parts/ball.h"
#include "parts/bumper.h"
#include "parts/dispreel.h"
#include "parts/flasher.h"
#include "parts/flipper.h"
#include "parts/gate.h"
#include "parts/hittarget.h"
#include "parts/kicker.h"
#include "parts/light.h"
#include "parts/PartGroup.h"
#include "parts/pintable.h"
#include "parts/plunger.h"
#include "parts/primitive.h"
#include "parts/spinner.h"
#include "parts/trigger.h"
#include "physics/PhysicsEngine.h"
#include "physics/cabinet/NudgeHandler.h"
#include "physics/hitball.h"
#include "ui/VPXFileFeedback.h"

#include <emscripten.h>

namespace
{

// Keep in sync with vpx-js lib/wasm/vpinball-wasm.ts (WASM_BUFFER_IDS, WASM_STRIDES).
enum BufferKind : int
{
   Balls,
   Movers,
   Lights,
   Prims,
   Flashers,
   Reels,
   BufferKinds
};
constexpr int STRIDES[BufferKinds] = { 16, 8, 8, 22, 8, 4 };

enum class MoverType : int
{
   Flipper,
   Plunger,
   Spinner,
   Gate,
   Bumper,
   HitTarget,
   Trigger
};

constexpr const char *TABLE_PATH = "/bridge/table.vpx";
constexpr const char *ROM_DIR = "/bridge/pinmame/roms";

CComObject<PinTable> *g_table;
Player *g_player;
std::string g_catalog;
// Scratch for VpxWasm_GetFlasherImage: the reader copies the name out before
// the next call, same single-threaded contract as the buffer views.
std::string g_flasherImage;
std::vector<float> g_buf[BufferKinds];

struct BridgeBufferView
{
   int ptr;
   int count;
   int stride;
};
BridgeBufferView g_view;

struct BridgeDmdFrame
{
   int ptr;
   int width;
   int height;
   int format; // CTLPI_DISPLAY_FORMAT_LUM32F or _SRGB888
   int frameId;
};
BridgeDmdFrame g_dmd;
std::vector<uint8_t> g_dmdRgb; // SRGB565 frames widened to SRGB888

float Bool(const bool b) { return b ? 1.f : 0.f; }

float ToRGB(const COLORREF c) { return (float)(((c & 0x0000FF) << 16) | (c & 0x00FF00) | ((c & 0xFF0000) >> 16)); }

void PushRow(const BufferKind kind, std::initializer_list<float> values)
{
   assert(values.size() == (size_t)STRIDES[kind]);
   g_buf[kind].insert(g_buf[kind].end(), values);
}

const char *ItemTypeName(const ItemTypeEnum type)
{
   switch (type)
   {
   case eItemFlipper: return "flipper";
   case eItemPlunger: return "plunger";
   case eItemSpinner: return "spinner";
   case eItemGate: return "gate";
   case eItemBumper: return "bumper";
   case eItemHitTarget: return "hittarget";
   case eItemTrigger: return "trigger";
   case eItemLight: return "light";
   case eItemPrimitive: return "primitive";
   case eItemFlasher: return "flasher";
   case eItemKicker: return "kicker";
   case eItemRamp: return "ramp";
   case eItemRubber: return "rubber";
   case eItemSurface: return "surface";
   case eItemTimer: return "timer";
   case eItemTextbox: return "textbox";
   case eItemDispReel: return "dispreel";
   case eItemLightSeq: return "lightseq";
   case eItemDecal: return "decal";
   case eItemCollection: return "collection";
   default: return "unknown";
   }
}

// Part names are table-authored: escape quotes, backslashes and control
// characters so one odd name cannot break the whole catalog.
void AppendJsonString(std::string &json, const string &value)
{
   json += '"';
   for (const char ch : value)
   {
      const unsigned char c = (unsigned char)ch;
      if (c == '"' || c == '\\')
      {
         json += '\\';
         json += ch;
      }
      else if (c < 0x20)
      {
         char esc[7];
         snprintf(esc, sizeof(esc), "\\u%04x", c);
         json += esc;
      }
      else
         json += ch;
   }
   json += '"';
}

void RebuildCatalog()
{
   std::string json = "[";
   const vector<IEditable *> &parts = g_table->GetParts();
   for (size_t i = 0; i < parts.size(); ++i)
   {
      if (i > 0)
         json += ',';
      json += "{\"idx\":";
      json += std::to_string(i);
      json += ",\"name\":";
      AppendJsonString(json, parts[i]->GetName());
      json += ",\"type\":";
      AppendJsonString(json, ItemTypeName(parts[i]->GetItemType()));
      json += '}';
   }
   json += ']';
   g_catalog = std::move(json);
}

float PartVisible(IEditable *const part)
{
   // Player mode visibility mask of 10.8+ part groups, as Renderer::RenderItem applies it in VR.
   if (part->GetPartGroup() && (part->GetPartGroup()->GetPlayerModeVisibilityMask() & PartGroupData::PMVM_VIRTUAL_REALITY) == 0)
      return 0.f;
   switch (part->GetItemType())
   {
   case eItemFlipper: return Bool(static_cast<Flipper *>(part)->m_d.m_visible);
   case eItemPlunger: return Bool(static_cast<Plunger *>(part)->m_d.m_visible);
   case eItemSpinner: return Bool(static_cast<Spinner *>(part)->m_d.m_visible);
   case eItemGate: return Bool(static_cast<Gate *>(part)->m_d.m_visible);
   case eItemBumper: return Bool(static_cast<Bumper *>(part)->m_d.m_visible);
   case eItemHitTarget: return Bool(static_cast<HitTarget *>(part)->m_d.m_visible);
   case eItemTrigger: return Bool(static_cast<Trigger *>(part)->m_d.m_visible);
   case eItemLight: return Bool(static_cast<Light *>(part)->m_d.m_visible);
   case eItemPrimitive: return Bool(static_cast<Primitive *>(part)->m_d.m_visible);
   case eItemFlasher: return Bool(static_cast<Flasher *>(part)->m_d.m_isVisible);
   default: return 1.f;
   }
}

// Script getters report angles in degrees; the rows carry radians.
template <class Part> float AngleRad(Part *const part)
{
   float deg = 0.f;
   part->get_CurrentAngle(&deg);
   return ANGTORAD(deg);
}

void PushMover(const float idx, const MoverType type, const float a, const float b, const float c, const float d, const float vis)
{
   PushRow(Movers, { idx, (float)type, a, b, c, d, vis, 0.f });
}

void FillBuffers()
{
   for (auto &buf : g_buf)
      buf.clear();
   if (!g_player)
      return;
   for (HitBall *const hb : g_player->m_physics->GetBalls())
   {
      if (!hb || !hb->m_pBall)
         continue;
      int id = 0;
      hb->m_pBall->get_ID(&id);
      const float *o = &hb->m_orientation.m_d[0][0];
      PushRow(Balls, { (float)id, hb->m_d.m_pos.x, hb->m_d.m_pos.y, hb->m_d.m_pos.z, hb->m_d.m_radius, o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8],
                        ToRGB(hb->m_pBall->m_d.m_color), 1.f });
   }
   const vector<IEditable *> &parts = g_table->GetParts();
   for (size_t i = 0; i < parts.size(); ++i)
   {
      IEditable *const part = parts[i];
      const float idx = (float)i;
      const float vis = PartVisible(part);
      switch (part->GetItemType())
      {
      case eItemFlipper: PushMover(idx, MoverType::Flipper, AngleRad(static_cast<Flipper *>(part)), 0.f, 0.f, 0.f, vis); break;
      case eItemSpinner: PushMover(idx, MoverType::Spinner, AngleRad(static_cast<Spinner *>(part)), 0.f, 0.f, 0.f, vis); break;
      case eItemGate: PushMover(idx, MoverType::Gate, AngleRad(static_cast<Gate *>(part)), 0.f, 0.f, 0.f, vis); break;
      case eItemPlunger:
      {
         // Position() is the script's 0..25 pull scale (0 = rest); the row carries the 0..1 stroke.
         float position = 0.f;
         static_cast<Plunger *>(part)->Position(&position);
         PushMover(idx, MoverType::Plunger, 1.f - position / 25.f, 0.f, 0.f, 0.f, vis);
         break;
      }
      case eItemBumper:
      {
         auto *const bumper = static_cast<Bumper *>(part);
         const BumperData &bd = bumper->m_d;
         float ring = 0.f, rotX = 0.f, rotY = 0.f;
         bumper->get_CurrentRingOffset(&ring);
         bumper->get_RotX(&rotX);
         bumper->get_RotY(&rotY);
         const int bits = (bd.m_capVisible ? 1 : 0) | (bd.m_baseVisible ? 2 : 0) | (bd.m_ringVisible ? 4 : 0) | (bd.m_skirtVisible ? 8 : 0);
         PushMover(idx, MoverType::Bumper, ring, rotX, rotY, (float)bits, vis);
         break;
      }
      case eItemHitTarget:
      {
         auto *const target = static_cast<HitTarget *>(part);
         float offset = 0.f;
         target->get_CurrentAnimOffset(&offset);
         PushMover(idx, MoverType::HitTarget, offset, Bool(target->m_d.m_isDropped), 0.f, 0.f, vis);
         break;
      }
      case eItemTrigger:
      {
         float offset = 0.f;
         static_cast<Trigger *>(part)->get_CurrentAnimOffset(&offset);
         PushMover(idx, MoverType::Trigger, offset, 0.f, 0.f, 0.f, vis);
         break;
      }
      case eItemLight:
      {
         auto *const light = static_cast<Light *>(part);
         PushRow(Lights, { idx, light->m_currentIntensity, light->m_d.m_intensity, light->m_d.m_intensity_scale, Bool(light->m_inPlayState), ToRGB(light->m_d.m_color),
                            ToRGB(light->m_d.m_color2), vis });
         break;
      }
      case eItemPrimitive:
      {
         auto *const prim = static_cast<Primitive *>(part);
         const PrimitiveData &pd = prim->m_d;
         PushRow(Prims, { idx, pd.m_vPosition.x, pd.m_vPosition.y, pd.m_vPosition.z, pd.m_vSize.x, pd.m_vSize.y, pd.m_vSize.z, pd.m_aRotAndTra[0], pd.m_aRotAndTra[1],
                           pd.m_aRotAndTra[2], pd.m_aRotAndTra[3], pd.m_aRotAndTra[4], pd.m_aRotAndTra[5], pd.m_aRotAndTra[6], pd.m_aRotAndTra[7], pd.m_aRotAndTra[8], vis,
                           ToRGB(pd.m_color), pd.m_alpha, pd.m_disableLightingTop, pd.m_disableLightingBelow, prim->GetCurrentFrame() });
         break;
      }
      case eItemFlasher:
      {
         auto *const flasher = static_cast<Flasher *>(part);
         const FlasherData &fd = flasher->m_d;
         PushRow(Flashers, { idx, vis, (float)fd.m_alpha, ToRGB(fd.m_color), fd.m_intensity_scale, fd.m_modulate_vs_add, Bool(fd.m_addBlend), Bool(flasher->m_inPlayState) });
         break;
      }
      case eItemDispReel:
      {
         // One row per reel, the digit DispReel::Render draws. Backdrop items
         // ignore the VR part-group mask: the host shows them on its backglass.
         auto *const reel = static_cast<DispReel *>(part);
         for (int r = 0; r < min(reel->GetReels(), MAX_REELS); ++r)
            PushRow(Reels, { idx, (float)r, (float)reel->GetReelValue(r), Bool(reel->m_d.m_visible) });
         break;
      }
      default: break;
      }
   }
}

void DestroySession()
{
   delete g_player;
   g_player = nullptr;
   if (g_table)
      g_table->Release();
   g_table = nullptr;
   g_catalog.clear();
   for (auto &buf : g_buf)
      buf.clear();
}

bool WriteFile(const std::filesystem::path &path, const uint8_t *data, const int len)
{
   std::error_code ec;
   std::filesystem::create_directories(path.parent_path(), ec);
   FILE *const f = ec ? nullptr : fopen(path.c_str(), "wb");
   if (!f)
      return false;
   const size_t written = fwrite(data, 1, (size_t)len, f);
   fclose(f);
   return written == (size_t)len;
}

uint64_t NowNs()
{
   using namespace std::chrono;
   return (uint64_t)duration_cast<nanoseconds>(steady_clock::now().time_since_epoch()).count();
}

} // namespace

extern "C"
{

// Bump on any change to the exported functions, descriptor structs or buffer
// row layouts; vpx-js refuses an engine whose version differs
// (HEADLESS_ABI_VERSION in lib/wasm/vpinball-wasm.ts).
EMSCRIPTEN_KEEPALIVE int VpxWasm_GetAbiVersion() { return 3; }

EMSCRIPTEN_KEEPALIVE int VpxWasm_Init()
{
   if (g_app)
      return 0;
   // Play in VR mode: scripts read RenderingMode = 2 and show their own room and cabinet.
   Settings::SetStandalone_RenderingModeOverride_Default(2);
   // No B2S window exists: the host shows the table's own desktop backdrop. Hint
   // controller.vbs off B2S, or B2SOn scripts hide their EM reels and backdrop items.
   Settings::SetController_ForceDisableB2S_Default(true);
   g_app = new VPApp();
   g_app->InitInstance(true);
   return 0;
}

EMSCRIPTEN_KEEPALIVE int VpxWasm_MountRom(const char *fileName, const uint8_t *zip, int len)
{
   if (!fileName || !zip || len <= 0)
      return -1;
   return WriteFile(std::filesystem::path(ROM_DIR) / fileName, zip, len) ? 0 : -2;
}

EMSCRIPTEN_KEEPALIVE int VpxWasm_LoadTable(const uint8_t *vpx, int len)
{
   if (!g_app || !vpx || len <= 0)
      return -1;
   DestroySession();
   if (!WriteFile(TABLE_PATH, vpx, len))
      return -2;
   CComObject<PinTable>::CreateInstance(&g_table);
   g_table->AddRef();
   VPXFileFeedback feedback;
   if (FAILED(g_table->LoadGameFromFilename(TABLE_PATH, feedback)))
   {
      DestroySession();
      return -4;
   }
   LoadProgress loadProgress;
   g_player = new Player(g_table, Player::PlayMode::Play, loadProgress);
   RebuildCatalog();
   FillBuffers();
   return 0;
}

EMSCRIPTEN_KEEPALIVE void VpxWasm_StepFrame()
{
   if (!g_player)
      return;
   g_player->StepHeadlessFrame();
   FillBuffers();
}

EMSCRIPTEN_KEEPALIVE void VpxWasm_DestroyTable() { DestroySession(); }

EMSCRIPTEN_KEEPALIVE const char *VpxWasm_GetPartCatalogJson() { return g_catalog.c_str(); }

EMSCRIPTEN_KEEPALIVE const BridgeBufferView *VpxWasm_GetBuffer(int kind)
{
   if (kind < 0 || kind >= BufferKinds)
      return nullptr;
   g_view.ptr = g_buf[kind].empty() ? 0 : (int)(intptr_t)g_buf[kind].data();
   g_view.count = (int)(g_buf[kind].size() / STRIDES[kind]);
   g_view.stride = STRIDES[kind];
   return &g_view;
}

EMSCRIPTEN_KEEPALIVE int VpxWasm_GetScriptErrorCount() { return g_player ? (int)g_player->m_nScriptErrorNotification : -1; }

EMSCRIPTEN_KEEPALIVE const char *VpxWasm_GetScriptError()
{
   if (!g_player || g_player->m_lastScriptError.empty())
      return nullptr;
   return g_player->m_lastScriptError.c_str();
}

// Current script image of one flasher part. Script `Flasher.ImageA = ...`
// writes land in `FlasherData::m_szImageA`; tables whose script disables
// its FlexDMD stage in desktop mode drive their whole display through it.
// Null when no table is loaded, the index is out of range, the part is no
// flasher, or its image is empty.
EMSCRIPTEN_KEEPALIVE const char *VpxWasm_GetFlasherImage(int partIdx)
{
   if (!g_table || partIdx < 0 || (size_t)partIdx >= g_table->GetParts().size())
      return nullptr;
   IEditable *const part = g_table->GetParts()[(size_t)partIdx];
   if (part->GetItemType() != eItemFlasher)
      return nullptr;
   g_flasherImage = static_cast<Flasher *>(part)->m_d.m_szImageA;
   return g_flasherImage.empty() ? nullptr : g_flasherImage.c_str();
}

// The default DMD, as a DMD flasher resolves it: whichever plugin (PinMAME,
// FlexDMD, a colorizer) or script (DMDPixels) provides it. Null without one.
EMSCRIPTEN_KEEPALIVE const BridgeDmdFrame *VpxWasm_GetDmdFrame()
{
   if (!g_player)
      return nullptr;
   const auto dmd = g_player->m_resURIResolver.GetDisplayState(PinballPlugin::ResURIResolver::DefaultDmdUri);
   if (dmd.source == nullptr || dmd.state.frame == nullptr)
      return nullptr;
   const unsigned int width = dmd.source->width, height = dmd.source->height;
   const void *pixels = dmd.state.frame;
   unsigned int format = dmd.source->frameFormat;
   if (format == CTLPI_DISPLAY_FORMAT_SRGB565)
   {
      const uint16_t *const src = static_cast<const uint16_t *>(pixels);
      g_dmdRgb.resize((size_t)width * height * 3);
      for (size_t i = 0; i < (size_t)width * height; ++i)
      {
         const uint16_t c = src[i];
         g_dmdRgb[i * 3 + 0] = (uint8_t)(((c >> 11) & 0x1F) * 255 / 31);
         g_dmdRgb[i * 3 + 1] = (uint8_t)(((c >> 5) & 0x3F) * 255 / 63);
         g_dmdRgb[i * 3 + 2] = (uint8_t)((c & 0x1F) * 255 / 31);
      }
      pixels = g_dmdRgb.data();
      format = CTLPI_DISPLAY_FORMAT_SRGB888;
   }
   else if (format != CTLPI_DISPLAY_FORMAT_LUM32F && format != CTLPI_DISPLAY_FORMAT_SRGB888)
      return nullptr;
   g_dmd = { (int)(intptr_t)pixels, (int)width, (int)height, (int)format, (int)dmd.state.frameId };
   return &g_dmd;
}

EMSCRIPTEN_KEEPALIVE void VpxWasm_PushKey(int sdlScancode, int isPressed)
{
   if (g_player)
      g_player->m_pininput.PushButtonEvent(g_player->m_pininput.GetKeyboardDeviceId(), (uint16_t)sdlScancode, NowNs(), isPressed != 0);
}

EMSCRIPTEN_KEEPALIVE void VpxWasm_Nudge(float angleDeg, float force)
{
   if (g_player)
      g_player->m_pininput.m_nudgeHandler->ApplyKeyboardImpulse(angleDeg, force);
}

// Output level of the engine's audio (table sounds and plugin streams such as
// PinMAME ROM audio), through the desktop UpdateVolume path so live voices
// follow. Clamped: the audio player takes sqrtf of the bus volume.
EMSCRIPTEN_KEEPALIVE void VpxWasm_SetAudioLevel(float volume, int muted)
{
   if (!g_player)
      return;
   const float level = muted ? 0.f : clamp(volume, 0.f, 1.f);
   g_player->m_backglassVolume = level;
   g_player->m_playfieldVolume = level;
   g_player->UpdateVolume();
}

} // extern "C"

int main() { return 0; }
