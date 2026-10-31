#include "program.h"
#include "util.h"

namespace nashi {

// ---------------------------------------------------------------- Value

double Value::asNum() const { return isNum ? num : StrToNum(str); }

std::string Value::asStr() const { return isNum ? NumToStr(num) : str; }

bool Value::asBool() const {
    if (isNum) return num != 0.0;
    return !str.empty() && str != "0" && !IEquals(str, "false");
}

// ---------------------------------------------------------------- Vars

Value Vars::get(const std::string& name) const {
    std::map<std::string, size_t>::const_iterator it = index_.find(name);
    if (it == index_.end()) return Value::Num(0);
    return items_[it->second].second;
}

static bool SameValue(const Value& a, const Value& b) {
    if (a.isNum != b.isNum) return false;
    return a.isNum ? a.num == b.num : a.str == b.str;
}

void Vars::set(const std::string& name, const Value& v) {
    std::map<std::string, size_t>::const_iterator it = index_.find(name);
    if (it != index_.end()) {
        Value& cur = items_[it->second].second;
        if (SameValue(cur, v)) return;
        cur = v;
        version_++;
        return;
    }
    if (items_.size() >= 4096) return;
    index_[name] = items_.size();
    items_.push_back(std::make_pair(name, v));
    version_++;
}

bool Vars::exists(const std::string& name) const {
    return index_.find(name) != index_.end();
}

static Value ValueFromJson(const JValue& v) {
    if (v.type == JType::Str) return Value::Str(v.str);
    if (v.type == JType::Bool) return Value::Num(v.b ? 1 : 0);
    return Value::Num(v.asNum(0));
}

void Vars::fromJson(const JValue& v) {
    if (v.isArr()) {
        // [{ "name": "x", "value": 0 }, ...]
        for (size_t i = 0; i < v.size(); i++) {
            const JValue& e = v.at(i);
            std::string name = e["name"].asStr();
            if (name.empty()) continue;
            set(name, ValueFromJson(e["value"]));
        }
    } else if (v.isObj()) {
        // { "x": 0, ... }
        for (size_t i = 0; i < v.obj.size(); i++) {
            set(v.obj[i].first, ValueFromJson(v.obj[i].second));
        }
    }
}

JValue Vars::toJson() const {
    JValue o = JValue::makeObj();
    for (size_t i = 0; i < items_.size(); i++) {
        const Value& v = items_[i].second;
        o.set(items_[i].first, v.isNum ? JValue::makeNum(v.num) : JValue::makeStr(v.str));
    }
    return o;
}

// ---------------------------------------------------------------- Program

bool Program::Load(const std::wstring& dir) {
    loaded_ = false;
    error_.clear();
    root_ = JValue();

    const wchar_t* names[] = { L"ghost.json", L"nashi.json" };
    std::string text;
    // 読めなかったわけは、人が直せるように日本語で残す（起動のときにしゃべり、SSP のエラーログにも出る）
    const char* shown[] = { "ghost.json", "nashi.json" };
    int why = kReadMissing;
    int at = 0;
    for (int i = 0; i < 2; i++) {
        int r = ReadTextFileWhy(dir + names[i], text);
        if (r == kReadOk) { why = kReadOk; at = i; break; }
        if (r != kReadMissing && why == kReadMissing) { why = r; at = i; }   // 見つかったのに読めないほうを伝える
    }
    if (why != kReadOk) {
        std::string name = shown[at];
        if (why == kReadMissing) error_ = "ghost.json が見つかりません";
        else if (why == kReadTooBig) error_ = name + " が大きすぎます（16MB まで）";
        else if (why == kReadLocked) error_ = name + " を、ほかのプログラムが使っていて開けません";
        else error_ = name + " を開けません（読む権限が無い、などのわけで）";
        return false;
    }
    std::string err;
    if (!JsonParse(text, root_, err)) {
        error_ = std::string(shown[at]) + " の " + err;
        return false;
    }
    return Adopt(root_);
}

bool Program::Adopt(const JValue& root) {
    loaded_ = false;
    error_.clear();
    if (&root != &root_) root_ = root;
    if (!root_.isObj()) {
        error_ = "ghost.json の中身が { … } のかたちではありません";
        BuildIndex();
        return false;
    }
    BuildIndex();
    loaded_ = true;
    return true;
}

void Program::BuildIndex() {
    events_.clear();
    talks_.clear();
    byName_.clear();
    byId_.clear();
    const JValue& scripts = root_["scripts"];
    if (!scripts.isArr()) return;            // 配列でなければ、スクリプトは無いものとする
    for (size_t i = 0; i < scripts.arr.size(); i++) {
        const JValue& s = scripts.arr[i];
        std::string id = s["id"].asStr();
        if (!id.empty() && byId_.find(id) == byId_.end()) byId_[id] = i;

        std::string kind = s["kind"].asStr("event");
        if (kind == "function" || kind == "talk") {
            std::string name = s["name"].asStr();
            if (!name.empty() && byName_.find(name) == byName_.end()) byName_[name] = i;
        }
        if (s["disabled"].asBool(false)) continue;
        if (kind == "event") events_[s["event"].asStr()].push_back(i);
        else if (kind == "talk") talks_.push_back(i);
    }
}

const JValue* Program::ScriptAt(size_t i) const {
    const JValue& scripts = root_["scripts"];
    if (!scripts.isArr() || i >= scripts.arr.size()) return NULL;
    return &scripts.arr[i];
}

std::vector<const JValue*> Program::eventScripts(const std::string& eventName) const {
    std::vector<const JValue*> out;
    std::map<std::string, std::vector<size_t> >::const_iterator it = events_.find(eventName);
    if (it == events_.end()) return out;
    for (size_t k = 0; k < it->second.size(); k++) {
        const JValue* s = ScriptAt(it->second[k]);
        if (s) out.push_back(s);
    }
    return out;
}

bool Program::hasEvent(const std::string& eventName) const {
    return events_.find(eventName) != events_.end();
}

std::vector<const JValue*> Program::talkScripts() const {
    std::vector<const JValue*> out;
    for (size_t k = 0; k < talks_.size(); k++) {
        const JValue* s = ScriptAt(talks_[k]);
        if (s) out.push_back(s);
    }
    return out;
}

std::vector<const JValue*> Program::talksInGroup(const std::string& group) const {
    std::vector<const JValue*> out;
    if (group.empty()) return out;
    for (size_t k = 0; k < talks_.size(); k++) {
        const JValue* s = ScriptAt(talks_[k]);
        if (s && (*s)["group"].asStr() == group) out.push_back(s);
    }
    return out;
}

const JValue* Program::functionByName(const std::string& name) const {
    if (name.empty()) return NULL;
    std::map<std::string, size_t>::const_iterator it = byName_.find(name);
    return it == byName_.end() ? NULL : ScriptAt(it->second);
}

const JValue* Program::scriptById(const std::string& id) const {
    if (id.empty()) return NULL;
    std::map<std::string, size_t>::const_iterator it = byId_.find(id);
    return it == byId_.end() ? NULL : ScriptAt(it->second);
}

} // namespace nashi
