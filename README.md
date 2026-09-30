# LinguaportaFuck

Chrome 拡張で Linguaporta の問題文と選択肢を読み取り、AIによるヒント生成を支援するツールです。  
従来の Moodle 問題ページにも引き続き対応しています。
現在は複数API（OpenAI / Gemini / OpenRouter）に対応しています。

## 現在の動作（2026-09 時点）

### 1. モデル選択とフォールバック

- デフォルトの優先順は `OpenAI -> Gemini -> OpenRouter`。キー未設定のプロバイダは自動でスキップされる。廃止済みプロバイダを含む保存設定は、その位置を OpenAI に置き換えて移行する。
- OpenAI 公式 API では、データ共有特典へオプトイン済みの対象アカウントで無料トークン対象となる `gpt-5.6-luna` を先に使用し、通信失敗または回答検証失敗時に `gpt-5.6-terra` へフォールバックする。
- Linguaportaで `#false_msg` が表示された不正解後の再生成は、通常のLuna/Terra経路を使わず `gpt-5.6-sol` をOpenAIの先頭モデルとして使用する。Solの回答を再回答欄へ反映した後、「もう一度解答する」を1回だけ自動クリックする。問題文・選択肢・問題形式から作った指紋をクリック前に拡張機能ストレージへ30分保存するため、ページ更新で問題IDが変わっても同じ問題を再送しない。
- OpenRouter では Gemini 系モデルを使用（`google/gemini-2.5-flash-lite` -> `google/gemini-2.5-flash` -> `google/gemini-2.0-flash-001` -> `google/gemini-2.0-flash-lite-001`）。
- Free API Mode が ON の場合は、OpenRouter の `:free` モデルを先に試してから Gemini 系モデルへフォールバック。
- Detailed Mode / 資料優先モードのOpenRouterでは `google/gemini-2.5-pro` -> `google/gemini-2.5-flash` -> `google/gemini-2.5-flash-lite` の順で使用。GoogleのGemini APIへ直接接続する場合は現行の `gemini-3.8-flash` を使用する。
- **画像付き問題** かつ **有料モード**（Free API Mode OFF）でOpenRouterを使う場合、`flash-lite` より先に `gemini-2.5-flash` を優先（vision 精度が高いため）。Gemini APIへ直接接続する場合は画像にも `gemini-3.8-flash` を使用する。Free API Mode ON 時や無料モデルの並びには影響しない。
- Provider の優先順位は popup の並び順を尊重。Gemini が quota / 残高なし系エラー（429 等）で失敗した場合は、Gemini の残りモデルを飛ばして次の provider（OpenRouter 等）へ即座に切り替わる。
- 非音声問題は popup の保存順を厳守する。全Providerが失敗した場合は最後のエラーだけでなく、OpenAIを含む各Providerの失敗理由を保存順で表示する。
- 複数問検出時もAI API呼び出しは最大2本までに抑え、詰まったリクエストは15秒で切る。
- 実際に使われた `Provider` / `Model` はヒントパネルに表示。

### 2. OpenRouter の制限考慮

- 現在のデフォルトは OpenRouter の有料/通常 Gemini モデルなので、無料枠チェックは通常スキップ。
- レート制限は OpenRouter 公式 Limits に準拠して扱う。
- `:free` モデル利用時のみ、無料枠エラー（例: `free-models-per-min`, `free-models-per-day`, `402`）を検知して次の候補へ進む。

参考: https://openrouter.ai/docs/api/reference/limits

### 3. 資料優先モード（Material Mode）

- PDF / テキスト資料を popup から投入可能。
- 問題文に関連する断片を抽出し、回答生成時に優先参照。
- 資料モード有効時は精度寄りのプロンプトに切替。

### 4. 画像付き問題への対応

