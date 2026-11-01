// nashi SHIORI - 栞が自分で話すこと・SSP に知らせることの言語
//
// 栞のことばは日本語がもとで、ほかの言語は lang.cpp の表（日本語 → その言語）で引きます。
// 言語は SSP が知らせてくる OnLanguageChange（SSP の言語設定）に合わせます。知らせが来るまでは日本語。
// 書いた人のブロックのセリフは、ここでは変えません（作者が決めたもの）。
#pragma once

#include "util.h"

#include <string>

namespace nashi {

enum UiLangId { kLangJa = 0, kLangEn = 1, kLangZhCN = 2, kLangZhTW = 3, kLangKo = 4, kLangCount = 5 };

int UiLang();
void SetUiLang(int lang);
// OnLanguageChange の Reference1（言語 ID。1041 = 日本語 など）から。分からなければ英語
int UiLangFromLangId(const std::string& langid);

// 日本語のことばを、その言語にする（表に無ければ日本語のまま）
std::string Tr(const char* ja, int lang);
std::string Tr(const std::string& ja, int lang);
inline std::string Tr(const char* ja) { return Tr(ja, UiLang()); }
// Msg を、その言語の文にする。{0} {1} … にはめる値も、表にあるものは訳す
std::string FormatMsg(const Msg& m, int lang);

} // namespace nashi
