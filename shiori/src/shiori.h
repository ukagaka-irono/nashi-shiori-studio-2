// nashi SHIORI - SHIORI/3.0 protocol handling and event dispatch
#pragma once

#include "program.h"
#include "interp.h"

#include <string>
#include <map>
#include <vector>

namespace nashi {

extern const char* kShioriName;
extern const char* kShioriVersion;
extern const char* kShioriCraftman;

struct ShioriRequest {
    std::string method;                              // GET / NOTIFY
    std::string id;                                  // ID header
    std::vector<std::string> refs;                   // Reference0..N
    std::map<std::string, std::string> headers;      // everything, lower-cased keys
    bool utf8 = true;

    // header value by lower-cased name ("" when absent)
    std::string header(const char* lowerName) const {
        std::map<std::string, std::string>::const_iterator it = headers.find(lowerName);
        return it == headers.end() ? std::string() : it->second;
    }
};

class Shiori {
public:
    bool Load(const std::wstring& moduleDir);
    void Unload();
    // rawRequest is the exact bytes handed over by the baseware.
    std::string Request(const std::string& rawRequest);

private:
    std::string Dispatch(const ShioriRequest& req);
    std::string RunHandlers(const std::string& eventId, const ShioriRequest& req, bool* found);
    std::string PlayRandomTalk(const ShioriRequest& req);
    std::string BuiltinDefault(const std::string& eventId, const ShioriRequest& req);
    void MaybeReload();
    void LoadSave();
    void SaveSave();
    bool Matches(const JValue& script, const ShioriRequest& req) const;
    std::string RunOne(const JValue& script, const ShioriRequest& req);
    int TalkInterval() const;
    int NoRepeatCount(size_t talkCount) const;
    void RememberTalk(const std::string& id);
    void DrainSaori();          // 待たずに呼んだ SAORI の答えを受け取る
    void RememberOffered(const std::string& script);
    void HoldTalk(const std::string& out, int priority);
    bool TakeOffered(const std::string& key, bool consume);
    void NoteBoot(const ShioriRequest& req, const std::string& shell);

    std::wstring dir_;
    Program prog_;
    Vars vars_;
    SysInfo sys_;
    Saori saori_;              // 外部モジュール（読み込んだものを終了まで持つ）
    // 待たずに呼んだ SAORI の、まだ知らせていない答え（OnSaoriDone のもと）
    std::vector<SaoriDone> saoriDone_;

    // 「N 秒後によぶ」の予約。dueSec は起動してからの秒数。
    struct Timer {
        long dueSec;
        std::string name;
    };
    std::vector<Timer> timers_;
    bool ready_ = false;
    // ランダムトークまでの、しゃべれるあいだに数えた秒数と、つぎに話すまでの秒数
    // （設定の間隔に ±20% のゆらぎを付けて、毎回決めなおす。talkWaitBase_ はそのもとにした間隔）
    long secondsSinceTalk_ = 0;
    long talkWait_ = 0;
    long talkWaitBase_ = 0;
    // しゃべれないあいだに「◯秒ごと」「毎分」「1時間ごと」が出したセリフ。しゃべれるようになったら出す
    // heldPriority_ は 2 = 1時間ごと、1 = 毎分、0 = ◯秒ごと（大事なほうを、あとから来たもので消さない）。
    // heldCommTo_ は、そのセリフを話しかける相手（ゴースト間通信）
    std::string heldTalk_;
    long heldAtSec_ = 0;
    int heldPriority_ = 0;
    std::string heldCommTo_;
    // ランダムトークが続けて何も言わなかった回数（もう一度ためすまでを、だんだん長くする）
    int talkFailStreak_ = 0;
    long lastSaveSec_ = 0;
    unsigned long long progStamp_ = 0;
    unsigned long lastCheckTick_ = 0;
    bool dirty_ = false;

    // 同じイベントで直前に選んだブロック（続けて同じ反応にならないように）
    std::map<std::string, std::string> lastEventPick_;

    // ゴースト間通信（この応答を届ける相手と、話しかけ合いが続いた回数）
    std::string commTo_;
    int commChain_ = 0;
    unsigned long commTick_ = 0;     // 最後に OnCommunicate を受けた時刻

    // こちらが出した選択肢の行き先と、入力ボックスの ID。
    // SSP から返ってきた OnChoiceSelect / OnUserInput は、ここにあるものだけ受け付ける
    // （SSTP を送れる相手なら誰でも、同じイベントを作れてしまうため）。
    std::vector<std::string> offered_;

    // なで判定（OnMouseMove を数えて OnNadeNade を作る）
    std::string strokeKey_;
    int strokeCount_ = 0;
    unsigned long strokeTick_ = 0;
    unsigned long lastNadeTick_ = 0;   // さいごになでられた時刻（すぐ続けて反応しないように）
};

// exposed for the test host
bool ParseRequest(const std::string& utf8, ShioriRequest& out);

} // namespace nashi