- 問題文（`.qtext` / `.formulation`）内の `<img>` を検出し、base64 化して AI に添付。
- 画像がある問題では vision 非対応モデル（`gpt-oss` / `qwen3-coder` / `deepseek` 系）を自動でスキップし、Gemini など vision 対応モデルへ。
- 1 問あたり最大 4 枚、6MB まで。32px 未満のアイコン類は除外。
- 画像の取得結果はキャッシュされ、同じ画像を何度も取得しない（失敗時は次回スキャンで再試行）。
- 標準モードでは Gemini 2.5 Flash の thinking を無効化して空応答を防止（詳細モード・画像付き問題では thinking を許可）。

### 5. 複数空欄（gapselect）への対応

- 文中に複数のドロップダウン（`<select>`）が並ぶ問題に対応。
- 文全体を `[1] [2] [3] …` と番号付きにして **1 回のリクエストでまとめて** 解かせるので、空欄同士の関係（例: `<body>～</body>` 内に `canvas` タグ）を踏まえた解答になる。
- 各空欄の選択肢はその空欄専用の候補として送信し、返答は選択肢に一致するよう検証。
- 1 つのヒントパネル内に `空白1: body` / `空白2: body` / `空白3: canvas` … と改行して分かりやすく表示。

### 6. 計算問題は式だけAIに出させて、計算はローカルで実行

- 数値回答が必要な問題（指数・単位変換など）では、AI に「答えを計算せず `EXPR: 3.3e-6 * 2 / 1e-3` のように式だけ出す」よう指示。
- その式を `background.js` 内の自前の安全な数式パーサ（`eval`/`Function` 不使用、四則演算・`^`・括弧・`sqrt`/`log`等の関数のみを許可する再帰下降パーサ）で実際に計算し、その結果を最終回答として採用。
- 単純な暗記・カウント系の数値（式が不要なもの）は今まで通り AI がそのまま数字を出す。
- 式の解析に失敗した場合は、従来通りの数字抽出ロジックにフォールバック。

### 7. 再スキャンの安定化

- クイズのタイマーや自動保存など、問題内容と無関係な DOM 変化では再スキャンしないように限定。
- 既に解答済みの問題を無限に解き直す挙動を防止。

### 8. 複数空欄の番号ズレ対策 / ラベル・型検出の精度向上

- 複数の空欄をまとめて解かせる際、AI が番号を1つ飛ばす／ズラす（例: `1:` を出さず `2:` から始める）ことがある。この場合、モデル自身の番号だけを信じると全ての答えが1個ずつ隣の空欄にズレて割り当てられてしまう。
- 番号どおりの割り当てと、出現順どおりの割り当ての両方を試し、フォーマット的に有効な答えが多い方を採用。番号がズレている兆候（連番だが1から始まっていない）がある場合は出現順を優先。
- 各空欄の「前の文脈」抽出ロジック（`<ul><li>`で複数空欄が並ぶレイアウト）に、対象の空欄より後ろの段落まで巻き込んでしまうバグがあった。文書順を正しく辿るよう修正し、`カタカナ限定`／`記号（半角）`のような型判定が、無関係な別セクションの指示文に引っ張られて誤判定されないようにした。
- 各空欄に送る名前も、汎用的な `Blank 2`/`Symbol` ではなく、実際のラベル（`I1`、`元素名1`、`人体が受ける放射線量を表す単位の記号` など）を抽出して使うことで、同じ変数名が複数回登場する問題（例: 図1と図2で共通の`I`）でもAIが混同しにくくなる。

### 9. 既に回答済みの欄は自動生成しない

- 解答欄（テキスト入力・ラジオ・チェックボックス・セレクト）に既に値が入っている問題は、ページ読み込み時に自動でヒントを生成しない（無駄な API 呼び出し防止、既存の入力を上書きするような見た目を避けるため）。
- 代わりにパネルは「Skipped」状態で表示され、`Generate hint` ボタンを押した時だけ生成される。
- 複数空欄をまとめて解くグループでは、いずれか1つでも入力済みならグループ全体をスキップ（1回のリクエストで全部解くため）。

### 10. UI/UX

