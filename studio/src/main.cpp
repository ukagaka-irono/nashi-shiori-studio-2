// なしスタジオ - Windows ネイティブアプリ
//
// ・自前のウィンドウに WebView2 を埋め込んで画面を出す（ブラウザは開かない）
// ・画面（HTML/CSS/JS）と栞 nashi.dll は exe に埋め込み済み
// ・ネットワークは使わない。要求は WebView2 の中で受け取って直接返している
//
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <objbase.h>
#include <cstdio>

#include "api.h"
#include "assets.h"
#include "fsutil.h"
#include "util.h"
#include "webview.h"

#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "ole32.lib")

using namespace nashi;

// もとの「なしスタジオ」と同時に起動できるよう、名前を分けています。
static const wchar_t* kWindowClass = L"NashiStudio2Window";
static const wchar_t* kMutexName = L"Local\\NashiStudio2SingleInstance";
static const UINT kSaveTimeoutTimer = 1;

static Api g_api;
static WebView g_web;
static HWND g_hwnd = NULL;
static bool g_closing = false;
static bool g_waitingSave = false;

// ------------------------------------------------------------ ウィンドウ位置

static void RestorePlacement(HWND hwnd) {
    JValue cfg = g_api.LoadConfig();
    const JValue& win = cfg["window"];

    int w = win["w"].asInt(1440);
    int h = win["h"].asInt(920);
    if (w < 960) w = 960;
    if (h < 620) h = 620;

    RECT work;
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
    int maxW = work.right - work.left;
    int maxH = work.bottom - work.top;
    if (w > maxW) w = maxW;
    if (h > maxH) h = maxH;

    int x = win.has("x") ? win["x"].asInt(0) : work.left + (maxW - w) / 2;
    int y = win.has("y") ? win["y"].asInt(0) : work.top + (maxH - h) / 2;
    if (x < work.left - 40 || x > work.right - 80) x = work.left + (maxW - w) / 2;
    if (y < work.top - 10 || y > work.bottom - 80) y = work.top + (maxH - h) / 2;

    SetWindowPos(hwnd, NULL, x, y, w, h, SWP_NOZORDER);
    ShowWindow(hwnd, win["max"].asBool(false) ? SW_SHOWMAXIMIZED : SW_SHOW);
}

static void SavePlacement(HWND hwnd) {
    WINDOWPLACEMENT wp;
    wp.length = sizeof(wp);
    if (!GetWindowPlacement(hwnd, &wp)) return;
    const RECT& r = wp.rcNormalPosition;

    JValue win = JValue::makeObj();
    win.set("x", JValue::makeNum(r.left));
    win.set("y", JValue::makeNum(r.top));
    win.set("w", JValue::makeNum(r.right - r.left));
    win.set("h", JValue::makeNum(r.bottom - r.top));
    win.set("max", JValue::makeBool(wp.showCmd == SW_SHOWMAXIMIZED));
    g_api.SaveConfig("window", win);
}

// ---------------------------------------------------------------- 終了処理

static void FinishClose(HWND hwnd) {
    g_closing = true;
    g_waitingSave = false;
    KillTimer(hwnd, kSaveTimeoutTimer);
    DestroyWindow(hwnd);
}

// 確かめのことば。画面の言語に合わせたものを、閉じるときに画面（App.nativeTexts）からもらう。
// もらえなかったときは日本語のまま。
static std::wstring g_txTitle = L"なしスタジオ 2";
static std::wstring g_txAsk = L"保存していない変更があります。\n保存して終了しますか？";
static std::wstring g_txNotFinished = L"保存が終わりませんでした。";
static std::wstring g_txFailed = L"保存できませんでした。";
static std::wstring g_txDiscard = L"保存せずに終了しますか？（変更は消えます）";

// 画面が出る前のまちがい（ウィンドウが作れない・WebView2 が無い）は、Windows の表示言語で。
// 日本語の Windows なら日本語、それ以外は英語
static bool OsIsJapanese() {
    return PRIMARYLANGID(GetUserDefaultUILanguage()) == LANG_JAPANESE;
}

