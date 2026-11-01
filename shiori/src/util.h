// nashi SHIORI - utility helpers
#pragma once

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string>
#include <vector>

namespace nashi {

// ---- encoding -------------------------------------------------------------
std::wstring MbToWide(const std::string& s, UINT cp);
std::string  WideToMb(const std::wstring& s, UINT cp);

inline std::wstring Utf8ToWide(const std::string& s) { return MbToWide(s, CP_UTF8); }
inline std::string  WideToUtf8(const std::wstring& s) { return WideToMb(s, CP_UTF8); }
inline std::wstring AcpToWide(const std::string& s) { return MbToWide(s, CP_ACP); }

// true when the byte sequence is well-formed UTF-8
bool LooksUtf8(const std::string& s);
// normalise arbitrary bytes (UTF-8 / CP932) into UTF-8, BOM stripped
std::string ToUtf8(const std::string& raw);
// every byte that is not part of a well-formed UTF-8 sequence becomes '?'
std::string RepairUtf8(const std::string& s);

// ---- files ----------------------------------------------------------------
// allowSjis = false: never guess Shift_JIS (for files the shiori wrote itself)
bool ReadTextFile(const std::wstring& path, std::string& outUtf8, bool allowSjis = true);
// ReadTextFile と同じだが、読めなかったわけを返す
enum { kReadOk = 0, kReadMissing = 1, kReadLocked = 2, kReadTooBig = 3, kReadDenied = 4 };
int ReadTextFileWhy(const std::wstring& path, std::string& outUtf8, bool allowSjis = true);
// writes beside the file, then swaps it in (a crash never leaves half a file)
bool WriteTextFile(const std::wstring& path, const std::string& utf8);
bool FileExists(const std::wstring& path);

// ---- strings --------------------------------------------------------------
std::string Trim(const std::string& s);
bool IEquals(const std::string& a, const std::string& b);
bool StartsWith(const std::string& s, const std::string& prefix);
std::string NumToStr(double v);
double StrToNum(const std::string& s);

// ---- random ---------------------------------------------------------------
void SeedRandom();
int  RandInt(int lo, int hi);          // inclusive
double RandUnit();                     // [0,1)

// ---- logging (debug builds / nashi_debug.txt beside the dll) --------------
void SetLogPath(const std::wstring& dir);
void Log(const std::string& msg);

// ---- 作者むけの知らせ ------------------------------------------------------
// 栞の応答の ErrorLevel / ErrorDescription で SSP に渡す（SSP はエラーログに残す）。nashi_debug.txt にも書く。
// 栞のスレッド（SSP から呼ばれる側）からだけ呼ぶこと。SAORI を待たずに呼んだスレッドからは呼ばない。
// あとで（SSP に渡すときに）、そのときの言語にすることば。tpl は日本語で、{0} {1} … に args をはめる。
// 言語は SSP が起動のあとで知らせてくるので、読みこみのときに起きた知らせも、渡すときに訳す（lang.cpp）。
struct Msg {
    std::string tpl;
    std::vector<std::string> args;
    std::vector<char> trArgs;      // 0 = そのまま、1 = 表で訳す、2 = subs の Msg を、その言語の文にして入れる
    std::vector<Msg> subs;
    Msg() {}
    Msg(const char* t) : tpl(t) {}
    // 文字列から作るときは、はっきり書く（"「" + 名前 + "」…" のように組み立てた文を、うっかり形にしないため）
    explicit Msg(const std::string& t) : tpl(t) {}
    // トーク名・ファイル名など、そのまま入れる値
    Msg& arg(const std::string& a) { args.push_back(a); trArgs.push_back(0); return *this; }
    // 栞のことば（lang.cpp の表にあるもの）で、これも訳して入れる値
    Msg& argTr(const std::string& a) { args.push_back(a); trArgs.push_back(1); return *this; }
    // 別の知らせを、文としてはめる（「書きかえた ghost.json を読めなかったので…。{0}」の {0} に、読めなかったわけ）
    Msg& argMsg(const Msg& m) {
        char n[16];
        sprintf_s(n, "%u", (unsigned)subs.size());
        subs.push_back(m);
        args.push_back(n);
        trArgs.push_back(2);
        return *this;
    }
    bool empty() const { return tpl.empty(); }
};

// notice は、使う人のパソコンのぐあい（ほかのプログラムがファイルを開いている など）で、作者には直せないもの
enum ProblemLevel { kProblemInfo = 0, kProblemNotice = 1, kProblemWarning = 2, kProblemError = 3 };
struct Problem {
    int level;
    std::string place;      // イベントの名前（無ければ空）
    Msg msg;
};
// 同じ知らせは、ResetProblems までに 1 回だけ（「ずっとくりかえす」で毎秒起きても、エラーログを埋めない）。
// SetProblemPlace でイベントの名前を決めておくと、頭に付く
void Report(int level, const Msg& msg);
void SetProblemPlace(const std::string& place);
// ためた知らせを受けとって、空にする
void TakeProblems(std::vector<Problem>& out);
// 知らせたことを忘れる（ghost.json を読みなおしたとき。直したあとに、また起きたら知らせる）
void ResetProblems();

} // namespace nashi