- ヒントパネルに `Retry` ボタンあり（その問題だけ再実行）。一時停止中は「Paused」を表示。
- ページ下部のステータス欄に「停止／再開」ボタンを表示する。停止時は待機中の処理を破棄し、通信中の回答が後から返っても入力・送信・次問題への移動を行わない。状態は保存されるため、再開するまで別の問題ページでも停止を維持する。
- ステータスウィジェット表示/非表示切替あり。
- API プロバイダは複数選択・優先順位入れ替え可能。
- プロバイダのフォールバック発生（例: Geminiが失敗してOpenRouterに切り替わった）は、ヒントパネルには表示せず、popup 内の折りたたみ式「Logs」セクション（デフォルトは非表示、クリックで展開）に記録される。最大50件、「Clear Logs」で削除可能。

### 11. Linguaporta対応

- `/user/seibido/index.php` の問題ページで自動起動する。
- `#problem-area` を1問として認識し、`#qu01` / `#qu02` などの連番要素から問題文だけを抽出する。
- `#drill_form` 内のラジオボタン、チェックボックス、セレクトから選択肢を抽出する。
- AI回答と一致したラジオボタン／チェックボックス／セレクトを自動選択する。複数回答では該当するチェックボックスをすべて選択する。
- 初回の回答を入力・選択・並び替えできた場合は、専用の `#ans_submit` が「解答する」であることを確認し、そのボタン要素を1回だけ自動クリックする。不正解後はSolの最初の再回答だけ「もう一度解答する」を自動クリックし、同じ問題の2回目は停止する。
- 穴埋め問題では、`#drill_form` 内の入力欄を含む英文を `[blank]` 付きで問題文へ追加し、AI回答をテキスト欄へ自動入力する。
- 不正解後に表示される `#answer_info` や `解答：×...` は問題文・選択肢として扱わず、空になった再回答欄だけへ回答を反映する。
- 正解後の画面は `#true_msg`（「正解」）で全問題形式共通に判定し、AI回答の生成・自動入力を行わない。画面切り替え前のリクエストが遅れて返った場合も、その回答は表示・反映しない。正解時は専用の `.button-next-problem` とフォームの `action=次の問題` を確認してから、問題IDごとに1回だけ「次の問題」を自動クリックする。
- 並び替え問題では `.CardStyle` の全語句と `.qu03` の空欄文を抽出し、AIが返した `→` 区切りの順序でカードを `.DropLine` 上へ並べる。サイト側の遅延初期化でカードが空の間はAPI送信せず、初期化後に再スキャンする。配置座標はLinguaportaの採点条件と同じ式で設定し、不正解後の並びも同様に修正する。
- 音声穴埋め問題ではLinguaporta固有の `audio#sound` だけを音声問題として扱う。Geminiキーが保存済みなら、popupでGeminiが未選択でも音声問題だけGeminiの無料枠を先に試し、現行の `gemini-3.8-flash` でMP3等を直接解析する。ページ内で音声取得に失敗した場合はバックグラウンドからLinguaportaの音声URLを再取得する。Geminiのquota・レート制限等で利用できない場合は元のProvider順へフォールバックし、OpenAIでは `gpt-transcribe` で文字起こししてから通常の回答モデルへ渡す。
- ヒントパネルと下部ステータスには実際のProvider・Model・音声経路（`Gemini direct audio` / `OpenAI gpt-transcribe` 等）を表示する。
- OpenAIの音声問題は文字起こしと回答生成の2回のAPI呼び出しになるため、通常のテキスト問題とは別に文字起こし分の利用量が発生し得る。
- 日本語の指示文と英語の穴埋め文が併記されている場合は、回答言語を英語として扱う。
- `xlast_problem_num` を問題IDとして利用し、問題が切り替わった際のキャッシュ混同を防ぐ。
- 画像付き問題では `#question_area` 内の画像を従来どおりAIへ添付する。
- すでに選択・入力済みの問題は自動生成せず、必要な場合だけ `Generate hint` から実行する。

添付サンプルHTMLでは、問題文 `この単語・語句の意味はどれですか。 purpose` と、選択肢 `家 / レース / 目的 / クーポン` を分離して処理します。解答フォームのhidden値やナビゲーション文言はAIへ送りません。

### 12. Moodle本体との互換性

