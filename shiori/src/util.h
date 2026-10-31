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

} // namespace nashi
