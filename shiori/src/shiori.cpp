#include "shiori.h"
#include "lang.h"
#include "util.h"
#include "version_gen.h"   // NASHI_VERSION（shiori\build.ps1 が VERSION から作る）

#include <cstdio>
#include <cstring>

namespace nashi {

// SSP に名乗る名前。ゴーストの descript.txt の shiori,nashi.dll と同じく、
// これまでのゴーストと入れかえられるよう "nashi" のままにしています。
const char* kShioriName     = "nashi";
const char* kShioriVersion  = NASHI_VERSION;
const char* kShioriCraftman = "nashi-shiori-studio-2";

// ------------------------------------------------------------------ parsing

static std::string LowerAscii(const std::string& s) {
    std::string t = s;
    for (size_t i = 0; i < t.size(); i++) {
        if (t[i] >= 'A' && t[i] <= 'Z') t[i] = (char)(t[i] - 'A' + 'a');
    }
    return t;
}

// Finds the Charset header in raw bytes without decoding first (header names are ASCII).
// 行の頭にある "Charset:" だけを見ます（Reference の中身に書かれた文字にはだまされない）。
static bool RequestIsUtf8(const std::string& raw) {
    size_t pos = 0;
    while (pos < raw.size()) {
        size_t e = raw.find('\n', pos);
        if (e == std::string::npos) e = raw.size();
        if (e - pos >= 8 && LowerAscii(raw.substr(pos, 8)) == "charset:") {
            std::string v = LowerAscii(raw.substr(pos + 8, e - (pos + 8)));
            return v.find("utf-8") != std::string::npos || v.find("utf8") != std::string::npos;
        }
        if (e == pos || (e == pos + 1 && raw[pos] == '\r')) break;   // 空行から先は本文
        pos = e + 1;
    }
    return true;                                            // assume UTF-8
}

bool ParseRequest(const std::string& utf8, ShioriRequest& out) {
    size_t pos = 0;
    bool first = true;
    while (pos <= utf8.size()) {
        size_t e = utf8.find('\n', pos);
        std::string line = (e == std::string::npos) ? utf8.substr(pos) : utf8.substr(pos, e - pos);
        if (!line.empty() && line[line.size() - 1] == '\r') line.erase(line.size() - 1);
        if (first) {
            first = false;
            size_t sp = line.find(' ');
            out.method = (sp == std::string::npos) ? line : line.substr(0, sp);
        } else if (!line.empty()) {
            size_t c = line.find(':');
            if (c != std::string::npos) {
                std::string key = Trim(line.substr(0, c));
                // 外から来た値は、長さを切って、壊れた UTF-8 を直してから使う
                std::string val = CapText(RepairUtf8(Trim(line.substr(c + 1))));
                std::string lk = LowerAscii(key);
                out.headers[lk] = val;
                if (lk == "id") {
                    out.id = val;
                } else if (StartsWith(lk, "reference")) {
                    int idx = atoi(lk.c_str() + 9);
                    if (idx >= 0 && idx < 64) {
                        if ((int)out.refs.size() <= idx) out.refs.resize((size_t)idx + 1);
                        out.refs[(size_t)idx] = val;
                    }
                }
            }
        }
        if (e == std::string::npos) break;
        pos = e + 1;
    }
    return !out.id.empty();
}

// 作者むけの知らせを、ヘッダに置ける 1 行にする。改行・区切りのバイト値 1 などの制御文字ははずし、
// 長すぎるものは切る（UTF-8 の文字のとちゅうでは切らない）
static std::string HeaderSafe(const std::string& s) {
    const size_t kMaxText = 1024;
    std::string t;
    for (size_t i = 0; i < s.size(); i++) {
        unsigned char c = (unsigned char)s[i];
        if (c < 0x20 || c == 0x7F) continue;
        if (t.size() >= kMaxText && (c & 0xC0) != 0x80) { t += "…"; break; }
        t += (char)c;
    }
    return t;
}

// commTo に相手の名前（ゴーストの \0 側の名前）を入れると、
// Value のスクリプトがそのゴーストへの「通信」として届く（SHIORI/3.0 の Reference0）。
static std::string BuildResponse(const std::string& value,
                                 const std::string& commTo = std::string(),
                                 int commAge = 0,
                                 const std::vector<Problem>* problems = NULL) {
    std::string body;
    if (value.empty()) {
        body = "SHIORI/3.0 204 No Content\r\n";
    } else {
        body = "SHIORI/3.0 200 OK\r\n";
    }
    body += "Sender: ";
    body += kShioriName;
    body += "\r\nCharset: UTF-8\r\n";
    if (!value.empty() && !commTo.empty()) {
        std::string t;
        for (size_t i = 0; i < commTo.size(); i++) {   // a header must stay on one line
            char c = commTo[i];
            if (c == '\r' || c == '\n') continue;
            t += c;
        }
        if (!t.empty()) {
            body += "Reference0: " + t + "\r\n";
            // やりとりの世代数。初回が 0 で、返すたびに増える。
            // SSP 側でも「いつまでも続く会話」を止められるようにするためのもの。
            char age[24];
            sprintf_s(age, "Age: %d\r\n", commAge < 0 ? 0 : commAge);
            body += age;
        }
    }
    if (!value.empty()) {
        std::string v;
        v.reserve(value.size());
        for (size_t i = 0; i < value.size(); i++) {       // a header must stay on one line
            char c = value[i];
            if (c == '\r') continue;
            if (c == '\n') { v += "\\n"; continue; }
            v += c;
        }
        body += "Value: " + v + "\r\n";
    }
    // 作者むけの知らせ（SSP はエラーログに残す）。いくつもあるときは、バイト値 1 で区切って同じ数だけ並べる
    if (problems && !problems->empty()) {
        static const char* kLevels[] = { "info", "notice", "warning", "error" };
        std::string levels, texts;
        for (size_t i = 0; i < problems->size(); i++) {
            const Problem& p = (*problems)[i];
            int lv = (p.level >= kProblemInfo && p.level <= kProblemError) ? p.level : kProblemWarning;
            if (i) { levels += '\x01'; texts += '\x01'; }
            levels += kLevels[lv];
            // ここで、いまの SSP の言語にする（言語の知らせより前に起きた知らせも、渡すときの言語で）
            texts += HeaderSafe((p.place.empty() ? std::string() : p.place + ": ") + FormatMsg(p.msg, UiLang()));
        }
        body += "ErrorLevel: " + levels + "\r\n";
        body += "ErrorDescription: " + texts + "\r\n";
    }
    body += "\r\n";
    return body;
}

// -------------------------------------------------------------- file stamps

static unsigned long long FileStamp(const std::wstring& path) {
    WIN32_FILE_ATTRIBUTE_DATA d;
    if (!GetFileAttributesExW(path.c_str(), GetFileExInfoStandard, &d)) return 0;
    unsigned long long t = ((unsigned long long)d.ftLastWriteTime.dwHighDateTime << 32) |
                           d.ftLastWriteTime.dwLowDateTime;
    return t ^ ((unsigned long long)d.nFileSizeLow << 1);
}

// ------------------------------------------------------------------- Shiori

bool Shiori::Load(const std::wstring& moduleDir) {
    dir_ = moduleDir;
    if (!dir_.empty() && dir_[dir_.size() - 1] != L'\\' && dir_[dir_.size() - 1] != L'/') {
        dir_ += L'\\';
    }
    SeedRandom();
    SetLogPath(dir_);
    // 同じ DLL がもう一度 load されたとき、前の回の知らせを持ちこさない
    std::vector<Problem> stale;
    TakeProblems(stale);
    ResetProblems();
    saori_.SetBaseDir(dir_);

    prog_.Load(dir_);
    progStamp_ = FileStamp(dir_ + L"ghost.json") ^ FileStamp(dir_ + L"nashi.json");

    vars_.fromJson(prog_.initialVars());
    LoadSave();

    sys_.uptimeSec = 0;
    sys_.talkCount = 0;
    secondsSinceTalk_ = 0;
    lastSaveSec_ = 0;
    ready_ = true;
    if (prog_.loaded()) Log("loaded");
    else Report(kProblemError, prog_.errorMsg());      // つぎの応答で SSP に渡る（起動のセリフでも言う）
    return true;
}

void Shiori::Unload() {
    if (ready_) SaveSave();
    saori_.UnloadAll();          // 借りた外部モジュールを返す
    ready_ = false;
}

// 保存データ（nashi_save.json）と、そのひとつ前の控え（nashi_save.bak.json）。
// 読めないものは捨てずに nashi_save.broken-日時.json へよけて、控えから読みなおす
// （黙って初めからにすると、つぎの保存で好感度や名前がまるごと上書きされてしまうので）。
void Shiori::LoadSave() {
    std::wstring path = dir_ + L"nashi_save.json";
    int r = LoadSaveFrom(path);
    if (r == kSaveOk || (r == kSaveMissing && !FileExists(dir_ + L"nashi_save.bak.json"))) return;
    if (r == kSaveLocked) {
        // ほかのプログラムが開いているだけ（中身はたぶん無事）。よけたり控えから読んだりせず、
        // この回は保存もしない（読めていない古い値で、無事な本体を上書きしないように）。
        saveBlocked_ = true;
        Report(kProblemNotice, "nashi_save.json を開けませんでした（ほかのプログラムが使っているかもしれません）。この回は保存しません");
        return;
    }
    if (r == kSaveBroken) {
        SYSTEMTIME st;
        GetLocalTime(&st);
        char stamp[32];
        sprintf_s(stamp, "%04d%02d%02d-%02d%02d%02d", st.wYear, st.wMonth, st.wDay,
                  st.wHour, st.wMinute, st.wSecond);
        std::wstring aside = dir_ + L"nashi_save.broken-" + Utf8ToWide(stamp) + L".json";
        if (!MoveFileExW(path.c_str(), aside.c_str(), MOVEFILE_WRITE_THROUGH)) {
            // よけられなかった。このまま保存すると、こわれた本体が控えにまわって、無事な控えを消してしまう
            saveBlocked_ = true;
            Report(kProblemNotice, "nashi_save.json が読めず、よけることもできませんでした。この回は保存しません");
        } else {
            Report(kProblemNotice, Msg("nashi_save.json が読めなかったので、{0} によけました")
                                       .arg(std::string("nashi_save.broken-") + stamp + ".json"));
        }
    }
    // 本体が無い・読めなかったときは、ひとつ前の控えから
    int b = LoadSaveFrom(dir_ + L"nashi_save.bak.json");
    if (b == kSaveOk) {
        Report(kProblemInfo, "nashi_save.bak.json（ひとつ前の控え）から読みました");
        dirty_ = true;                               // つぎの保存で、本体を書きなおす
    } else if (b == kSaveLocked) {
        // 控えも開けない。初めからの値で保存すると、つぎの回に無事な控えを上書きしてしまう
        saveBlocked_ = true;
        Report(kProblemNotice, "nashi_save.bak.json も開けませんでした。この回は保存しません");
    }
}

int Shiori::LoadSaveFrom(const std::wstring& path) {
    std::string text;
    // 自分で UTF-8 で書いたファイルなので、Shift_JIS かもしれないとは考えない
    int r = ReadTextFileWhy(path, text, false);
    if (r == kReadMissing) return kSaveMissing;
    // 開いているだけ・アクセス権が無いときは、こわれているのとは区別する（よけたり上書きしたりしない）
    if (r == kReadLocked || r == kReadDenied) return kSaveLocked;
    if (r != kReadOk) return kSaveBroken;            // 大きすぎる
    JValue v;
    std::string err;
    if (!JsonParse(text, v, err) || !v.isObj()) return kSaveBroken;
    vars_.fromJson(v["vars"]);                       // saved values win over defaults
    sys_.bootCount = v["boots"].asInt(0);
    sys_.firstBoot = v["firstBoot"].asStr();
    sys_.lastBoot = v["lastBoot"].asStr();

    // 前回どのトークを出したかも覚えておく（起動しなおした直後の重複を防ぐ）
    const JValue& recent = v["recentTalks"];
    for (size_t i = 0; i < recent.size(); i++) {
        std::string id = recent.at(i).asStr();
        if (!id.empty()) sys_.recentTalks.push_back(id);
    }
    if (!sys_.recentTalks.empty()) sys_.lastTalk = sys_.recentTalks[0];
    sys_.lastSeen = v["lastSeen"].asStr();
    return kSaveOk;
}

void Shiori::SaveSave() {
    if (saveBlocked_) return;                        // 読めなかった回は、上書きしない（LoadSave）
    sys_.lastSeen = TodayYmd();
    JValue root = JValue::makeObj();
    root.set("format", JValue::makeStr("nashi-save/1"));   // あとで形を変えたときに、見分けられるように
    root.set("vars", vars_.toJson());
    root.set("boots", JValue::makeNum(sys_.bootCount));
    root.set("firstBoot", JValue::makeStr(sys_.firstBoot));
    root.set("lastBoot", JValue::makeStr(sys_.lastBoot));
    root.set("lastSeen", JValue::makeStr(sys_.lastSeen));
    JValue recent = JValue::makeArr();
    for (size_t i = 0; i < sys_.recentTalks.size(); i++) {
        recent.arr.push_back(JValue::makeStr(sys_.recentTalks[i]));
    }
    root.set("recentTalks", recent);
    root.set("savedAt", JValue::makeStr(""));
    SYSTEMTIME st;
    GetLocalTime(&st);
    char buf[32];
    sprintf_s(buf, "%04d-%02d-%02d %02d:%02d:%02d", st.wYear, st.wMonth, st.wDay,
              st.wHour, st.wMinute, st.wSecond);
    root.set("savedAt", JValue::makeStr(buf));
    // この回はじめての保存のときだけ、いまの本体（前の回の中身）を控え（nashi_save.bak.json）にまわす。
    // 2 回目からは本体だけを書きかえるので、控えにはいつも「前の回」が残る。
    // 本体の書きかえは、となりに書いてから差しかえる（WriteTextFile）ので、途中で落ちても前の中身が残る。
    std::wstring path = dir_ + L"nashi_save.json";
    if (!rotatedThisSession_ && FileExists(path)) {
        if (!MoveFileExW(path.c_str(), (dir_ + L"nashi_save.bak.json").c_str(),
                         MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
            Log("nashi_save.json を控えにまわせませんでした（控えは前のまま）");
        }
    }
    rotatedThisSession_ = true;
    WriteTextFile(path, root.dump(2));
    dirty_ = false;
}

void Shiori::MaybeReload() {
    unsigned long now = GetTickCount();
    if (lastCheckTick_ != 0 && now - lastCheckTick_ < 3000) return;
    lastCheckTick_ = now;
    unsigned long long stamp = FileStamp(dir_ + L"ghost.json") ^ FileStamp(dir_ + L"nashi.json");
    if (stamp == progStamp_) return;
    progStamp_ = stamp;
    Program fresh;
    if (!fresh.Load(dir_)) {
        // 書きかえたのに動きが変わらない、と迷わないように知らせる（同じ中身のあいだは、1 回だけ）
        Report(kProblemWarning, Msg("書きかえた ghost.json を読めなかったので、前の中身のまま動いています。{0}")
                                    .argMsg(fresh.errorMsg()));
        return;
    }
    prog_ = fresh;
    // add variables that appeared in the new program, keep existing values
    Vars defaults;
    defaults.fromJson(prog_.initialVars());
    for (size_t i = 0; i < defaults.size(); i++) {
        if (!vars_.exists(defaults.at(i).first)) vars_.set(defaults.at(i).first, defaults.at(i).second);
    }
    Log("reloaded ghost.json");
    ResetProblems();                 // 直したあとに、また起きたら知らせる
}

int Shiori::TalkInterval() const {
    // 書いた人が「自動でしゃべる」を切にしたら、使う人がメニューで選んだ多さより先にそれを守る
    const JValue& s = prog_.settings();
    if (!s["randomTalkEnabled"].asBool(true)) return 0;
    // 使う人がメニューで選んだ多さ（-1 は「いつもどおり」＝設定の間隔にしたがう）
    if (vars_.exists("@talkInterval")) {
        int v = (int)vars_.get("@talkInterval").asNum();
        if (v >= 0) return v;
    }
    int iv = s["randomTalkInterval"].asInt(180);
    return iv < 0 ? 0 : iv;
}

static const JValue* PickWeighted(const std::vector<const JValue*>& list) {
    if (list.empty()) return NULL;
    double total = 0;
    for (size_t i = 0; i < list.size(); i++) {
        double w = (*list[i])["weight"].asNum(1.0);
        if (w < 0) w = 0;
        total += w;
    }
    if (total <= 0) return list[(size_t)RandInt(0, (int)list.size() - 1)];
    double r = RandUnit() * total;
    for (size_t i = 0; i < list.size(); i++) {
        double w = (*list[i])["weight"].asNum(1.0);
        if (w < 0) w = 0;
        if (r < w) return list[i];
        r -= w;
    }
    return list[list.size() - 1];
}

std::string Shiori::RunOne(const JValue& script, const ShioriRequest& req) {
    RunCtx ctx;
    ctx.prog = &prog_;
    ctx.vars = &vars_;
    ctx.sys = &sys_;
    ctx.saori = &saori_;
    ctx.refs = req.refs;
    unsigned long before = vars_.version();
    RunScript(script, ctx);
    // 変数が変わったときだけ、保存が要る（毎秒の「ずっとくりかえす」で、
    // 何も変わっていないのに 2 分ごとにセーブを書きなおさないように）
    if (vars_.version() != before) dirty_ = true;
    // 出力を捨てる場合（空だったので別のブロックを試す）は、話しかけ先も覚えない
    if (!ctx.out.empty() && !ctx.commTo.empty()) commTo_ = ctx.commTo;

    // 「N 秒後によぶ」の予約を引き取る（動かすのは、つぎの OnSecondChange）
    const size_t kMaxTimers = 32;
    for (size_t i = 0; i < ctx.later.size() && timers_.size() < kMaxTimers; i++) {
        Timer t;
        t.dueSec = sys_.uptimeSec + ctx.later[i].afterSec;
        t.name = ctx.later[i].name;
        timers_.push_back(t);
    }
    return ctx.out;
}

// このスクリプトを今回の要求で動かしてよいか。
//
//   filter: { "area": "Head", "who": 0 }   マウス系の「だれの・どこを」
//     area が空、who が無いときは「どこでも／どちらでも」。
//     Reference3 = 相手(0=本体/1=相方)、Reference4 = 当たり判定名。
//
//   filter: { "from": "…", "contains": "…" }  ゴースト間通信の「だれが・なんと言ったら」
//     Reference0 = 相手の名前（通信ボックスからなら "user"）、Reference1 = 言われたこと。
//     どちらも「ふくんでいれば一致」。空なら何でも通す。
//
//   everySec: 5                            くりかえしの間隔
//     SSP は OnSecondChange を毎秒送ってくるので、ここで間引く。
//     毎秒まるごと動かすと、それだけで重いゴーストになる。
bool Shiori::Matches(const JValue& script, const ShioriRequest& req) const {
    int every = script["everySec"].asInt(0);
    if (every > 1 && sys_.uptimeSec % every != 0) return false;

    const JValue& f = script["filter"];
    if (!f.isObj()) return true;

    std::string area = f["area"].asStr();
    if (!area.empty()) {
        std::string got = req.refs.size() > 4 ? req.refs[4] : std::string();
        if (LowerAscii(got) != LowerAscii(area)) return false;
    }

    int want = f["who"].asInt(-1);
    if (want >= 0) {
        int scope = req.refs.size() > 3 ? atoi(req.refs[3].c_str()) : 0;
        if (want != scope) return false;
    }

    std::string from = Trim(f["from"].asStr());
    if (!from.empty()) {
        std::string got = req.refs.empty() ? std::string() : req.refs[0];
        if (got.find(from) == std::string::npos) return false;
    }

    std::string keyword = Trim(f["contains"].asStr());
    if (!keyword.empty()) {
        std::string got = req.refs.size() > 1 ? req.refs[1] : std::string();
        if (got.find(keyword) == std::string::npos) return false;
    }
    return true;
}

// しぼり込みの細かさ。「"こんにちは" と言われたら」のように条件を書いたブロックを、
// 条件なしの「話しかけられたとき」より先に使うための目安。
static int Specificity(const JValue& script) {
    const JValue& f = script["filter"];
    if (!f.isObj()) return 0;
    int n = 0;
    if (!f["area"].asStr().empty()) n++;
    if (f["who"].asInt(-1) >= 0) n++;
    if (!f["from"].asStr().empty()) n++;
    if (!f["contains"].asStr().empty()) n++;
    return n;
}

std::string Shiori::RunHandlers(const std::string& eventId, const ShioriRequest& req, bool* found) {
    std::vector<const JValue*> all = prog_.eventScripts(eventId);
    std::vector<const JValue*> list;
    for (size_t i = 0; i < all.size(); i++) {
        if (Matches(*all[i], req)) list.push_back(all[i]);
    }
    if (found) *found = !list.empty();
    if (list.empty()) return std::string();

    // 条件を書いたブロックがあるときは、そちらだけを候補にする
    int best = 0;
    for (size_t i = 0; i < list.size(); i++) {
        int s = Specificity(*list[i]);
        if (s > best) best = s;
    }
    if (best > 0) {
        std::vector<const JValue*> narrowed;
        for (size_t i = 0; i < list.size(); i++) {
            if (Specificity(*list[i]) == best) narrowed.push_back(list[i]);
        }
        list.swap(narrowed);
    }

    // 同じイベントに複数のブロックがあるとき、直前と同じものは避ける
    if (list.size() > 1) {
        std::map<std::string, std::string>::const_iterator prev = lastEventPick_.find(eventId);
        if (prev != lastEventPick_.end()) {
            for (size_t i = 0; i < list.size(); i++) {
                if ((*list[i])["id"].asStr() == prev->second) {
                    list.erase(list.begin() + (long)i);
                    break;
                }
            }
        }
    }

    for (int attempt = 0; attempt < 4 && !list.empty(); attempt++) {
        const JValue* pick = PickWeighted(list);
        if (!pick) break;
        std::string out = RunOne(*pick, req);
        if (!out.empty()) {
            lastEventPick_[eventId] = (*pick)["id"].asStr();
            return out;
        }
        for (size_t i = 0; i < list.size(); i++) {
            if (list[i] == pick) { list.erase(list.begin() + (long)i); break; }
        }
    }
    return std::string();
}

// 直近に出したトークを何個ぶん避けるか。
// 設定が 0（おまかせ）のときは、トークの数の半分（最大 8）を目安にする。
int Shiori::NoRepeatCount(size_t talkCount) const {
    int n = prog_.settings()["noRepeatCount"].asInt(0);
    if (n <= 0) {
        n = (int)(talkCount / 2);
        if (n > 8) n = 8;
    }
    if (n > (int)talkCount - 1) n = (int)talkCount - 1;   // 全部避けたら選べなくなる
    return n < 0 ? 0 : n;
}

std::string Shiori::PlayRandomTalk(const ShioriRequest& req) {
    std::vector<const JValue*> all = prog_.talkScripts();
    if (all.empty()) return std::string();
    // えらばれやすさが 0 以下のトークは出さない（全部ためすようになったので、ここで外しておく）。
    // ただし全部が 0 なら、これまでどおり、その中から選ぶ。
    {
        std::vector<const JValue*> positive;
        for (size_t i = 0; i < all.size(); i++) {
            if ((*all[i])["weight"].asNum(1.0) > 0) positive.push_back(all[i]);
        }
        if (!positive.empty()) all = positive;
    }

    // 直近に出したものを候補から外す。外しすぎて空になったら、古いほうから戻す。
    int avoid = NoRepeatCount(all.size());
    std::vector<const JValue*> talks;
    while (true) {
        talks.clear();
        for (size_t i = 0; i < all.size(); i++) {
            std::string id = (*all[i])["id"].asStr();
            bool recent = false;
            for (int k = 0; k < avoid && k < (int)sys_.recentTalks.size(); k++) {
                if (sys_.recentTalks[(size_t)k] == id) { recent = true; break; }
            }
            if (!recent) talks.push_back(all[i]);
        }
        if (!talks.empty() || avoid <= 0) break;
        avoid--;
    }
    if (talks.empty()) talks = all;

    // 「もし」で分けてあって今は何も言わないトークもあるので、言うものが見つかるまで全部ためす
    // （以前は 5 回であきらめて、その回はまるごと黙っていた）。
    // 何も言わなかったトークが変えた変数は、これまでどおり残す（「1 ずつ数えて 3 回目だけ話す」のような
    // トークがあるので）。「◯秒後によぶ」の予約だけは捨てる。直近に出したもので外したトークは、
    // ほかが全部だまったときだけ、最後にためす。
    for (int pass = 0; pass < 2; pass++) {
        while (!talks.empty()) {
            const JValue* pick = PickWeighted(talks);
            if (!pick) break;
            size_t timersBefore = timers_.size();
            std::string out = RunOne(*pick, req);
            if (!out.empty()) {
                RememberTalk((*pick)["id"].asStr());
                sys_.talkCount++;
                return out;
            }
            // 何も言わなかったトークの「◯秒後によぶ」は捨てる（だまる回が続くと予約がたまり、
            // 上限 32 をこえて、選択肢などからの本当の予約が入らなくなるので）
            if (timers_.size() > timersBefore) timers_.resize(timersBefore);
            for (size_t i = 0; i < talks.size(); i++) {
                if (talks[i] == pick) { talks.erase(talks.begin() + (long)i); break; }
            }
        }
        if (pass == 0 && avoid > 0) {
            // 直近に出したもの（さっき外したもの）だけを、もう一度並べる
            for (size_t i = 0; i < all.size(); i++) {
                std::string id = (*all[i])["id"].asStr();
                for (int k = 0; k < avoid && k < (int)sys_.recentTalks.size(); k++) {
                    if (sys_.recentTalks[(size_t)k] == id) { talks.push_back(all[i]); break; }
                }
            }
        }
    }
    return std::string();
}

void Shiori::RememberTalk(const std::string& id) {
    sys_.lastTalk = id;
    if (id.empty()) return;
    for (size_t i = 0; i < sys_.recentTalks.size(); i++) {
        if (sys_.recentTalks[i] == id) { sys_.recentTalks.erase(sys_.recentTalks.begin() + (long)i); break; }
    }
    sys_.recentTalks.insert(sys_.recentTalks.begin(), id);
    const size_t kKeep = 16;
    if (sys_.recentTalks.size() > kKeep) sys_.recentTalks.resize(kKeep);
    dirty_ = true;
}

// 待たずに呼んだ SAORI の答えを受け取る。
// 変数への書き込みはここ（主スレッド）だけで行い、別スレッドからは触らせない。
void Shiori::DrainSaori() {
    std::vector<SaoriDone> got;
    saori_.TakeDone(got);
    const size_t kKeep = 32;
    for (size_t i = 0; i < got.size(); i++) {
        if (!got[i].error.empty()) Report(kProblemWarning, got[i].error);
        if (!got[i].into.empty()) {
            vars_.set(got[i].into, Value::Str(got[i].value));
            dirty_ = true;
        }
        saoriDone_.push_back(got[i]);
        // 知らせきれないほど溜まったら、古いものから捨てる
        if (saoriDone_.size() > kKeep) saoriDone_.erase(saoriDone_.begin());
    }
}

// さくらスクリプトから \-（ゴーストを終了する）をはずす。\\（文字の \）のあとの - は残す
static std::string WithoutCloseTag(const std::string& script) {
    std::string out;
    out.reserve(script.size());
    for (size_t i = 0; i < script.size(); i++) {
        if (script[i] == '\\' && i + 1 < script.size()) {
            if (script[i + 1] == '-') { i++; continue; }
            out += script[i];
            out += script[++i];          // \\ や \n などは、2 文字ごとそのまま
            continue;
        }
        out += script[i];
    }
    return out;
}

// 栞が自分で言うことば（lang.cpp の表）を、SSP の言語で、さくらスクリプトの文にする（改行は \n タグに）
static std::string Say(const Msg& m) {
    return EscapeText(FormatMsg(m, UiLang()));
}

// 選択肢の名前（\q[名前,ID] の名前）。区切りに使う , と ] は入れない（訳でまぎれこんでも、こわさない）
static std::string QLabel(const Msg& m) {
    std::string s = FormatMsg(m, UiLang());
    std::string out;
    for (size_t i = 0; i < s.size(); i++) {
        if (s[i] == ',' || s[i] == ']' || s[i] == '\\' || s[i] == '\r' || s[i] == '\n') continue;
        out += s[i];
    }
    return out;
}

// 「N 分ごと」「N 秒ごと」の言いかた
static std::string IntervalWords(long sec) {
    if (sec % 60 == 0) return FormatMsg(Msg("{0} 分ごと").arg(NumToStr((double)(sec / 60))), UiLang());
    return FormatMsg(Msg("{0} 秒ごと").arg(NumToStr((double)sec)), UiLang());
}

// 書いていないときのダブルクリックのメニュー（BuiltinDefault の OnMouseDoubleClick）から選ばれたもの。
// 話す多さは @talkInterval に入れる（保存されるので、つぎに起動しても続く。TalkInterval が見る）。
std::string Shiori::BuiltinMenu(const std::string& target, const ShioriRequest& req) {
    if (target == "nashi.menu.talk") {
        std::string out = PlayRandomTalk(req);
        if (out.empty()) return "\\0\\s[0]" + Say("……いまは、話すことを思いつかないや。");
        talkWait_ = 0;
        return out;
    }
    if (target == "nashi.menu.interval") {
        long now = TalkInterval();
        long usual = prog_.settings()["randomTalkInterval"].asInt(180);
        if (usual <= 0) usual = 180;
        std::string out = "\\0\\s[0]" + Say("どれくらい話そうか？") + "\\n";
        out += now > 0 ? Say(Msg("（いまは、だいたい {0}）").arg(IntervalWords(now))) : Say("（いまは、静かにしてるよ）");
        out += "\\n\\n\\q[" + QLabel("たくさん（1 分ごと）") + ",nashi.menu.iv.60]\\n";
        out += "\\q[" + QLabel(Msg("いつもどおり（{0}）").arg(IntervalWords(usual))) + ",nashi.menu.iv.usual]\\n";
        out += "\\q[" + QLabel("ときどき（10 分ごと）") + ",nashi.menu.iv.600]\\n";
        out += "\\q[" + QLabel("しばらく静かに") + ",nashi.menu.iv.0]";
        return out;
    }
    if (target == "nashi.menu.iv.usual") {
        // 数をおぼえず、設定の間隔にもどす（書いた人があとで間隔を変えたら、それにしたがう）
        vars_.set("@talkInterval", Value::Num(-1));
        dirty_ = true;
        talkWait_ = 0;
        return "\\0\\s[0]" + Say("わかった。いつもどおりに話すね。");
    }
    if (target.compare(0, 14, "nashi.menu.iv.") == 0) {
        long sec = (long)atoi(target.c_str() + 14);
        if (sec < 0) sec = 0;
        if (sec > 86400) sec = 86400;
        vars_.set("@talkInterval", Value::Num((double)sec));
        dirty_ = true;
        talkWait_ = 0;                                       // つぎの間隔は、新しい多さで決めなおす
        if (sec == 0) return "\\0\\s[0]" + Say("わかった。しばらく静かにしてるね。\n（ダブルクリックで、また変えられるよ）");
        return "\\0\\s[0]" + Say(Msg("わかった。だいたい {0}に話すね。").arg(IntervalWords(sec)));
    }
    return "\\0\\s[0]" + Say("そう？");                       // nashi.menu.cancel
}

std::string Shiori::BuiltinDefault(const std::string& id, const ShioriRequest& req) {
    const JValue& meta = prog_.meta();
    std::string name = meta["name"].asStr("ゴースト");
    std::string sakura = meta["sakuraName"].asStr("");
    if (sakura.empty()) sakura = FormatMsg(Msg("さくら"), UiLang());

    if (!prog_.loaded()) {
        if (id == "OnBoot" || id == "OnFirstBoot") {
            return "\\0\\s[0]" + Say("ghost.json が読み込めませんでした。") + "\\n" +
                   Say(prog_.errorMsg()) + "\\n" + Say("（エディタから書き出し直してください）");
        }
        if (id == "OnClose" || id == "OnCloseAll") return "\\0\\s[0]" + Say("またね。") + "\\-";
        return std::string();
    }

    if (id == "OnFirstBoot") {
        return "\\0\\s[0]" + Say(Msg("はじめまして。\n{0}です。\nよろしくね。").arg(sakura));
    }
    if (id == "OnBoot") {
        return "\\0\\s[0]" + Say("おかえりなさい。");
    }
    if (id == "OnClose" || id == "OnCloseAll") {
        return "\\0\\s[0]" + Say("またね。") + "\\-";
    }
    if (id == "OnMouseDoubleClick") {
        static const char* lines[] = { "なに？", "呼んだ？", "どうしたの？" };
        std::string head = "\\0\\s[0]" + Say(lines[RandInt(0, 2)]);
        // ランダムトークがあるゴーストなら、メニューを出す（使う人が、話してもらう・話す多さを変える）。
        // 行き先の ID は nashi.menu.〜（Dispatch の BuiltinMenu で受ける。出した選択肢だけを受け付ける）
        if (prog_.talkScripts().empty()) return head;
        std::string menu = head + "\\n\\n\\q[" + QLabel("なにか話して") + ",nashi.menu.talk]\\n";
        if (prog_.settings()["randomTalkEnabled"].asBool(true)) {
            menu += "\\q[" + QLabel("話す多さを変える") + ",nashi.menu.interval]\\n";
        }
        return menu + "\\q[" + QLabel("なんでもない") + ",nashi.menu.cancel]";
    }
    if (id == "OnNadeNade") {
        std::string area = req.refs.size() > 4 ? req.refs[4] : std::string();
        std::string low = LowerAscii(area);
        if (low == "head") {
            static const char* lines[] = { "えへへ。", "くすぐったいよ。", "なでなでされちゃった。" };
            return "\\0\\s[1]" + Say(lines[RandInt(0, 2)]);
        }
        // むねは、いやがる。それ以外（手や服など）は、書いた人が決めていなければ何も言わない
        // （どこをなでても「触らないで」と言われると、さわってみる気がなくなる）
        if (low == "bust") return "\\0\\s[2]" + Say("……あんまり触らないで。");
        return std::string();
    }
    // ネットワーク更新。ブロックを書いていなくても、結果だけは知らせる。
    // 途中経過（OnUpdateBegin / OnUpdateReady / OnUpdate.On…）は毎回しゃべると
    // うるさいので黙っておき、書きたい人はブロックで書く。
    if (id == "OnUpdateComplete") {
        std::string how = req.refs.empty() ? std::string() : req.refs[0];
        // "none" = 新しいものは無かった。黙っておく（起動のたびに言うとうるさい）
        if (how != "changed") return std::string();
        return "\\0\\s[0]" + Say("更新できたよ。\n新しくなったところは、つぎに起動したときからだよ。");
    }
    if (id == "OnUpdateFailure") {
        std::string why = req.refs.empty() ? std::string() : req.refs[0];
        if (why == "artificial") return std::string();      // 自分でやめたときは黙る
        std::string out = "\\0\\s[0]" + Say("更新できなかったみたい。");
        if (!why.empty()) out += "\\n" + Say(Msg("（{0}）").arg(why));
        return out;
    }

    (void)req;
    (void)name;
    return std::string();
}

// [ … ] の中身を , で分けて返す（\] と \\ は 1 文字として読む）。
// pos は [ の次。終わると ] の次を指す。
static std::vector<std::string> ReadTagArgs(const std::string& s, size_t& pos) {
    std::vector<std::string> args(1);
    while (pos < s.size()) {
        char c = s[pos];
        if (c == '\\' && pos + 1 < s.size()) { args.back() += s[pos + 1]; pos += 2; continue; }
        pos++;
        if (c == ']') break;
        if (c == ',') { args.push_back(std::string()); continue; }
        args.back() += c;
    }
    return args;
}

// 出したスクリプトから、選択肢の行き先と入力ボックスの ID を拾っておく。
// ブロックが作ったものも、「さくらスクリプトをそのまま」に書かれたものも拾えるよう、
// 組み立てた側ではなく、できあがった文字のほうを見る。
void Shiori::RememberOffered(const std::string& script) {
    const size_t kKeep = 128;
    size_t i = 0;
    while (i < script.size()) {
        if (script[i] != '\\') { i++; continue; }
        if (i + 1 < script.size() && script[i + 1] == '\\') { i += 2; continue; }   // \\ は文字
        std::string key;
        size_t pos = std::string::npos;
        if (script.compare(i, 3, "\\q[") == 0)        { pos = i + 3; key = "c"; }
        else if (script.compare(i, 4, "\\_a[") == 0)  { pos = i + 4; key = "a"; }
        else if (script.compare(i, 5, "\\__q[") == 0) { pos = i + 5; key = "a"; }
        else if (script.compare(i, 16, "\\![get,property,") == 0) { pos = i + 3; key = "g"; }
        else if (script.compare(i, 8, "\\![open,") == 0) {
            // 入力ボックスのなかま（文字・日付・時刻・スライダー・パスワード）
            static const char* kBoxes[] = { "inputbox,", "dateinput,", "timeinput,",
                                            "sliderinput,", "passwordinput," };
            for (size_t k = 0; k < sizeof(kBoxes) / sizeof(kBoxes[0]); k++) {
                if (script.compare(i + 8, strlen(kBoxes[k]), kBoxes[k]) == 0) { pos = i + 3; key = "i"; break; }
            }
        }
        if (pos == std::string::npos) { i++; continue; }
        std::vector<std::string> a = ReadTagArgs(script, pos);
        i = pos;
        std::string got;
        if (key == "c" && a.size() > 1) got = "c:" + Trim(a[1]);       // \q[ラベル,行き先]
        else if (key == "a")            got = "c:" + Trim(a[0]);       // \_a[行き先]
        else if (key == "i" && a.size() > 2) got = "i:" + Trim(a[2]);  // \![open,〇〇input,ID,…]
        else if (key == "g" && a.size() > 2) got = "e:" + Trim(a[2]);  // \![get,property,イベント,…]
        if (got.size() <= 2) continue;
        for (size_t k = 0; k < offered_.size(); k++) {
            if (offered_[k] == got) { offered_.erase(offered_.begin() + (long)k); break; }
        }
        offered_.push_back(got);
        if (offered_.size() > kKeep) offered_.erase(offered_.begin());
    }
}

bool Shiori::TakeOffered(const std::string& key, bool consume) {
    for (size_t k = 0; k < offered_.size(); k++) {
        if (offered_[k] != key) continue;
        if (consume) offered_.erase(offered_.begin() + (long)k);
        return true;
    }
    return false;
}

// 起動・ゴーストの切り替え・呼び出し。どれも「このゴーストが動きはじめた」ところ。
// shell が空なら、シェル名は変えない（はじめての起動では、SSP はシェル名を知らせてこない）。
// 何日ぶりか・出会った日も、ここで記録する。
void Shiori::NoteBoot(const ShioriRequest& req, const std::string& shell) {
    (void)req;
    sys_.bootCount++;
    if (!shell.empty()) sys_.shellName = shell;
    sys_.ghostName = prog_.meta()["name"].asStr();
    // 何日ぶりか。さいごに会った日（保存した日。動かしたままの日もふくむ）から数える。
    // 前の版の保存データには lastSeen が無いので、そのときは前に起動した日から。
    std::string today = TodayYmd();
    long now = DayNumber(today);
    long last = DayNumber(sys_.lastSeen.empty() ? sys_.lastBoot : sys_.lastSeen);
    // 時計がおかしかった回の日付（2026 年より前・きょうより先）からは数えない
    const long kFloor = DayNumber("2026-01-01");
    sys_.daysSinceLast = (last < kFloor || now < last) ? 0 : (int)(now - last);
    // 出会った日。時計がおかしい（2026 年より前・きょうより先）ものは信じず、きょうにする。
    // きょう自体がおかしいときは、決めずにおく（つぎに時計が正しいときに決まる）。
    long first = DayNumber(sys_.firstBoot);
    if (now >= kFloor && (first < kFloor || first > now)) sys_.firstBoot = today;
    sys_.lastBoot = today;
    dirty_ = true;
}

static std::string RefAt(const ShioriRequest& req, size_t i) {
    return req.refs.size() > i ? req.refs[i] : std::string();
}

// SSP は要求に Status: を付けて、いまのようすを知らせてくる（talking,choosing,minimizing など）。
// しゃべっている途中・選択肢を出している途中に割りこむと、出ているセリフや選択肢を消してしまう。
static bool StatusHas(const ShioriRequest& req, const char* word) {
    std::string s = LowerAscii(req.header("status"));
    return s.find(word) != std::string::npos;
}
static bool StatusBusy(const ShioriRequest& req) {
    return StatusHas(req, "talking") || StatusHas(req, "choosing") || StatusHas(req, "timecritical");
}

// いま、こちらからしゃべりだしてよいか。
// OnSecondChange / OnMinuteChange は Reference3 にも入れてくる（1 = よい）。
// OnHourTimeSignal の Reference3 はいつも 1 なので、Status: だけを見る。
static bool CanTalkNow(const ShioriRequest& req) {
    if (StatusBusy(req)) return false;
    if ((req.id == "OnSecondChange" || req.id == "OnMinuteChange") &&
        req.refs.size() > 3 && !req.refs[3].empty()) {
        return req.refs[3] == "1";
    }
    return true;
}

// しゃべれないあいだに出たセリフを取っておく（古すぎるものは出さない）
static const long kHeldTalkSec = 60;

// 取っておく。いま取ってあるものより大事でなければ（「◯秒ごと」が時報を）上書きしない。
// 話しかける相手（ゴースト間通信）もいっしょに取っておき、この応答には付けない。
void Shiori::HoldTalk(const std::string& out, int priority) {
    if (out.empty()) return;
    bool free = heldTalk_.empty() || sys_.uptimeSec - heldAtSec_ > kHeldTalkSec;
    if (free || priority >= heldPriority_) {
        heldTalk_ = out;
        heldAtSec_ = sys_.uptimeSec;
        heldPriority_ = priority;
        heldCommTo_ = commTo_;
    }
    commTo_.clear();
}

std::string Shiori::Dispatch(const ShioriRequest& req) {
    const std::string& id = req.id;

    // OnBoot の Reference0 はシェル名。OnFirstBoot の Reference0 は消滅した回数なので、シェル名にはしない
    if (id == "OnBoot") NoteBoot(req, RefAt(req, 0));
    if (id == "OnFirstBoot") NoteBoot(req, std::string());
    // ほかのゴーストから切り替わって来たとき・呼ばれたときは OnBoot が来ない。
    // シェルの名前は Reference7 に入っている（SSP）。
    if (id == "OnGhostChanged" || id == "OnGhostCalled") NoteBoot(req, RefAt(req, 7));
    if (id == "OnShellChanged") sys_.shellName = RefAt(req, 0);

    // SSP の言語。起動のとき（NOTIFY）と、使う人が切りかえたときに来る（Reference1 が言語 ID）。
    // 栞が自分で言うことばと、SSP の開発者ツールへの知らせを、この言語にする（書いた人のセリフは変えない）
    if (id == "OnLanguageChange") {
        SetUiLang(UiLangFromLangId(RefAt(req, 1)));
        langKnown_ = true;
    }

    // SSP が起動のとき（と、変わったとき）に知らせてくるもの。情報ブロックで読める。
    if (id == "OnNotifyUserInfo") {
        sys_.userName = RefAt(req, 0);
        // 誕生日は「2003,5,5」の形
        std::string bd = RefAt(req, 2);
        size_t c1 = bd.find(','), c2 = c1 == std::string::npos ? c1 : bd.find(',', c1 + 1);
        if (c2 != std::string::npos) {
            int m = atoi(bd.c_str() + c1 + 1), d = atoi(bd.c_str() + c2 + 1);
            sys_.birthMonth = (m >= 1 && m <= 12) ? m : 0;
            sys_.birthDay = (d >= 1 && d <= 31) ? d : 0;
        }
    }
    if (id == "basewareversion") sys_.baseware = RefAt(req, 0);

    if (id == "OnSecondChange") {
        sys_.uptimeSec++;

        // いましゃべってよいか。SSP は Reference3 に入れてくる（1 = よい）。
        // しゃべっている途中・選択肢を待っている途中などは 0 になる。
        // ここで割りこむと、出ている選択肢やセリフを消してしまう。
        bool canTalk = CanTalkNow(req);
        // 最小化されているあいだは、ひとりでにはしゃべらない（ランダムトークの時計も止める）
        bool minimized = StatusHas(req, "minimizing");

        // ランダムトークの時計は、しゃべれるあいだだけ進める（長いセリフの最中は数えない）。
        // 使う人がしばらくさわっていない（Reference4 が 10 分以上）ときは、半分の速さにして控えめに。
        if (canTalk && !minimized) {
            long idle = (long)atoi(RefAt(req, 4).c_str());
            if (idle < 600 || (sys_.uptimeSec % 2) == 0) secondsSinceTalk_++;
        }

        // 待たずに呼んだ SAORI の答えが届いていたら、まずそれを知らせる。
        // SSP は毎秒たたいてくるので、ここを受け取り口にしている。
        while (canTalk && !saoriDone_.empty()) {
            SaoriDone d = saoriDone_.front();
            saoriDone_.erase(saoriDone_.begin());
            ShioriRequest ev = req;
            ev.id = "OnSaoriDone";
            ev.refs.clear();
            ev.refs.push_back(d.file);
            ev.refs.push_back(d.value);
            bool sfound = false;
            std::string sout = RunHandlers("OnSaoriDone", ev, &sfound);
            if (!sout.empty()) { secondsSinceTalk_ = 0; return sout; }
            // 受け取るブロックが無いなら、残りも同じ。変数には入っているので捨てる。
            if (!sfound) { saoriDone_.clear(); break; }
        }

        // 「N 秒後によぶ」の予約。時間が来たものを 1 つだけ動かす
        // （同じ秒に 2 つ来ても、返せる返事は 1 つなので、残りは次の秒へ）。
        // しゃべれないあいだは、時間が来たものも次の機会まで取っておく。
        for (size_t i = 0; canTalk && i < timers_.size(); i++) {
            if (timers_[i].dueSec > sys_.uptimeSec) continue;
            std::string name = timers_[i].name;
            timers_.erase(timers_.begin() + (long)i);
            const JValue* fn = prog_.functionByName(name);
            if (!fn) fn = prog_.scriptById(name);
            if (!fn) {
                Report(kProblemWarning, Msg("「◯秒後によぶ」の「{0}」が、その名前のトークがないので動きませんでした").arg(name));
                break;
            }
            std::string out = RunOne(*fn, req);
            if (!out.empty()) { secondsSinceTalk_ = 0; return out; }
            break;
        }

        // 「◯秒ごと」のかたまりは、しゃべれなくても動かす（変数を変えるだけのものもあるので）。
        // しゃべれないときに出たセリフは、取っておいて、しゃべれるようになってから出す。
        bool found = false;
        std::string out = RunHandlers(id, req, &found);
        if (!heldTalk_.empty() && sys_.uptimeSec - heldAtSec_ > kHeldTalkSec) heldTalk_.clear();   // 古すぎる
        if (canTalk && !heldTalk_.empty()) {
            // しゃべれるようになったので、取っておいたものを出す。この秒の「◯秒ごと」は動かしたうえで、
            // 出たセリフがあれば、こんどはそれを取っておく（変数の変化は失わない）
            std::string held = heldTalk_;
            std::string heldComm = heldCommTo_;
            heldTalk_.clear();
            HoldTalk(out, 0);
            commTo_ = heldComm;
            secondsSinceTalk_ = 0;
            return held;
        }
        if (!out.empty()) {
            if (canTalk) { secondsSinceTalk_ = 0; return out; }
            HoldTalk(out, 0);
        }

        if (dirty_ && sys_.uptimeSec - lastSaveSec_ > 120) {
            lastSaveSec_ = sys_.uptimeSec;
            SaveSave();
        }

        // ランダムトーク。間隔は毎回 ±20% ゆらがせて、時計じかけのように聞こえないようにする
        int interval = TalkInterval();
        if (interval > 0 && (talkWait_ <= 0 || talkWaitBase_ != interval)) {
            talkWaitBase_ = interval;
            talkWait_ = (long)interval * RandInt(80, 120) / 100;
            if (talkWait_ < 1) talkWait_ = 1;
        }
        if (canTalk && !minimized && interval > 0 && secondsSinceTalk_ >= talkWait_) {
            std::string talk = PlayRandomTalk(req);
            if (!talk.empty()) {
                secondsSinceTalk_ = 0;
                talkWait_ = 0;                              // つぎの間隔は、つぎに決めなおす
                talkFailStreak_ = 0;
                return talk;
            }
            // どのトークも、いまは何も言わなかった（時間や変数で分けてあるなど）。
            // 間隔をまるごと待たずに、少ししてからもう一度ためす。続けてだまるたびに 15 秒・30 秒・60 秒…と
            // のばし、間隔そのものより長くはしない（何度もためして SAORI などを何度も動かさないように）。
            long retry = 15L << (talkFailStreak_ < 6 ? talkFailStreak_ : 6);
            if (retry > talkWait_) retry = talkWait_;
            talkFailStreak_++;
            secondsSinceTalk_ = talkWait_ - retry;
        }
        return std::string();
    }

    // 同じ場所の上でマウスが動きつづけたら「なでられた」ことにする。
    // SSP は OnMouseMove を細かく送ってくるので、ここで数えて OnNadeNade を作る。
    if (id == "OnMouseMove") {
        // 8 回だと、マウスが上を通っただけで「なでられた」になっていたので、しっかりなでたときだけにする。
        // 反応したあと 5 秒は、続けて反応しない。しゃべっている途中にも割りこまない。
        const int kStrokesNeeded = 20;
        const unsigned long kResetMs = 1500;
        const unsigned long kCooldownMs = 5000;
        std::string scope = req.refs.size() > 3 ? req.refs[3] : std::string();
        std::string area = req.refs.size() > 4 ? req.refs[4] : std::string();
        unsigned long now = GetTickCount();
        std::string key = scope + "/" + area;
        if (key != strokeKey_ || now - strokeTick_ > kResetMs) {
            strokeKey_ = key;
            strokeCount_ = 0;
        }
        strokeTick_ = now;
        strokeCount_++;
        // 当たり判定の外（服のすき間など）はなでたことにしない
        if (!area.empty() && strokeCount_ >= kStrokesNeeded) {
            strokeCount_ = 0;
            bool cooling = lastNadeTick_ != 0 && now - lastNadeTick_ < kCooldownMs;
            if (!cooling && !StatusBusy(req)) {
                bool nadeFound = false;
                std::string out = RunHandlers("OnNadeNade", req, &nadeFound);
                if (out.empty() && !nadeFound) out = BuiltinDefault("OnNadeNade", req);
                // 休むのは、反応したときだけ（何も言わない場所をなでたあとは、すぐほかの場所で反応してよい）
                if (!out.empty()) { lastNadeTick_ = now; secondsSinceTalk_ = 0; return out; }
            }
        }
    }

    // 入力ボックスの答え。「たずねる」ブロックが付けた ID なら、変数に入れる。
    // ID は "nashi:変数名" の形にしてある（interp.cpp の "ask"）。
    // こちらが開いた箱の答えだけを、1 回だけ受け取る。
    if (id == "OnUserInput" && !req.refs.empty()) {
        const std::string& boxId = req.refs[0];
        if (boxId.compare(0, 6, "nashi:") == 0 && boxId.size() > 6 && TakeOffered("i:" + boxId, true)) {
            std::string name = boxId.substr(6);
            vars_.set(name, Value::Str(RefAt(req, 1)));
            dirty_ = true;
        }
    }

    // 「SSP に ◯ をたずねる」の答え。こちらがたずねたぶんだけを、1 回だけ変数に入れる。
    {
        std::string var;
        if (VarFromPropertyEvent(id, var)) {
            if (!var.empty() && TakeOffered("e:" + id, true)) {
                vars_.set(var, Value::Str(RefAt(req, 0)));
                dirty_ = true;
            }
            return std::string();
        }
    }

    // 選択肢・リンクの行き先。こちらが出したものだけを動かす。
    if (id == "OnChoiceSelect" || id == "OnAnchorSelect") {
        std::string target = RefAt(req, 0);
        // 書いていないときのダブルクリックのメニュー（BuiltinDefault）。こちらが出したものだけ
        if (target.compare(0, 11, "nashi.menu.") == 0 && TakeOffered("c:" + target, false)) {
            secondsSinceTalk_ = 0;
            return BuiltinMenu(target, req);
        }
        const JValue* fn = NULL;
        if (TakeOffered("c:" + target, false)) {
            fn = prog_.functionByName(target);
            if (!fn) fn = prog_.scriptById(target);
        }
        if (fn) {
            secondsSinceTalk_ = 0;
            return RunOne(*fn, req);
        }
    }

    // SSP に「1時間ごと」のイベントは OnHourTimeSignal しかない。
    // 以前のエディタは OnHourChange で書き出していたので、そちらも動かす。
    if (id == "OnHourTimeSignal") {
        bool hourFound = false;
        std::string out = RunHandlers(id, req, &hourFound);
        if (!hourFound) out = RunHandlers("OnHourChange", req, &hourFound);
        // しゃべっている途中・選択肢を出している途中なら、時報はあとで（つぎの OnSecondChange で）出す
        if (!out.empty() && !CanTalkNow(req)) { HoldTalk(out, 2); return std::string(); }
        if (!out.empty()) secondsSinceTalk_ = 0;
        return out;
    }

    // 「毎分」も同じく、しゃべれないときはあとで出す
    if (id == "OnMinuteChange" && !CanTalkNow(req)) {
        bool minFound = false;
        std::string out = RunHandlers(id, req, &minFound);
        HoldTalk(out, 1);
        return std::string();
    }

    bool found = false;
    std::string out = RunHandlers(id, req, &found);
    // ほかのゴーストから切り替わって来たときに専用のブロックが無ければ、
    // 「起動したとき」を使う（書いた人の思う「出てきたとき」はたいていそちら）。
    if (!found && (id == "OnGhostChanged" || id == "OnGhostCalled")) {
        out = RunHandlers("OnBoot", req, &found);
        if (!found) out = BuiltinDefault("OnBoot", req);
        found = true;
    }
    // ほかのゴーストへ切りかわるときに専用のブロックが無ければ、「終了するとき」であいさつする。
    // ただし \-（ゴーストを終了する）ははずす（終了ではなく、SSP が切りかえるので）。
    if (!found && id == "OnGhostChanging") {
        out = RunHandlers("OnClose", req, &found);
        if (!found) out = "\\0\\s[0]" + Say("またね。");
        out = WithoutCloseTag(out);
        found = true;
    }
    if (out.empty() && !found) out = BuiltinDefault(id, req);
    if (!out.empty()) secondsSinceTalk_ = 0;

    if (id == "OnClose" || id == "OnCloseAll") {
        if (out.empty()) out = "\\0\\s[0]" + Say("またね。");
        out = CloseScript(out, true);
        SaveSave();
    }
    return out;
}

std::string Shiori::Request(const std::string& rawRequest) {
    std::string utf8 = RequestIsUtf8(rawRequest) ? rawRequest
                                                 : WideToUtf8(MbToWide(rawRequest, 932));
    ShioriRequest req;
    if (!ParseRequest(utf8, req)) return BuildResponse("");
    if (!ready_) return BuildResponse("");

    // module metadata (asked with GET, ID: version / craftman / name)
    if (req.id == "version")  return BuildResponse(kShioriVersion);
    if (req.id == "craftman") return BuildResponse(kShioriCraftman);
    if (req.id == "craftmanw") return BuildResponse(kShioriCraftman);
    if (req.id == "name")     return BuildResponse(kShioriName);

    // ほかのコンピュータから SSTP で届いたもの（SecurityLevel: external）には反応しない。
    // 変数やトークを動かせる入り口を、ネットワークの向こうに開けておかないため。
    if (LowerAscii(req.header("securitylevel")) == "external") return BuildResponse("");

    MaybeReload();
    DrainSaori();

    // 作者むけの知らせ。前からたまっていたもの（読みこみ・保存データ・SAORI の答えなど）はそのまま、
    // このイベントの中で起きたものには、イベントの名前を付けて SSP に渡す
    std::string value;
    commTo_.clear();
    SetProblemPlace(req.id);
    try {
        value = Dispatch(req);
    } catch (...) {
        Report(kProblemError, "栞の中で思わぬことが起きたので、このイベントには答えませんでした");
        value.clear();
    }

    // ゴースト同士で話しかけ合うと止まらなくなることがあるので、
    // 話しかけ返しが続いたら、しゃべるだけにして通信は打ち切る。
    // あいだに OnSecondChange などがはさまっても数えなおさない。かわりに、
    // 1 分だまっていたら別の会話とみなす。相手が付けてきた Age（世代数）も見る。
    if (req.id == "OnCommunicate") {
        const int kMaxCommChain = 8;
        unsigned long now = GetTickCount();
        if (commTick_ != 0 && now - commTick_ > 60000) commChain_ = 0;
        commTick_ = now;
        if (!commTo_.empty()) {
            ++commChain_;
            std::string age = Trim(req.header("age"));
            if (!age.empty()) {
                int theirs = atoi(age.c_str());
                if (theirs >= 0 && theirs < 1000 && theirs + 1 > commChain_) commChain_ = theirs + 1;
            }
            if (commChain_ > kMaxCommChain) commTo_.clear();
        }
    } else if (!commTo_.empty()) {
        commChain_ = 1;                // こちらから始めた通信
    }

    value = CloseScript(value, req.id == "OnClose" || req.id == "OnCloseAll");

    SetProblemPlace(std::string());
    // 起動のときの NOTIFY（OnNotifyOSInfo など）は、SSP の言語の知らせより先に来ることがある。
    // そのあいだは知らせを持っておき、言語が分かってから（か、ふつうのイベントで）渡す
    std::vector<Problem> problems;
    if (langKnown_ || req.method != "NOTIFY") TakeProblems(problems);

    if (req.method == "NOTIFY") return BuildResponse("", std::string(), 0, &problems);
    RememberOffered(value);
    // commChain_ は「何回目のやりとりか」なので、世代数はその 1 つ手前
    return BuildResponse(value, commTo_, commChain_ > 0 ? commChain_ - 1 : 0, &problems);
}

} // namespace nashi