[Moodle公式リポジトリ](https://github.com/moodle/moodle) の `main` ブランチ（確認時: `6216fe4`）にある問題レンダラーとテンプレートを基準に、生成されるDOMへ追従しています。

- 情報表示だけの `description` は問題としてAPIへ送らない。
- `match` / `randomsamatch` の表形式マッチング問題を、行ごとの複数空欄としてまとめて処理する。
- `gapselect` に加え、`ddwtos`（文中へのドラッグ＆ドロップ）の空欄とグループ別候補を処理する。
- `ordering` の並べ替え項目を抽出し、全項目を正しい順番で返す。ドラッグ中だけ作られる複製DOMは問題として数えない。
- `multichoice` のcheckboxを複数回答として判定し、正解候補をすべて返す。radioの単一回答とは別の出力検証を行う。
- `numerical` / `calculated` の単位radio/selectを通常の選択肢と誤認しない。数値回答は数値モードで処理する。
- Moodleの未選択selectで使われる値 `0` は「回答済み」と判定せず、プレースホルダーも選択肢から除外する。

確認に使った主な公式実装: [question engine renderer](https://github.com/moodle/moodle/blob/6216fe4ed19a5a3c88c0951d1647e9f2d626bcbb/public/question/engine/renderer.php)、[multichoice renderer](https://github.com/moodle/moodle/blob/6216fe4ed19a5a3c88c0951d1647e9f2d626bcbb/public/question/type/multichoice/renderer.php)、[matching renderer](https://github.com/moodle/moodle/blob/6216fe4ed19a5a3c88c0951d1647e9f2d626bcbb/public/question/type/match/renderer.php)、[numerical renderer](https://github.com/moodle/moodle/blob/6216fe4ed19a5a3c88c0951d1647e9f2d626bcbb/public/question/type/numerical/renderer.php)。

Moodleの追加プラグイン問題タイプやサイト独自テーマはDOMが異なる場合があります。画像上へ直接配置する `ddimageortext` / `ddmarker` は、現時点では画像をAIへ添付できますが、配置座標を専用形式で解析する機能は未対応です。

## 対応プロバイダ

- OpenRouter（APIキー必要）
- Gemini（APIキー必要）
- OpenAI（APIキー必要）

## 無料枠を活用する運用

料金・対象モデル・レート制限は変更されることがあるため、以下は **2026年8月時点** の情報です。利用前に各リンク先とダッシュボードの表示も確認してください。

| 運用 | 初期支払い | 向いている用途 | 主な制限・注意 |
| --- | ---: | --- | --- |
| OpenRouter完全無料 | $0 | 少量利用、試用 | 無課金アカウントは無料モデル合計50リクエスト/日が目安。混雑やモデル停止で失敗することがある |
| OpenAIデータ共有特典 | 最小$5 | 速度・品質・安定性を重視 | 対象組織のみ。Tier 1–2ではLuna/Terraなどのグループ合計250万token/日。超過分は通常課金 |
| OpenRouter → OpenAI | $5 | 無料モデルを先に使い、失敗時だけOpenAIへ移る | OpenAI側の無料トークン超過時は購入残高から課金される |

### 完全無料で使う: OpenRouter

1. [OpenRouter](https://openrouter.ai/) でアカウントとAPIキーを作成する。クレジット購入は不要。
2. popupのプロバイダは **OpenRouterだけ** をONにする。
3. `Free API Mode` をONにしてAPI設定を保存する。
4. OpenRouterに有料クレジットを入れず、自動チャージも設定しない。これで有料候補へ到達しても残高不足で停止するため、実費は発生しない。

OpenRouterの `:free` モデルはprompt/completionとも$0ですが、無課金または購入額$10未満のアカウントは無料モデル全体で通常50リクエスト/日です。$10以上のクレジットを購入したアカウントは通常1,000リクエスト/日に増えますが、購入クレジットは有料モデルにも使えるため「完全無料」の安全性は下がります。無料モデルは低レートで、提供モデルや空き状況も変動します。

- [OpenRouter FAQ（無料モデルとレート制限）](https://openrouter.ai/docs/faq)
- [OpenRouter Free Models Router](https://openrouter.ai/openrouter/free/)

### 最小$5でOpenAIの無料トークン特典を使う

OpenAIには、APIの入出力をモデル改善目的で共有する対象組織向けに、日次のcomplimentary tokens（無料トークン）が付く制度があります。この拡張が使う `gpt-5.6-luna` と `gpt-5.6-terra` は同じ対象グループです。

1. [OpenAI API Platform](https://platform.openai.com/) でAPI組織とプロジェクトを作成する。
2. Billingでプリペイドクレジットを購入する。公式の最低購入額は **$5**。
3. 意図しない追加購入を防ぐ場合は、初期設定時に `Auto Recharge` をOFFにする。
4. Organization OwnerでData controlsを開き、`Share inputs and outputs with OpenAI` に無料利用対象の表示があることを確認する。
5. 全プロジェクトまたは拡張用プロジェクトだけデータ共有を有効にする。
6. そのプロジェクトでAPIキーを作成し、popupのOpenAI欄へ保存する。
7. Usage Dashboardでservice tierを確認し、`data sharing incentive tier` として記録されていることを確認する。

Tier 1–2の対象アカウントでは、Luna/Terraを含むグループで **合計250万token/日** が無料対象です。枠は毎日00:00 UTC（日本時間09:00）にリセットされます。残り枠を1回のリクエストが超える場合、そのリクエスト全体が通常課金になります。対象外の組織、共有していないプロジェクト、ツール利用、上限超過分も通常課金です。また、制度の利用には正のアカウント残高が必要です。

通常課金になった場合の現行テキスト料金は次のとおりです（100万tokenあたり）。

| モデル | 入力 | キャッシュ入力 | 出力 | 拡張内の役割 |
| --- | ---: | ---: | ---: | --- |
| `gpt-5.6-luna` | $0.20 | $0.02 | $1.20 | 高速な第一候補 |
| `gpt-5.6-terra` | $2.00 | $0.20 | $12.00 | Luna失敗時の上位フォールバック |

- [OpenAIのデータ共有とcomplimentary tokens](https://help.openai.com/en/articles/10306912-sharing-feedback-evaluation-and-fine-tuning-data-and-api-inputs-and-outputs-with-openai)
- [OpenAIのプリペイド課金](https://help.openai.com/en/articles/8264778)
- [OpenAIの現行モデル一覧](https://developers.openai.com/api/docs/models)

> [!IMPORTANT]
> 「$5を一度払えば永久に無料」ではありません。購入クレジットは1年で失効し返金不可です。無料トークン制度も30日前の通知で終了する可能性があり、対象条件やモデルは変更されます。正確には「最小$5の残高を用意し、対象期間・日次上限内で長期間ほぼ無料を狙う運用」です。

### 無料枠をできるだけ先に使う推奨順

- 絶対に課金したくない: `OpenRouter` のみ、`Free API Mode` ON、OpenRouter残高$0。
- 無料優先で成功率も上げたい: `OpenRouter -> OpenAI`、`Free API Mode` ON。OpenAIの日次枠超過時は課金され得る。
- 速度と回答品質を優先: `OpenAI -> OpenRouter`。OpenAIはLunaから始まり、失敗時にTerraへ移る。

データ共有を有効にすると、この拡張から送信される問題文、選択肢、添付画像、投入した資料の関連部分が共有対象になり得ます。個人情報、機密情報、第三者の非公開資料は送信しないでください。

## ファイル構成

```text
Linguaporta-fuck/
├─ manifest.json
├─ background.js
├─ content.js
├─ popup.html
├─ popup.js
├─ icon.png
└─ data/
```

## セットアップ

1. `chrome://extensions/` を開く
2. デベロッパーモードを ON
3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選択
4. 拡張 popup を開き、使うプロバイダと API キーを設定

## 注意

- 本ツールは学習補助用途を想定しています。利用規約や授業ルールに従って利用してください。
- 外部APIへの送信が発生するため、機微情報の取り扱いには注意してください。
