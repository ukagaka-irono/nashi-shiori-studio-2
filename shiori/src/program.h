// nashi SHIORI - the block program (ghost.json) and its runtime state
#pragma once

#include "json.h"

#include <string>
#include <vector>
#include <map>

namespace nashi {

// ---------------------------------------------------------------- Value
// A dynamically typed value; everything is either a number or a string.
struct Value {
    bool isNum;
    double num;
    std::string str;

    Value() : isNum(true), num(0.0) {}
    static Value Num(double v) { Value x; x.isNum = true; x.num = v; return x; }
    static Value Str(const std::string& s) { Value x; x.isNum = false; x.str = s; return x; }
    static Value Bool(bool b) { return Num(b ? 1.0 : 0.0); }

    double asNum() const;
    std::string asStr() const;
    bool asBool() const;
};

// ---------------------------------------------------------------- Vars
class Vars {
public:
    Value get(const std::string& name) const;
    void  set(const std::string& name, const Value& v);
    bool  exists(const std::string& name) const;
    void  clear() { items_.clear(); index_.clear(); version_++; }

    void   fromJson(const JValue& v);   // { "name": value, ... } or [ {name,value}, ... ]
    JValue toJson() const;

    size_t size() const { return items_.size(); }
    const std::pair<std::string, Value>& at(size_t i) const { return items_[i]; }

    // 値がほんとうに変わるたびに 1 増える（保存が要るかを見るため）
    unsigned long version() const { return version_; }

private:
    // 並びは書いた順のまま保つ（セーブの見た目が毎回入れかわらないように）。
    // 探すのは index_ で（変数が多いゴーストでも、1 回で見つかる）。
    std::vector<std::pair<std::string, Value> > items_;
    std::map<std::string, size_t> index_;
    unsigned long version_ = 0;
};

// ---------------------------------------------------------------- Program
class Program {
public:
    // Loads <dir>ghost.json (falls back to nashi.json). Returns false when absent/broken.
    bool Load(const std::wstring& dir);
    // すでに読みこんである JSON を、そのままプログラムとして使います。
    // （スタジオのプレビューが、ファイルを介さずに渡してきます）
    bool Adopt(const JValue& root);
    bool loaded() const { return loaded_; }
    const std::string& error() const { return error_; }

    const JValue& root() const { return root_; }
    const JValue& meta() const { return root_["meta"]; }
    const JValue& settings() const { return root_["settings"]; }
    const JValue& initialVars() const { return root_["variables"]; }

    // scripts
    std::vector<const JValue*> eventScripts(const std::string& eventName) const;
    std::vector<const JValue*> talkScripts() const;
    // 同じ「まとまり」に入れたランダムトークだけを集める（朝のトーク、など）
    std::vector<const JValue*> talksInGroup(const std::string& group) const;
    const JValue* functionByName(const std::string& name) const;
    const JValue* scriptById(const std::string& id) const;
    bool hasEvent(const std::string& eventName) const;

private:
    void BuildIndex();
    const JValue* ScriptAt(size_t i) const;

    JValue root_;
    bool loaded_ = false;
    std::string error_;

    // 読みこんだときに一度だけ作る索引（scripts の何番目か）。
    // SSP は OnMouseMove を 1 秒に何十回も送ってくるので、そのたびに全部を
    // 端から見ていくと重い。番号で持つのは、Program がまるごと写されても使えるようにするため。
    std::map<std::string, std::vector<size_t> > events_;
    std::vector<size_t> talks_;
    std::map<std::string, size_t> byName_;    // function / talk の name（先に書いたほうが勝つ）
    std::map<std::string, size_t> byId_;
};

} // namespace nashi
