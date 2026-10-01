# LinguaportaFuck

Linguaportaの問題を読み取り、AI回答の入力・採点・再回答・次問題への移動を自動化するChrome拡張です。

対象ページは `http(s)://*.linguaporta.jp/user/seibido/*` です。`index.php` が省略されたURLでも動作します。

## 主な機能

- 問題文、日本語訳、選択肢、空欄、画像、音声を抽出して回答を生成
- テキスト入力、ラジオボタン、チェックボックス、セレクト、並び替え問題へ回答を反映
- 並び替え問題ではヒント枠を回答フォームの外へ配置し、カードと黒いDropLineへの重なりを防止
- 回答反映後に「解答する」を自動クリック
- 不正解時は採点済みの誤答を除外し、OpenAIの `gpt-5.6-sol` で再回答
- PlaMo・OpenAIなどProviderを問わず、サイトで正解になった回答をローカル保存
- 選択肢の表示順が周回ごとに変わっても同じ問題として照合し、Solなどの再回答で正解した選択肢も保存
- 通常問題はAI回答が2回とも不正解なら「正解を見る」を開き、表示された正答もローカル保存
- 保存済み正答は問題IDが変わっても本文で照合し、次回はAPIを使わず入力・送信
- 正答保存後や正解後は「次の問題」を自動クリック
- 拡張機能の再読み込み後も、開いているLinguaportaタブへcontent scriptとステータス表示を復旧

## Provider

次のProviderを複数有効化し、popupで通常の優先順位を変更できます。

- OpenAI
- Gemini
- OpenRouter
- Custom LLM（OpenAI互換Chat Completions API）

設定不足やquota・残高・通信エラーで失敗したProviderはスキップし、次のProviderへフォールバックします。実際に使用したProvider、モデル、音声処理経路は問題パネルとステータス欄へ表示します。

### PlaMo

Custom LLMのモデル名に `PlaMo` が含まれる場合、音声のない単語・語句・意味・翻訳・空欄問題ではpopupの順位に関係なくCustom LLMを最優先にします。不正解後の再回答ではOpenAIを最優先に切り替えます。

PlaMoは音声モデルとして扱いません。

### 音声問題

Linguaportaの `audio#sound` を音声問題として扱います。

- popupの `Audio Transcription` で `Cloud API`、`Local Auto (GPU → CPU)`、`Local GPU (WebGPU)`、`Local CPU (WASM)` を選択可能
- `Local Auto` はWebGPUが利用できればGPUを使い、初期化・推論に失敗した場合はCPUへ自動フォールバック
- 「音声を聞いて」などと明記された音声空欄問題だけを文字起こしし、ローカル文字起こしと `[blank]` 前後を照合して答えを確定できた場合は回答用クラウドLLMを呼ばずに入力
- LinguaportaのMP3はページと同じCookieを使い、ネイティブ音声取得と同様の `Range: bytes=0-` で取得（`200` / `206 Partial Content` に対応）
- ローカルモードでは `Whisper tiny.en` をブラウザ内で実行し、MP3自体を回答Providerへ送らず文字起こし結果だけを渡す
- モデルは初回利用時に取得してブラウザへキャッシュ（目安: GPU構成約120MB、CPU構成約41MB）
- ローカル文字起こしが失敗した場合だけ、従来のクラウド音声経路へフォールバック
- 音声・文字起こし系Customモデルを設定している場合はGeminiの直接音声解析を優先可能
- OpenAIでは `gpt-transcribe` で文字起こし後、回答モデルへ渡す
- PlaMoなど通常のテキストモデルを設定している場合は、保存されたProvider順を維持

### Custom LLM

Ollama、LM Studio、vLLMなどのOpenAI互換APIを利用できます。

- endpointとmodelは必須
- ローカルLLMではAPIキーを省略可能
- endpointが `/v1` で終わる場合は `/v1/chat/completions` へ自動補完

例:

```text
Endpoint: https://example.invalid/v1
Model: mitmul/plamo-2-translate:Q4_K_M
```

## 空欄問題と正答学習

穴埋め問題では空欄前後の英文、日本語の指示・訳、選択肢をまとめて送信します。英語の数値判定は単語単位で行い、`computer` 内の `compute` や `country` 内の `count` を数値問題と誤認しません。

通常問題へのAI生成は最大2回です。並び替え問題は初回回答に加えてRetryを3回まで行えます。送信前の回答をタブ単位の一時JSONへ保持し、サイトの `正解` 表示を確認できた回答だけを正答JSONへ昇格します。正解時にはその問題のAI回答回数と再送信ガードも消去します。

1. 通常回答を生成して自動送信
2. サイトで正解になったら、その回答を正答JSONへ保存
3. 不正解なら、前回の誤答を禁止してOpenAIで再回答
4. 再回答が正解なら、その回答も正答JSONへ保存
5. 再び不正解なら「正解を見る」を自動クリック
6. `.qu03` のreadonly欄から正答を保存
7. 「次の問題」を自動クリック
8. 同じ本文が再出題されたら保存済み正答を適用

### 並び替えの音声ヒント

並び替え問題の非表示 `#hint2` 内にあるMP3は、最初から音声問題として読み込みません。テキストだけの回答が3回連続で不正解になった場合に限り「ヒントを見る」を自動クリックし、表示されたMP3を読み込んで3回目のRetryへ利用します。流れは「初回回答 → Retry 1 → Retry 2 → 音声ヒント付きRetry 3」です。

保存済み正答が後から不正解になった場合は、その記録を削除して通常のAI回答へ戻ります。正答は最大2,000件まで `chrome.storage.local` に保存します。

## 資料・画像

- popupからPDFまたはテキスト資料を登録可能
- Material Modeでは問題に関連する資料断片を回答生成時に優先参照
- 問題画像は1問あたり最大4枚、各6MBまで送信
- 小さな装飾画像は除外

## ステータスと操作

- `Show Status Widget` でページ右下の状態表示を切り替え
- ステータス欄から停止・再開
- 停止中は遅れて返った回答を入力・送信しない
- popupのLogsでProviderフォールバック履歴を確認・削除

## セットアップ

1. `chrome://extensions/` を開く
2. デベロッパーモードをONにする
3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選ぶ
4. popupでProvider、APIキー、Custom LLM設定を保存する
5. Linguaportaの問題ページを再読み込みする

## ファイル構成

```text
Linguaporta-fuck/
├─ manifest.json
├─ background.js
├─ content.js
├─ popup.html
├─ popup.js
└─ icon.png
```

## 注意

- 学習サイトの利用規約や授業ルールに従って使用してください。
- 問題文、画像、音声、資料は設定した外部APIへ送信される場合があります。
- APIの料金、無料枠、モデル提供状況は各Providerの最新情報を確認してください。
