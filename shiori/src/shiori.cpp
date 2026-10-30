#include "shiori.h"
#include "util.h"
#include "version_gen.h"   // NASHI_VERSION（shiori\build.ps1 が VERSION から作る）

#include <cstdio>

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

// commTo に相手の名前（ゴーストの \0 側の名前）を入れると、
// Value のスクリプトがそのゴーストへの「通信」として届く（SHIORI/3.0 の Reference0）。
static std::string BuildResponse(const std::string& value,
                                 const std::string& commTo = std::string(),
                                 int commAge = 0) {
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
    Log(prog_.loaded() ? "loaded" : ("load failed: " + prog_.error()));
    return true;
}

void Shiori::Unload() {
    if (ready_) SaveSave();
    saori_.UnloadAll();          // 借りた外部モジュールを返す
    ready_ = false;
}

void Shiori::LoadSave() {
    std::string text;
    // 自分で UTF-8 で書いたファイルなので、Shift_JIS かもしれないとは考えない
    if (!ReadTextFile(dir_ + L"nashi_save.json", text, false)) return;
    JValue v;
    std::string err;
    if (!JsonParse(text, v, err) || !v.isObj()) return;
    vars_.fromJson(v["vars"]);                       // saved values win over defaults
    sys_.bootCount = v["boots"].asInt(0);

    // 前回どのトークを出したかも覚えておく（起動しなおした直後の重複を防ぐ）
    const JValue& recent = v["recentTalks"];
    for (size_t i = 0; i < recent.size(); i++) {
        std::string id = recent.at(i).asStr();
        if (!id.empty()) sys_.recentTalks.push_back(id);
    }
    if (!sys_.recentTalks.empty()) sys_.lastTalk = sys_.recentTalks[0];
}

void Shiori::SaveSave() {
    JValue root = JValue::makeObj();
    root.set("vars", vars_.toJson());
    root.set("boots", JValue::makeNum(sys_.bootCount));
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
    WriteTextFile(dir_ + L"nashi_save.json", root.dump(2));
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
    if (!fresh.Load(dir_)) { Log("reload failed: " + fresh.error()); return; }
    prog_ = fresh;
    // add variables that appeared in the new program, keep existing values
    Vars defaults;
    defaults.fromJson(prog_.initialVars());
    for (size_t i = 0; i < defaults.size(); i++) {
        if (!vars_.exists(defaults.at(i).first)) vars_.set(defaults.at(i).first, defaults.at(i).second);
    }
    Log("reloaded ghost.json");
}

