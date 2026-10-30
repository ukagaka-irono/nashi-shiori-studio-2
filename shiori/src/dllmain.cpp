// nashi SHIORI - DLL entry points (SHIORI/3.0)
//
//   BOOL    load(HGLOBAL h, long len)   h = module directory (MBCS), freed by us
//   BOOL    unload()
//   HGLOBAL request(HGLOBAL h, long* len)  h = request (freed by us), return = response
//
#include "shiori.h"
#include "util.h"

#include <string>

static nashi::Shiori* g_shiori = NULL;
static HINSTANCE g_instance = NULL;

// いま load / unload / request の中にいるか。
// SAORI がダイアログを出してメッセージを回すと、その間に SSP がもう一度
// request を呼んでくることがあります。そこで栞を作りなおしたり読みなおしたりすると、
// 外側の呼び出しが消えたものを触るので、中にいる間の呼び出しは断ります。
static bool g_busy = false;

namespace {
struct BusyScope {
    BusyScope() { g_busy = true; }
    ~BusyScope() { g_busy = false; }
};
}

namespace nashi {
// OS の例外（SAORI の中のアクセス違反など）で栞の関数が巻きもどされたとき、
// tinycrt.cpp から呼ばれます。BusyScope の後片づけは走らないので、ここで下ろします。
void AbandonCalls() { g_busy = false; }
}

// 栞は古い Windows でも読みこめるように、Visual Studio の C ランタイムを
// 外して組んでいます（shiori/src/tinycrt.cpp）。ふだん CRT がやってくれる
// 「外に置いた変数の組み立てと後片づけ」を、ここで自分で呼びます。
namespace nashi {
void TinyCrtStartup();
void TinyCrtShutdown();
}

// safebuffers …「積み場所の帯」を配るのがこの中なので、ここだけは見張りません
__declspec(safebuffers) BOOL APIENTRY DllMain(HINSTANCE hInst, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        g_instance = hInst;
        nashi::TinyCrtStartup();
        DisableThreadLibraryCalls(hInst);
    } else if (reason == DLL_PROCESS_DETACH) {
        nashi::TinyCrtShutdown();
    }
    return TRUE;
}

extern "C" {

__declspec(dllexport) BOOL __cdecl load(HGLOBAL h, long len) {
    std::string path;
    if (h != NULL) {
        if (len > 0) path.assign((const char*)h, (size_t)len);
        GlobalFree(h);
    }
    if (g_busy) return FALSE;
    BusyScope busy;
    if (path.empty()) {
        wchar_t buf[MAX_PATH];
        DWORD n = GetModuleFileNameW(g_instance, buf, MAX_PATH);
        std::wstring w(buf, n);
        size_t slash = w.find_last_of(L"\\/");
        std::wstring dir = (slash == std::wstring::npos) ? L"" : w.substr(0, slash + 1);
        if (g_shiori) { g_shiori->Unload(); delete g_shiori; }
        g_shiori = new nashi::Shiori();
        return g_shiori->Load(dir) ? TRUE : FALSE;
    }

    std::wstring dir = nashi::AcpToWide(path);
    if (g_shiori) { g_shiori->Unload(); delete g_shiori; }
    g_shiori = new nashi::Shiori();
    return g_shiori->Load(dir) ? TRUE : FALSE;
}

__declspec(dllexport) BOOL __cdecl unload() {
    if (g_busy) return FALSE;
    BusyScope busy;
    if (g_shiori) {
        g_shiori->Unload();
        delete g_shiori;
        g_shiori = NULL;
    }
    return TRUE;
}

__declspec(dllexport) HGLOBAL __cdecl request(HGLOBAL h, long* len) {
    std::string raw;
    if (h != NULL) {
        long n = (len && *len > 0) ? *len : 0;
        if (n > 0) raw.assign((const char*)h, (size_t)n);
        GlobalFree(h);
    }

    std::string response;
    if (g_busy) {
        response = "SHIORI/3.0 204 No Content\r\nSender: nashi\r\nCharset: UTF-8\r\n\r\n";
    } else if (g_shiori) {
        BusyScope busy;
        response = g_shiori->Request(raw);
    } else {
        response = "SHIORI/3.0 500 Internal Server Error\r\nSender: nashi\r\nCharset: UTF-8\r\n\r\n";
    }

    size_t size = response.size();
    HGLOBAL out = GlobalAlloc(GMEM_FIXED, size ? size : 1);
    if (out == NULL) {
        if (len) *len = 0;
        return NULL;
    }
    if (size) memcpy(out, response.c_str(), size);
    if (len) *len = (long)size;
    return out;
}

} // extern "C"
