// なしスタジオ - WebView2 をウィンドウに埋め込む
#pragma once

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string>
#include <functional>
#include <deque>
#include <mutex>
#include <condition_variable>
#include <thread>

#include "webreq.h"

namespace nashi {

// 画面はこの見せかけのアドレスから配信する（実体は exe の中）
extern const wchar_t* kVirtualOrigin;   // L"https://nashi.example"

class WebView {
public:
    typedef std::function<void(const HttpRequest&, HttpResponse&)> ResourceFn;

    // 失敗したら false（WebView2 ランタイムが無いときなど）
    bool Create(HWND parent,
                const std::wstring& userDataDir,
                ResourceFn resource,
                std::function<void(bool ok, const std::wstring& message)> onReady,
                std::function<void(const std::wstring& title)> onTitle);

    void Resize(HWND parent);
    void Focus();
    void ExecuteScript(const std::wstring& script, std::function<void(const std::wstring&)> done);
    void Shutdown();
    bool ready() const { return ready_; }

    // 画面から window.chrome.webview.postMessage() で送られてきた合図
    std::function<void(const std::wstring& message)> onMessage;

    // 時間のかかる要求か（true なら、別のスレッドで resource を呼ぶ）。
    // 未設定ならすべてその場で呼ぶ。別スレッドで呼ばれる要求は、1 本のスレッドで順に処理する。
    std::function<bool(const HttpRequest&)> isSlow;

private:
    // 別のスレッドに回した要求 1 つぶん
    struct Job {
        HttpRequest req;
        HttpResponse res;
        void* args = NULL;       // ICoreWebView2WebResourceRequestedEventArgs*（UI スレッドでだけ触る）
        void* deferral = NULL;   // ICoreWebView2Deferral*（同上）
    };

    void Respond(void* args, const HttpResponse& res);
    void WorkerLoop();
    void FinishJobs();           // UI スレッドで、終わった要求の返事を渡す
    static LRESULT CALLBACK MsgProc(HWND, UINT, WPARAM, LPARAM);

    void* controller_ = NULL;   // ICoreWebView2Controller*
    void* webview_ = NULL;      // ICoreWebView2*
    void* environment_ = NULL;  // ICoreWebView2Environment*
    bool ready_ = false;
    ResourceFn resource_;
    std::function<void(const std::wstring&)> onTitle_;

    HWND msgWnd_ = NULL;         // 終わったことを UI スレッドに知らせる窓（見えない）
    std::thread worker_;
    std::mutex mu_;
    std::condition_variable cv_;
    std::deque<Job*> todo_;      // mu_ で守る
    std::deque<Job*> done_;      // mu_ で守る
    bool stopping_ = false;      // mu_ で守る
};

} // namespace nashi
