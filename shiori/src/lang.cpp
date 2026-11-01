// nashi SHIORI - 栞が自分で話すこと・SSP に知らせることの言語（lang.h）
//
// 表は「日本語（もと）, English, 简体中文, 繁體中文, 한국어」の順です。
// ことばを足したら、ここに 1 行足します（tools/check-i18n.js が、足りない・はめこみ違いを見ます）。
// {0} {1} … は、はめる値。選択肢の名前（\q[名前,…] に入るもの）には , と ] を使わないこと。
#include "lang.h"

namespace nashi {

namespace {

struct Row {
    const char* text[kLangCount];
};

const Row kRows[] = {
    // ---- 何も書いていないときの、栞のセリフ（shiori.cpp の BuiltinDefault / BuiltinMenu）
    { { "……いまは、話すことを思いつかないや。",
        "...I can't think of anything to say right now.",
        "……现在想不到要说什么呢。",
        "……現在想不到要說什麼呢。",
        "……지금은 할 말이 떠오르지 않네." } },
    { { "どれくらい話そうか？",
        "How often should I talk?",
        "我该多久说一次话呢？",
        "我該多久說一次話呢？",
        "얼마나 자주 말할까?" } },
    { { "（いまは、だいたい {0}）",
        "(Right now: about {0})",
        "（现在大约{0}）",
        "（現在大約{0}）",
        "(지금은 대략 {0})" } },
    { { "（いまは、静かにしてるよ）",
        "(Right now I'm keeping quiet)",
        "（现在我在保持安静）",
        "（現在我在保持安靜）",
        "(지금은 조용히 있어)" } },
    { { "たくさん（1 分ごと）",
        "A lot (every minute)",
        "多一点（每 1 分钟）",
        "多一點（每 1 分鐘）",
        "많이 (1분마다)" } },
    { { "いつもどおり（{0}）",
        "As usual ({0})",
        "照常（{0}）",
        "照常（{0}）",
        "평소대로 ({0})" } },
    { { "ときどき（10 分ごと）",
        "Sometimes (every 10 minutes)",
        "偶尔（每 10 分钟）",
        "偶爾（每 10 分鐘）",
        "가끔 (10분마다)" } },
    { { "しばらく静かに",
        "Be quiet for a while",
        "暂时安静",
        "暫時安靜",
        "당분간 조용히" } },
    { { "わかった。いつもどおりに話すね。",
        "Okay. I'll talk as usual.",
        "好的，我会照常说话。",
        "好的，我會照常說話。",
        "알았어. 평소대로 말할게." } },
    { { "わかった。しばらく静かにしてるね。\n（ダブルクリックで、また変えられるよ）",
        "Okay. I'll keep quiet for a while.\n(Double-click me to change it again.)",
        "好的，我会安静一阵子。\n（双击我就可以再改回来）",
        "好的，我會安靜一陣子。\n（雙擊我就可以再改回來）",
        "알았어. 당분간 조용히 있을게.\n(더블클릭하면 다시 바꿀 수 있어)" } },
    { { "わかった。だいたい {0}に話すね。",
        "Okay. I'll talk roughly {0}.",
        "好的，我大约{0}说一次话。",
        "好的，我大約{0}說一次話。",
        "알았어. 대략 {0} 말할게." } },
    { { "そう？",
        "Oh, okay.",
        "是吗？",
        "是嗎？",
        "그래?" } },
    { { "{0} 分ごと",
        "every {0} min",
        "每 {0} 分钟",
        "每 {0} 分鐘",
        "{0}분마다" } },
    { { "{0} 秒ごと",
        "every {0} sec",
        "每 {0} 秒",
        "每 {0} 秒",
        "{0}초마다" } },
    { { "ghost.json が読み込めませんでした。",
        "Could not load ghost.json.",
        "无法读取 ghost.json。",
        "無法讀取 ghost.json。",
        "ghost.json을 읽을 수 없었습니다." } },
    { { "（エディタから書き出し直してください）",
        "(Please export it again from the editor.)",
        "（请从编辑器重新导出）",
        "（請從編輯器重新匯出）",
        "(편집기에서 다시 내보내 주세요)" } },
    { { "またね。",
        "See you.",
        "再见。",
        "再見。",
        "또 봐." } },
    { { "はじめまして。\n{0}です。\nよろしくね。",
        "Nice to meet you.\nI'm {0}.\nLet's get along.",
        "初次见面。\n我是{0}。\n请多关照。",
        "初次見面。\n我是{0}。\n請多關照。",
        "처음 만나네.\n나는 {0}(이)야.\n잘 부탁해." } },
    // 本体の名前が書いてないときの、はじめましての名前
    { { "さくら",
        "Sakura",
        "Sakura",
        "Sakura",
        "Sakura" } },
    { { "おかえりなさい。",
        "Welcome back.",
        "欢迎回来。",
        "歡迎回來。",
        "어서 와." } },
    { { "なに？",
        "What is it?",
        "什么事？",
        "什麼事？",
        "왜?" } },
    { { "呼んだ？",
        "Did you call?",
        "叫我吗？",
        "叫我嗎？",
        "불렀어?" } },
    { { "どうしたの？",
        "What's up?",
        "怎么了？",
        "怎麼了？",
        "무슨 일이야?" } },
    { { "なにか話して",
        "Say something",
        "说点什么吧",
        "說點什麼吧",
        "뭔가 말해 줘" } },
    { { "話す多さを変える",
        "Change how often you talk",
        "改变说话的频率",
        "改變說話的頻率",
        "말하는 빈도 바꾸기" } },
    { { "なんでもない",
        "Never mind",
        "没什么",
        "沒什麼",
        "아무것도 아니야" } },
    { { "えへへ。",
        "Hehe.",
        "嘿嘿。",
        "嘿嘿。",
        "에헤헤." } },
    { { "くすぐったいよ。",
        "That tickles.",
        "好痒哦。",
        "好癢喔。",
        "간지러워." } },
    { { "なでなでされちゃった。",
        "I got patted.",
        "被摸头了。",
        "被摸頭了。",
        "쓰다듬어 줬네." } },
    { { "……あんまり触らないで。",
        "...Please don't touch me so much.",
        "……别老是碰我。",
        "……別老是碰我。",
        "……너무 만지지 마." } },
    { { "更新できたよ。\n新しくなったところは、つぎに起動したときからだよ。",
        "Update done.\nThe new parts take effect the next time I start.",
        "更新好了。\n新的部分要等下次启动后才会生效哦。",
        "更新好了。\n新的部分要等下次啟動後才會生效喔。",
        "업데이트했어.\n새로 바뀐 부분은 다음에 시작할 때부터야." } },
    { { "更新できなかったみたい。",
        "Looks like the update failed.",
        "好像没能更新。",
        "好像沒能更新。",
        "업데이트하지 못한 것 같아." } },
    { { "（{0}）",
        "({0})",
        "（{0}）",
        "（{0}）",
        "({0})" } },

    // ---- SSP の開発者ツールへの知らせ（Report）
    { { "ブロックの入れ子が深すぎる（48 段より下）ので、その先は動かしませんでした",
        "Blocks are nested too deeply (more than 48 levels), so the deeper part was not run",
        "积木嵌套太深（超过 48 层），更深的部分没有执行",
        "積木巢狀太深（超過 48 層），更深的部分沒有執行",
        "블록이 너무 깊게 들어가 있어서(48단 초과) 그 아래는 실행하지 않았습니다" } },
    { { "ブロックを 40000 回動かしても終わらなかったので、とちゅうで止めました（「◯の間くりかえす」などから出られなくなっていませんか）",
        "Stopped midway: still not finished after running 40000 blocks (is a \"repeat while\" loop stuck?)",
        "执行了 40000 次积木仍未结束，已中途停止（是不是卡在“当……时重复”之类的循环里了？）",
        "執行了 40000 次積木仍未結束，已中途停止（是不是卡在「當……時重複」之類的迴圈裡了？）",
        "블록을 40000번 실행해도 끝나지 않아 중간에 멈췄습니다(「~인 동안 반복」 등에서 빠져나오지 못하고 있지 않나요?)" } },
    { { "「◯回くりかえす」は 5000 回までなので、5000 回で止めました",
        "\"Repeat N times\" goes up to 5000, so it stopped at 5000",
        "“重复 N 次”最多 5000 次，因此在 5000 次时停止了",
        "「重複 N 次」最多 5000 次，因此在 5000 次時停止了",
        "「N번 반복」은 5000번까지라서 5000번에서 멈췄습니다" } },
    { { "「◯の間くりかえす」が 5000 回をこえても終わらなかったので、止めました（条件が、いつまでも成り立ったままになっていませんか）",
        "\"Repeat while\" did not end after 5000 times, so it was stopped (is the condition always true?)",
        "“当……时重复”超过 5000 次仍未结束，已停止（条件是否一直成立？）",
        "「當……時重複」超過 5000 次仍未結束，已停止（條件是否一直成立？）",
        "「~인 동안 반복」이 5000번을 넘어도 끝나지 않아 멈췄습니다(조건이 계속 참으로 남아 있지 않나요?)" } },
    { { "「よぶ」ブロックに、トークの名前が入っていません",
        "A \"call\" block has no talk name",
        "“调用”积木中没有填写对话名称",
        "「呼叫」積木中沒有填寫對話名稱",
        "「부르기」 블록에 토크 이름이 들어 있지 않습니다" } },
    { { "「{0}」をよぼうとしましたが、その名前のトークがありません",
        "Tried to call \"{0}\", but there is no talk with that name",
        "试图调用“{0}”，但没有这个名称的对话",
        "試圖呼叫「{0}」，但沒有這個名稱的對話",
        "「{0}」을(를) 부르려 했지만 그 이름의 토크가 없습니다" } },
    { { "「{0}」は、いまよんでいる途中なので、もう一度はよびませんでした（自分をよんだり、よび合いがひとまわりしたりしていませんか）",
        "\"{0}\" is already running, so it was not called again (does it call itself, or do calls go round in a circle?)",
        "“{0}”正在调用中，因此没有再次调用（是否调用了自己，或者互相调用绕了一圈？）",
        "「{0}」正在呼叫中，因此沒有再次呼叫（是否呼叫了自己，或者互相呼叫繞了一圈？）",
        "「{0}」은(는) 지금 실행 중이라 다시 부르지 않았습니다(자기 자신을 부르거나, 서로 부르다가 한 바퀴 돌고 있지 않나요?)" } },
    { { "よぶ・よばれるが 16 段より深くなったので、「{0}」はよびませんでした",
        "Calls are nested more than 16 deep, so \"{0}\" was not called",
        "调用嵌套超过 16 层，因此没有调用“{0}”",
        "呼叫巢狀超過 16 層，因此沒有呼叫「{0}」",
        "부르기가 16단보다 깊어져서 「{0}」은(는) 부르지 않았습니다" } },
    { { "SAORI を、答えを待たずに同時に呼びすぎたので、呼びませんでした: {0}",
        "Too many SAORI calls without waiting at once, so it was not called: {0}",
        "同时发出的不等待回应的 SAORI 调用太多，因此没有调用：{0}",
        "同時發出的不等待回應的 SAORI 呼叫太多，因此沒有呼叫：{0}",
        "응답을 기다리지 않는 SAORI 호출이 동시에 너무 많아 부르지 않았습니다: {0}" } },
    { { "SAORI を呼ぶスレッドを作れなかったので、呼びませんでした: {0}",
        "Could not create a thread to call the SAORI, so it was not called: {0}",
        "无法创建调用 SAORI 的线程，因此没有调用：{0}",
        "無法建立呼叫 SAORI 的執行緒，因此沒有呼叫：{0}",
        "SAORI를 부를 스레드를 만들 수 없어 부르지 않았습니다: {0}" } },
    { { "nashi_save.json を開けませんでした（ほかのプログラムが使っているかもしれません）。この回は保存しません",
        "Could not open nashi_save.json (another program may be using it). Nothing will be saved this session",
        "无法打开 nashi_save.json（可能正被其他程序使用）。本次不会保存",
        "無法開啟 nashi_save.json（可能正被其他程式使用）。本次不會儲存",
        "nashi_save.json을 열 수 없었습니다(다른 프로그램이 사용 중일 수 있습니다). 이번에는 저장하지 않습니다" } },
    { { "nashi_save.json が読めず、よけることもできませんでした。この回は保存しません",
        "Could not read nashi_save.json or move it aside. Nothing will be saved this session",
        "无法读取 nashi_save.json，也无法将其移开。本次不会保存",
        "無法讀取 nashi_save.json，也無法將其移開。本次不會儲存",
        "nashi_save.json을 읽을 수 없고 옮겨 둘 수도 없었습니다. 이번에는 저장하지 않습니다" } },
    { { "nashi_save.json が読めなかったので、{0} によけました",
        "Could not read nashi_save.json, so it was moved aside to {0}",
        "无法读取 nashi_save.json，已将其移到 {0}",
        "無法讀取 nashi_save.json，已將其移到 {0}",
        "nashi_save.json을 읽을 수 없어 {0}(으)로 옮겨 두었습니다" } },
    { { "nashi_save.bak.json（ひとつ前の控え）から読みました",
        "Loaded from nashi_save.bak.json (the previous backup)",
        "已从 nashi_save.bak.json（上一份备份）读取",
        "已從 nashi_save.bak.json（上一份備份）讀取",
        "nashi_save.bak.json(이전 백업)에서 읽었습니다" } },
    { { "nashi_save.bak.json も開けませんでした。この回は保存しません",
        "Could not open nashi_save.bak.json either. Nothing will be saved this session",
        "也无法打开 nashi_save.bak.json。本次不会保存",
        "也無法開啟 nashi_save.bak.json。本次不會儲存",
        "nashi_save.bak.json도 열 수 없었습니다. 이번에는 저장하지 않습니다" } },
    { { "書きかえた ghost.json を読めなかったので、前の中身のまま動いています。{0}",
        "Could not read the changed ghost.json, so the previous contents are still running. {0}",
        "无法读取修改后的 ghost.json，仍在使用之前的内容运行。{0}",
        "無法讀取修改後的 ghost.json，仍在使用之前的內容執行。{0}",
        "바뀐 ghost.json을 읽을 수 없어 이전 내용 그대로 동작하고 있습니다. {0}" } },
    { { "栞の中で思わぬことが起きたので、このイベントには答えませんでした",
        "Something unexpected happened inside the SHIORI, so this event got no answer",
        "SHIORI 内部发生了意外，因此没有回应这个事件",
        "SHIORI 內部發生了意外，因此沒有回應這個事件",
        "SHIORI 내부에서 예상치 못한 일이 일어나 이 이벤트에는 응답하지 않았습니다" } },
    { { "「◯秒後によぶ」の「{0}」が、その名前のトークがないので動きませんでした",
        "\"Call after N seconds\" did not run \"{0}\" because there is no talk with that name",
        "“N 秒后调用”的“{0}”没有执行，因为没有这个名称的对话",
        "「N 秒後呼叫」的「{0}」沒有執行，因為沒有這個名稱的對話",
        "「N초 후에 부르기」의 「{0}」은(는) 그 이름의 토크가 없어서 실행되지 않았습니다" } },

    // ---- SAORI が呼べなかったわけ（saori.cpp）
    { { "読み込めなかった SAORI です: {0}",
        "This SAORI could not be loaded: {0}",
        "这是无法载入的 SAORI：{0}",
        "這是無法載入的 SAORI：{0}",
        "읽어 들이지 못한 SAORI입니다: {0}" } },
    { { "SAORI のファイル名が使えません（ゴーストのフォルダの中だけ）: {0}",
        "This SAORI file name cannot be used (only files inside the ghost folder): {0}",
        "无法使用此 SAORI 文件名（仅限人格文件夹内）：{0}",
        "無法使用此 SAORI 檔名（僅限人格資料夾內）：{0}",
        "이 SAORI 파일 이름은 쓸 수 없습니다(고스트 폴더 안에 있는 것만): {0}" } },
    { { "ゴーストのフォルダが分からないので、SAORI を読みません: {0}",
        "The ghost folder is unknown, so the SAORI is not loaded: {0}",
        "不知道人格文件夹的位置，因此不载入 SAORI：{0}",
        "不知道人格資料夾的位置，因此不載入 SAORI：{0}",
        "고스트 폴더를 알 수 없어 SAORI를 읽지 않습니다: {0}" } },
    { { "栞（SHIORI）を SAORI として読むことはできません: {0}",
        "A SHIORI cannot be loaded as a SAORI: {0}",
        "不能将 SHIORI 作为 SAORI 载入：{0}",
        "不能將 SHIORI 作為 SAORI 載入：{0}",
        "SHIORI를 SAORI로 읽을 수는 없습니다: {0}" } },
    { { "SAORI を読み込めません（{0} / エラー {1}）。栞と同じ 32bit の DLL かどうか確かめてください。",
        "Cannot load the SAORI ({0} / error {1}). Check that it is a 32-bit DLL like the SHIORI.",
        "无法载入 SAORI（{0} / 错误 {1}）。请确认它是否和 SHIORI 一样是 32 位 DLL。",
        "無法載入 SAORI（{0} / 錯誤 {1}）。請確認它是否和 SHIORI 一樣是 32 位元 DLL。",
        "SAORI를 읽을 수 없습니다({0} / 오류 {1}). SHIORI와 같은 32비트 DLL인지 확인해 주세요." } },
    { { "SAORI の形をしていません（load / request / unload がありません）: {0}",
        "This is not a SAORI (it has no load / request / unload): {0}",
        "这不是 SAORI（没有 load / request / unload）：{0}",
        "這不是 SAORI（沒有 load / request / unload）：{0}",
        "SAORI 형식이 아닙니다(load / request / unload가 없습니다): {0}" } },
    { { "SAORI の load が失敗しました: {0}",
        "The SAORI's load failed: {0}",
        "SAORI 的 load 失败了：{0}",
        "SAORI 的 load 失敗了：{0}",
        "SAORI의 load가 실패했습니다: {0}" } },
    { { "SAORI の中で例外が起きました: {0}",
        "An exception occurred inside the SAORI: {0}",
        "SAORI 内部发生了异常：{0}",
        "SAORI 內部發生了例外：{0}",
        "SAORI 안에서 예외가 일어났습니다: {0}" } },
    { { "SAORI が何も返しませんでした: {0}",
        "The SAORI returned nothing: {0}",
        "SAORI 没有返回任何内容：{0}",
        "SAORI 沒有回傳任何內容：{0}",
        "SAORI가 아무것도 돌려주지 않았습니다: {0}" } },

    // ---- ghost.json が読めないとき（program.cpp と json.cpp）
    { { "ghost.json が見つかりません",
        "ghost.json was not found",
        "找不到 ghost.json",
        "找不到 ghost.json",
        "ghost.json을 찾을 수 없습니다" } },
    { { "{0} が大きすぎます（16MB まで）",
        "{0} is too large (16 MB at most)",
        "{0} 太大了（最多 16MB）",
        "{0} 太大了（最多 16MB）",
        "{0}이(가) 너무 큽니다(16MB까지)" } },
    { { "{0} を、ほかのプログラムが使っていて開けません",
        "{0} cannot be opened because another program is using it",
        "{0} 正被其他程序使用，无法打开",
        "{0} 正被其他程式使用，無法開啟",
        "다른 프로그램이 {0}을(를) 사용 중이라 열 수 없습니다" } },
    { { "{0} を開けません（読む権限が無い、などのわけで）",
        "Cannot open {0} (for example, no permission to read it)",
        "无法打开 {0}（例如没有读取权限）",
        "無法開啟 {0}（例如沒有讀取權限）",
        "{0}을(를) 열 수 없습니다(읽기 권한이 없는 등의 이유로)" } },
    { { "{0} の {1} 行目 {2} 文字目: {3}",
        "{0} line {1}, column {2}: {3}",
        "{0} 第 {1} 行第 {2} 个字符：{3}",
        "{0} 第 {1} 行第 {2} 個字元：{3}",
        "{0} {1}행 {2}번째 글자: {3}" } },
    { { "ghost.json の中身が { … } のかたちではありません",
        "ghost.json does not contain a { … } object",
        "ghost.json 的内容不是 { … } 的形式",
        "ghost.json 的內容不是 { … } 的形式",
        "ghost.json의 내용이 { … } 형식이 아닙니다" } },
    { { "\\u のあとの 16 進の数が、とちゅうで切れています",
        "the hex number after \\u is cut short",
        "\\u 后面的十六进制数不完整",
        "\\u 後面的十六進位數不完整",
        "\\u 뒤의 16진수가 중간에 끊겼습니다" } },
    { { "\\u のあとに、16 進の数でない文字があります",
        "there is a non-hex character after \\u",
        "\\u 后面有不是十六进制数的字符",
        "\\u 後面有不是十六進位數的字元",
        "\\u 뒤에 16진수가 아닌 글자가 있습니다" } },
    { { "名前（\"…\"）が来るはずのところに、ちがうものがあります",
        "expected a name (\"…\") here",
        "这里应该是名称（\"…\"），却是别的内容",
        "這裡應該是名稱（\"…\"），卻是別的內容",
        "이름(\"…\")이 와야 할 곳에 다른 것이 있습니다" } },
    { { "\\ のあとに、使えない文字があります",
        "a character after \\ is not allowed",
        "\\ 后面有不能使用的字符",
        "\\ 後面有不能使用的字元",
        "\\ 뒤에 쓸 수 없는 글자가 있습니다" } },
    { { "\" で始めた文字が、\" で閉じられないまま終わっています",
        "a string started with \" never ends with \"",
        "以 \" 开头的文字没有用 \" 结束",
        "以 \" 開頭的文字沒有用 \" 結束",
        "\"로 시작한 글자가 \"로 닫히지 않은 채 끝났습니다" } },
    { { "入れ子が深すぎます",
        "nested too deeply",
        "嵌套太深",
        "巢狀太深",
        "너무 깊게 들어가 있습니다" } },
    { { "とちゅうで終わっています",
        "it ends too early",
        "内容中途结束了",
        "內容中途結束了",
        "중간에 끝났습니다" } },
    { { "「:」が来るはずのところに、ちがうものがあります",
        "expected \":\" here",
        "这里应该是“:”，却是别的内容",
        "這裡應該是「:」，卻是別的內容",
        "「:」이 와야 할 곳에 다른 것이 있습니다" } },
    { { "「,」か「}」が来るはずのところに、ちがうものがあります（「,」の書きわすれ？）",
        "expected \",\" or \"}\" here (a missing \",\"?)",
        "这里应该是“,”或“}”，却是别的内容（是不是漏写了“,”？）",
        "這裡應該是「,」或「}」，卻是別的內容（是不是漏寫了「,」？）",
        "「,」나 「}」가 와야 할 곳에 다른 것이 있습니다(「,」를 빠뜨렸나요?)" } },
    { { "「,」か「]」が来るはずのところに、ちがうものがあります（「,」の書きわすれ？）",
        "expected \",\" or \"]\" here (a missing \",\"?)",
        "这里应该是“,”或“]”，却是别的内容（是不是漏写了“,”？）",
        "這裡應該是「,」或「]」，卻是別的內容（是不是漏寫了「,」？）",
        "「,」나 「]」가 와야 할 곳에 다른 것이 있습니다(「,」를 빠뜨렸나요?)" } },
    { { "ここには置けない文字があります",
        "a character that cannot go here",
        "这里有不能放置的字符",
        "這裡有不能放置的字元",
        "여기에 둘 수 없는 글자가 있습니다" } },
};

int g_lang = kLangJa;

} // namespace

int UiLang() { return g_lang; }

void SetUiLang(int lang) {
    if (lang >= 0 && lang < kLangCount) g_lang = lang;
}

int UiLangFromLangId(const std::string& langid) {
    // 10 進（1041）か 16 進（0x0411）。読めないもの・空のときは、いまの言語のまま（知らない形で英語に変えない）
    std::string s = langid;
    while (!s.empty() && (s[0] == ' ' || s[0] == '\t')) s.erase(0, 1);
    long id = 0;
    bool hex = s.size() > 2 && s[0] == '0' && (s[1] == 'x' || s[1] == 'X');
    size_t i = hex ? 2 : 0;
    size_t digits = 0;
    for (; i < s.size() && digits < 8; i++, digits++) {
        char c = s[i];
        int d = (c >= '0' && c <= '9') ? c - '0'
              : (hex && c >= 'a' && c <= 'f') ? c - 'a' + 10
              : (hex && c >= 'A' && c <= 'F') ? c - 'A' + 10 : -1;
        if (d < 0) break;
        id = id * (hex ? 16 : 10) + d;
    }
    if (digits == 0 || i != s.size() || id <= 0 || id > 0xFFFF) return g_lang;
    long primary = id & 0x3FF;
    if (primary == 0x11) return kLangJa;
    if (primary == 0x12) return kLangKo;
    if (primary == 0x04) {
        // 台湾（1028）・香港（3076）・マカオ（5124）・繁体字（31748）は繁体字、
        // ほか（中国 2052・シンガポール 4100・簡体字 4）は簡体字
        return (id == 1028 || id == 3076 || id == 5124 || id == 31748) ? kLangZhTW : kLangZhCN;
    }
    return kLangEn;          // ほかの言語は、英語がいちばん読める人が多い
}

std::string Tr(const std::string& ja, int lang) {
    if (lang <= kLangJa || lang >= kLangCount) return ja;
    for (size_t i = 0; i < sizeof(kRows) / sizeof(kRows[0]); i++) {
        if (ja == kRows[i].text[kLangJa]) return kRows[i].text[lang];
    }
    return ja;
}

std::string Tr(const char* ja, int lang) {
    return Tr(std::string(ja ? ja : ""), lang);
}

std::string FormatMsg(const Msg& m, int lang) {
    std::string s = Tr(m.tpl, lang);
    std::string out;
    out.reserve(s.size() + 32);
    for (size_t i = 0; i < s.size(); i++) {
        // {0} … {9}。argTr で入れた値（JSON が読めないわけ など、栞のことば）だけは、それも訳す
        if (s[i] == '{' && i + 2 < s.size() && s[i + 1] >= '0' && s[i + 1] <= '9' && s[i + 2] == '}') {
            size_t k = (size_t)(s[i + 1] - '0');
            if (k < m.args.size()) {
                char how = k < m.trArgs.size() ? m.trArgs[k] : 0;
                if (how == 2) {
                    size_t at = (size_t)atoi(m.args[k].c_str());
                    if (at < m.subs.size()) out += FormatMsg(m.subs[at], lang);
                } else {
                    out += how == 1 ? Tr(m.args[k], lang) : m.args[k];
                }
            }
            i += 2;
            continue;
        }
        out += s[i];
    }
    return out;
}

} // namespace nashi