int Shiori::TalkInterval() const {
    if (vars_.exists("@talkInterval")) {
        int v = (int)vars_.get("@talkInterval").asNum();
        if (v >= 0) return v;
    }
    const JValue& s = prog_.settings();
    if (!s["randomTalkEnabled"].asBool(true)) return 0;
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
    RunScript(script, ctx);
    dirty_ = true;
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

    for (int attempt = 0; attempt < 5 && !talks.empty(); attempt++) {
        const JValue* pick = PickWeighted(talks);
        if (!pick) break;
        std::string out = RunOne(*pick, req);
        if (!out.empty()) {
            RememberTalk((*pick)["id"].asStr());
            sys_.talkCount++;
            return out;
        }
        for (size_t i = 0; i < talks.size(); i++) {
            if (talks[i] == pick) { talks.erase(talks.begin() + (long)i); break; }
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
        if (!got[i].into.empty()) {
            vars_.set(got[i].into, Value::Str(got[i].value));
            dirty_ = true;
        }
        saoriDone_.push_back(got[i]);
        // 知らせきれないほど溜まったら、古いものから捨てる
        if (saoriDone_.size() > kKeep) saoriDone_.erase(saoriDone_.begin());
    }
}

std::string Shiori::BuiltinDefault(const std::string& id, const ShioriRequest& req) {
    const JValue& meta = prog_.meta();
    std::string name = meta["name"].asStr("ゴースト");
    std::string sakura = meta["sakuraName"].asStr("さくら");

    if (!prog_.loaded()) {
        if (id == "OnBoot" || id == "OnFirstBoot") {
            return "\\0\\s[0]ghost.json が読み込めませんでした。\\n" +
                   EscapeText(prog_.error()) + "\\n（エディタから書き出し直してください）";
        }
        if (id == "OnClose" || id == "OnCloseAll") return "\\0\\s[0]またね。\\-";
        return std::string();
    }

    if (id == "OnFirstBoot") {
        return "\\0\\s[0]はじめまして。\\n" + EscapeText(sakura) + "です。\\nよろしくね。";
    }
    if (id == "OnBoot") {
        return "\\0\\s[0]おかえりなさい。";
    }
    if (id == "OnClose" || id == "OnCloseAll") {
        return "\\0\\s[0]またね。\\-";
    }
    if (id == "OnMouseDoubleClick") {
        static const char* lines[] = { "なに？", "呼んだ？", "どうしたの？" };
        return std::string("\\0\\s[0]") + lines[RandInt(0, 2)];
    }
    if (id == "OnNadeNade") {
        std::string area = req.refs.size() > 4 ? req.refs[4] : std::string();
        std::string low = LowerAscii(area);
        if (low == "head") {
            static const char* lines[] = { "えへへ。", "くすぐったいよ。", "なでなでされちゃった。" };
            return std::string("\\0\\s[1]") + lines[RandInt(0, 2)];
        }
        return "\\0\\s[2]……あんまり触らないで。";
    }
    // ネットワーク更新。ブロックを書いていなくても、結果だけは知らせる。
    // 途中経過（OnUpdateBegin / OnUpdateReady / OnUpdate.On…）は毎回しゃべると
    // うるさいので黙っておき、書きたい人はブロックで書く。
    if (id == "OnUpdateComplete") {
        std::string how = req.refs.empty() ? std::string() : req.refs[0];
        // "none" = 新しいものは無かった。黙っておく（起動のたびに言うとうるさい）
        if (how != "changed") return std::string();
        return "\\0\\s[0]更新できたよ。\\n新しくなったところは、つぎに起動したときからだよ。";
    }
    if (id == "OnUpdateFailure") {
        std::string why = req.refs.empty() ? std::string() : req.refs[0];
        if (why == "artificial") return std::string();      // 自分でやめたときは黙る
        std::string out = "\\0\\s[0]更新できなかったみたい。";
        if (!why.empty()) out += "\\n（" + EscapeText(why) + "）";
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
        else if (script.compare(i, 17, "\\![open,inputbox,") == 0) { pos = i + 3; key = "i"; }
        if (pos == std::string::npos) { i++; continue; }
        std::vector<std::string> a = ReadTagArgs(script, pos);
        i = pos;
        std::string got;
        if (key == "c" && a.size() > 1) got = "c:" + Trim(a[1]);       // \q[ラベル,行き先]
        else if (key == "a")            got = "c:" + Trim(a[0]);       // \_a[行き先]
        else if (key == "i" && a.size() > 2) got = "i:" + Trim(a[2]);  // \![open,inputbox,ID,…]
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
void Shiori::NoteBoot(const ShioriRequest& req, const std::string& shell) {
    (void)req;
    sys_.bootCount++;
    sys_.shellName = shell;
    sys_.ghostName = prog_.meta()["name"].asStr();
    dirty_ = true;
}

static std::string RefAt(const ShioriRequest& req, size_t i) {
    return req.refs.size() > i ? req.refs[i] : std::string();
}

std::string Shiori::Dispatch(const ShioriRequest& req) {
    const std::string& id = req.id;

    if (id == "OnBoot" || id == "OnFirstBoot") NoteBoot(req, RefAt(req, 0));
    // ほかのゴーストから切り替わって来たとき・呼ばれたときは OnBoot が来ない。
    // シェルの名前は Reference7 に入っている（SSP）。
    if (id == "OnGhostChanged" || id == "OnGhostCalled") NoteBoot(req, RefAt(req, 7));
    if (id == "OnShellChanged") sys_.shellName = RefAt(req, 0);

    if (id == "OnSecondChange") {
        sys_.uptimeSec++;
        secondsSinceTalk_++;

        // いましゃべってよいか。SSP は Reference3 に入れてくる（1 = よい）。
        // しゃべっている途中・選択肢を待っている途中などは 0 になる。
        // ここで割りこむと、出ている選択肢やセリフを消してしまう。
        bool canTalk = true;
        if (req.refs.size() > 3 && !req.refs[3].empty()) canTalk = (req.refs[3] == "1");

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
            if (!fn) { Log("later: そんな名前のトークはありません: " + name); break; }
            std::string out = RunOne(*fn, req);
            if (!out.empty()) { secondsSinceTalk_ = 0; return out; }
            break;
        }

        bool found = false;
        std::string out = RunHandlers(id, req, &found);
        if (!out.empty()) { secondsSinceTalk_ = 0; return out; }

        if (dirty_ && sys_.uptimeSec - lastSaveSec_ > 120) {
            lastSaveSec_ = sys_.uptimeSec;
            SaveSave();
        }

        int interval = TalkInterval();
        if (canTalk && interval > 0 && secondsSinceTalk_ >= interval) {
            secondsSinceTalk_ = 0;
            return PlayRandomTalk(req);
        }
        return std::string();
    }

    // 同じ場所の上でマウスが動きつづけたら「なでられた」ことにする。
    // SSP は OnMouseMove を細かく送ってくるので、ここで数えて OnNadeNade を作る。
    if (id == "OnMouseMove") {
        const int kStrokesNeeded = 8;
        const unsigned long kResetMs = 1500;
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
            bool nadeFound = false;
            std::string out = RunHandlers("OnNadeNade", req, &nadeFound);
            if (out.empty() && !nadeFound) out = BuiltinDefault("OnNadeNade", req);
            if (!out.empty()) { secondsSinceTalk_ = 0; return out; }
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

    // 選択肢・リンクの行き先。こちらが出したものだけを動かす。
    if (id == "OnChoiceSelect" || id == "OnAnchorSelect") {
        std::string target = RefAt(req, 0);
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
        if (!out.empty()) secondsSinceTalk_ = 0;
        return out;
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
    if (out.empty() && !found) out = BuiltinDefault(id, req);
    if (!out.empty()) secondsSinceTalk_ = 0;

    if (id == "OnClose" || id == "OnCloseAll") {
        if (out.empty()) out = "\\0\\s[0]またね。";
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

    std::string value;
    commTo_.clear();
    try {
        value = Dispatch(req);
    } catch (...) {
        Log("exception while handling " + req.id);
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
    if (req.method == "NOTIFY") return BuildResponse("");
    RememberOffered(value);
    // commChain_ は「何回目のやりとりか」なので、世代数はその 1 つ手前
    return BuildResponse(value, commTo_, commChain_ > 0 ? commChain_ - 1 : 0);
}

} // namespace nashi