// ExecuteScript の結果（JSON にした値）から、App.nativeTexts() の中身を読む。dirty を返す
static bool TakeNativeTexts(const std::wstring& result) {
    std::string err;
    JValue outer, v;
    // 返ってくるのは「JSON の文字列」を JSON にしたもの（JSON.stringify の結果を、もう一度 JSON に）
    if (!JsonParse(WideToUtf8(result), outer, err) || outer.type != JType::Str) return false;
    if (!JsonParse(outer.asStr(), v, err) || !v.isObj()) return false;
    struct { const char* key; std::wstring* to; } fields[] = {
        { "title", &g_txTitle }, { "ask", &g_txAsk }, { "notFinished", &g_txNotFinished },
        { "failed", &g_txFailed }, { "discard", &g_txDiscard },
    };
    for (size_t i = 0; i < sizeof(fields) / sizeof(fields[0]); i++) {
        std::string s = v[fields[i].key].asStr();
        if (!s.empty()) *fields[i].to = Utf8ToWide(s);
    }
    return v["dirty"].asBool(false);
}

// 保存できなかった（または返事が来なかった）とき。黙って閉じると変更が消えるので確かめる。
static void SaveFailed(HWND hwnd, const std::wstring& why) {
    g_waitingSave = false;
    KillTimer(hwnd, kSaveTimeoutTimer);
    std::wstring text = why + L"\n" + g_txDiscard;
    int answer = MessageBoxW(hwnd, text.c_str(), g_txTitle.c_str(),
                             MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2);
    if (answer == IDYES) FinishClose(hwnd);
}

static void AskThenClose(HWND hwnd) {
    if (g_closing || !g_web.ready()) { FinishClose(hwnd); return; }

    g_web.ExecuteScript(
        L"(function(){try{return JSON.stringify(NASHI.App.nativeTexts())}catch(e){return ''}})()",
        [hwnd](const std::wstring& result) {
            bool dirty = TakeNativeTexts(result);
            if (!dirty) { FinishClose(hwnd); return; }

            int answer = MessageBoxW(hwnd, g_txAsk.c_str(), g_txTitle.c_str(),
                                     MB_YESNOCANCEL | MB_ICONWARNING | MB_DEFBUTTON1);
            if (answer == IDCANCEL) return;
            if (answer == IDNO) { FinishClose(hwnd); return; }

            g_waitingSave = true;
            SetTimer(hwnd, kSaveTimeoutTimer, 5000, NULL);   // 返事が来なければ、確かめる
            g_web.ExecuteScript(L"NASHI.App.requestSaveAndClose()", NULL);
        });
}

// ------------------------------------------------------------------ ウィンドウ

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
        case WM_SIZE:
            g_web.Resize(hwnd);
            return 0;

        case WM_SETFOCUS:
            g_web.Focus();
            return 0;

        case WM_GETMINMAXINFO: {
            MINMAXINFO* mm = (MINMAXINFO*)lp;
            mm->ptMinTrackSize.x = 960;
            mm->ptMinTrackSize.y = 620;
            return 0;
        }

        case WM_TIMER:
            if (wp == kSaveTimeoutTimer && g_waitingSave) {
                SaveFailed(hwnd, g_txNotFinished);
            }
            return 0;

        case WM_CLOSE:
            AskThenClose(hwnd);
            return 0;

        case WM_DESTROY:
            SavePlacement(hwnd);
            g_web.Shutdown();
            PostQuitMessage(0);
            return 0;
    }
    return DefWindowProcW(hwnd, msg, wp, lp);
}

