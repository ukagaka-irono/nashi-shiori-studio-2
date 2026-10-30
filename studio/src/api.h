// なしスタジオ - /api/* と UI ファイルの配信
#pragma once

#include "webreq.h"
#include "json.h"
#include "sstp.h"
#include "fsutil.h"

#include <string>
#include <map>

namespace nashi {

class Api {
public:
    void Init();
    void Handle(const HttpRequest& req, HttpResponse& res);

    const std::wstring& projectsDir() const { return projectsDir_; }
    const std::wstring& outputDir() const { return outputDir_; }

    // ウィンドウの大きさなどの記憶用
    JValue LoadConfig() const;
    void SaveConfig(const std::string& key, const JValue& value);

private:
    void HandleApi(const HttpRequest& req, HttpResponse& res);
    std::string DllBytes() const;
    std::string DllSource() const;      // どこの nashi.dll を使うか（無ければ空）。中身は読まない
    std::wstring DefaultOutDir() const;
    SspInfo Ssp() const;
    std::string ProjectTitle(const std::wstring& file, const FILETIME& modified,
                             unsigned long long size);

    std::wstring exeDir_;
    std::wstring projectsDir_;
    std::wstring outputDir_;
    std::wstring configPath_;

    // 短時間に何度も探しにいかないための控え
    mutable SspInfo sspCache_;
    mutable unsigned long sspCacheTick_ = 0;

    // プロジェクトの一覧に出す名前。ファイルが変わっていなければ、読みなおさない
    // （一覧は 30 秒ごとに取りなおすので、毎回ぜんぶ読んで解析すると重い）。
    struct TitleCache {
        FILETIME modified;
        unsigned long long size;
        std::string title;
    };
    std::map<std::wstring, TitleCache> titles_;
};

} // namespace nashi
