// nashi SHIORI - block interpreter (blocks -> SakuraScript)
#pragma once

#include "program.h"
#include "saori.h"

#include <string>
#include <vector>

namespace nashi {

struct SysInfo {
    int bootCount = 0;      // how many times this ghost has started
    int talkCount = 0;      // random talks played in this session
    long uptimeSec = 0;     // seconds since this session started
    std::string ghostName;
    std::string shellName;
    std::string lastTalk;   // id of the talk played last
    std::vector<std::string> recentTalks;  // newest first; kept to avoid repeats

    // SSP が起動のときに知らせてくるもの（OnNotifyUserInfo / basewareversion）
    std::string userName;   // ユーザーの呼び名
    int birthMonth = 0;     // 誕生日（分からなければ 0）
    int birthDay = 0;
    std::string baseware;   // SSP の版（例: 2.9.26）

    // はじめて起動した日・さいごに起動した日（YYYY-MM-DD。保存データに記録）と、
    // 今回の起動が前の起動から何日ぶりか（「久しぶり」のトーク用）
    std::string firstBoot;
    std::string lastBoot;
    std::string lastSeen;   // さいごに保存した日（動かしたままの日も入る。「何日ぶり」はここから数える）
    int daysSinceLast = 0;
};

// 「N 秒後によぶ」の予約。栞がためておき、時間が来たら動かします。
struct LaterCall {
    int afterSec;
    std::string name;
};

struct RunCtx {
    Program* prog = NULL;
    Vars* vars = NULL;
    SysInfo* sys = NULL;
    SaoriHost* saori = NULL;         // 外部モジュールの呼び出し口（プレビューでは NULL）
    std::vector<std::string> refs;   // Reference0..N of the current event

    std::string out;
    std::string commTo;              // 話しかける相手（レスポンスの Reference0 になる）
    std::vector<LaterCall> later;    // 「N 秒後によぶ」の予約
    int scope = -1;                  // last character scope written into out
    int steps = 0;
    int depth = 0;
    bool stopped = false;            // \e or "stop" block reached
    bool closed = false;             // \- emitted
    std::vector<const JValue*> stack; // guards recursive "call"
};

// Escapes plain text for SakuraScript (\\ and newlines -> \n tag).
std::string EscapeText(const std::string& text);
// 句読点のあとに、少し間（\_w[…]）を足す（設定の autoWait）
std::string AddAutoWaits(const std::string& text);

// "YYYY-MM-DD" を、日のかぞえ番号にする（2 つの日付の差が、あいだの日数になる）。読めなければ -1
long DayNumber(const std::string& ymd);
// きょうの日付（"YYYY-MM-DD"）
std::string TodayYmd();

// Cuts text to the per-value limit (never inside a UTF-8 sequence).
std::string CapText(const std::string& s);

// 「SSP に ◯ をたずねる」の答えが届くイベント名と、その名前から変数名をもどすもの。
// OnNashiProp_ + 変数名（UTF-8）の 16 進。ASCII だけになるので、どの SSP でも通る。
std::string PropertyEventFor(const std::string& var);
bool VarFromPropertyEvent(const std::string& ev, std::string& var);

// Runs a stack of blocks, appending SakuraScript to ctx.out.
void RunBlocks(const JValue& blocks, RunCtx& ctx);

// Runs one whole script object ({..., "blocks":[...]}).
void RunScript(const JValue& script, RunCtx& ctx);

// トークの終わりに付ける印。ふつうは \e で閉じ、終了イベントは \- で閉じます。
// 栞（shiori.cpp）と、スタジオのプレビュー（preview.cpp）の両方から呼びます。
// 両方で同じ結果にならないと困るので、ここに 1 つだけ置いてあります。
std::string CloseScript(const std::string& out, bool isCloseEvent);

// Evaluates an expression node (literal or reporter block).
Value EvalExpr(const JValue& node, RunCtx& ctx);

} // namespace nashi