// -------------------------------------------------------------------- main

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE, LPWSTR, int) {
    // あとから読みこむ DLL を、作業フォルダから探さない（置かれた同じ名前の DLL を読まない）。
    // exe が輸入している DLL のほうは、リンクの /DEPENDENTLOADFLAG で System32 に限っています。
    SetDllDirectoryW(L"");

    // 二重起動したときは、すでに開いているウィンドウを前に出すだけ
    HANDLE mutex = CreateMutexW(NULL, TRUE, kMutexName);
    if (mutex && GetLastError() == ERROR_ALREADY_EXISTS) {
        HWND other = FindWindowW(kWindowClass, NULL);
        if (other) {
            if (IsIconic(other)) ShowWindow(other, SW_RESTORE);
            SetForegroundWindow(other);
        }
        return 0;
    }

    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    g_api.Init();

    WNDCLASSEXW wc;
    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.style = CS_HREDRAW | CS_VREDRAW;
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = kWindowClass;
    wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
    wc.hbrBackground = CreateSolidBrush(RGB(233, 238, 244));
    wc.hIcon = (HICON)LoadImageW(hInstance, MAKEINTRESOURCEW(IDI_NASHI_APP), IMAGE_ICON,
                                 0, 0, LR_DEFAULTSIZE);
    wc.hIconSm = (HICON)LoadImageW(hInstance, MAKEINTRESOURCEW(IDI_NASHI_APP), IMAGE_ICON,
                                   16, 16, 0);
    RegisterClassExW(&wc);

    g_hwnd = CreateWindowExW(0, kWindowClass, L"なしスタジオ 2", WS_OVERLAPPEDWINDOW,
                             CW_USEDEFAULT, CW_USEDEFAULT, 1440, 920,
                             NULL, NULL, hInstance, NULL);
    if (!g_hwnd) {
        MessageBoxW(NULL, OsIsJapanese() ? L"ウィンドウを作れませんでした。" : L"Could not create the window.",
                    OsIsJapanese() ? L"なしスタジオ 2" : L"Nashi Studio 2", MB_ICONERROR);
        return 1;
    }
    RestorePlacement(g_hwnd);

    g_web.onMessage = [](const std::wstring& message) {
        if (message == L"saved" && g_waitingSave) FinishClose(g_hwnd);
        if (message == L"save-failed" && g_waitingSave) SaveFailed(g_hwnd, g_txFailed);
    };

    // API は別のスレッドで処理する（SSP を探す・書き出す・保存するあいだも、画面が固まらない）。
    // その場で処理するのは、すぐ終わる画像と、ウィンドウを出すファイル選びだけ。
    g_web.isSlow = [](const HttpRequest& req) {
        if (req.path.compare(0, 5, "/api/") != 0) return false;           // 画面のファイル
        if (req.path == "/api/shell" || req.path == "/api/shell/file") return false;
        if (req.path == "/api/shell/pick") return false;                  // ダイアログは UI スレッドで
        return true;
    };

    bool started = g_web.Create(
        g_hwnd,
        PathJoin(ExeDir(), L"webview-data"),
        [](const HttpRequest& req, HttpResponse& res) { g_api.Handle(req, res); },
        [](bool ok, const std::wstring& message) {
            if (ok) {
                g_web.Focus();
                return;
            }
            std::wstring text = message + (OsIsJapanese()
                ? L"\n\nこのアプリは Microsoft Edge WebView2 ランタイムを使います。\n"
                  L"「OK」を押すと配布ページを開きます。"
                : L"\n\nThis app needs the Microsoft Edge WebView2 Runtime.\n"
                  L"Press OK to open its download page.");
            if (MessageBoxW(g_hwnd, text.c_str(), OsIsJapanese() ? L"なしスタジオ 2" : L"Nashi Studio 2",
                            MB_OKCANCEL | MB_ICONERROR) == IDOK) {
                ShellExecuteW(NULL, L"open",
                              L"https://developer.microsoft.com/microsoft-edge/webview2/",
                              NULL, NULL, SW_SHOWNORMAL);
            }
            g_closing = true;
            DestroyWindow(g_hwnd);
        },
        [](const std::wstring& title) {
            std::wstring t = title.empty() ? L"なしスタジオ 2" : title;
            SetWindowTextW(g_hwnd, t.c_str());
        });

    if (!started) {
        // Create の中でメッセージは出している
    }

    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    g_web.Shutdown();
    CoUninitialize();
    if (mutex) CloseHandle(mutex);
    return 0;
}
