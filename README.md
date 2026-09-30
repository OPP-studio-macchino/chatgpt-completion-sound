# ChatGPT Completion Sound / チャッピー完了音

[![CI](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/actions/workflows/ci.yml/badge.svg)](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)

**ChatGPT Completion Sound** is a privacy-first Chrome Manifest V3 extension that watches open `chatgpt.com` tabs and lets you know when an answer finishes — with a user-selected local WAV sound and an optional Chrome tab-group color.

- **Yellow**: ChatGPT is generating.
- **Blue**: the response completed.
- **Sound**: plays once on completion, including when the ChatGPT tab is in the background.
- **Manual stop / error / navigation**: no completion notification.

No OpenAI API key is required. No server is required. Conversation text and the user's WAV file are not sent to an external service.

> **Project status:** active development. Current working-tree version: **v0.3.0 — Compatibility Shield / 互換性シールド**. Fresh automated results and separate live acceptance status are recorded in [docs/VALIDATION.md](docs/VALIDATION.md). The v0.2.12 live PASS is historical, not evidence for v0.3.0.

## Why this project exists

Long ChatGPT tasks are often moved to background tabs while the user continues other work. That sounds simple, but a reliable notification extension has to deal with hidden-page throttling, Manifest V3 service-worker suspension, lazy UI rendering, extension reloads, duplicate completion events, tab-group ownership, and manual-stop false positives.

This repository turns those edge cases into a small, testable open-source reference implementation. It is useful both as an end-user extension and as an example of resilient MV3 coordination between a content script, a service worker, an offscreen audio document, and optional tab-group state.

## Key features

- Watches all open `https://chatgpt.com/*` tabs in the current Chrome profile.
- Detects generation start and changes an eligible tab to a yellow Chrome group.
- Detects completion in foreground and background tabs without automatically focusing the tab.
- Plays a locally selected WAV file once on completion.
- Retries completion delivery across transient service-worker restarts while deduplicating playback.
- Returns blue completion tabs to yellow on the next job in the same conversation.
- Suppresses completion notification after manual stop, recognized errors, or navigation.
- Preserves pinned tabs, split-view tabs, existing user groups, and user-modified groups.
- Rehydrates open ChatGPT tabs after an extension reload.
- Keeps diagnostics limited to state metadata; it does not store conversation text.

## Compatibility Shield / 互換性シールド

Packaged, strictly validated signal profiles isolate ChatGPT UI changes. The popup reports healthy/degraded/incompatible structural health. Unknown or ambiguous completion structure suppresses completion; supported degraded paths can still notify with independent evidence. Remote DATA activation is disabled with `REMOTE_PROFILE_KEY_UNPROVISIONED`; no remote code, network access or telemetry was added.

See [profile/security design](docs/COMPATIBILITY.md), the [dedicated-profile synthetic Canary runbook](docs/runbooks/COMPATIBILITY_CANARY.md), and [docs/VALIDATION.md](docs/VALIDATION.md) for the current v0.3.0 automated and real-device acceptance record.

## Privacy and security model

The extension is deliberately narrow:

- Host access is limited to `https://chatgpt.com/*`.
- The CSP uses `connect-src 'none'`; extension pages do not make outbound network requests.
- Conversation text is not transmitted to the service worker or an external service.
- Opaque response identifiers are hashed before the completion event leaves the content script.
- The selected WAV is stored locally in Chrome extension storage and is not bundled in this repository.
- `tabGroups` is optional and requested only when the user enables color notifications.
- The extension does **not** request the broad `tabs` permission.

See [SECURITY.md](SECURITY.md), [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md), and the in-extension privacy page at [`extension/privacy.html`](extension/privacy.html).

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Stores local settings, the user-selected audio data, deduplication state, and non-content diagnostics. |
| `offscreen` | Plays completion audio from a Manifest V3 background context. |
| `alarms` | Recovers monitoring after service-worker suspension. |
| `scripting` | Re-injects the current content scripts into already-open ChatGPT tabs after extension reload. |
| `webRequest` | Observes completion metadata for ChatGPT requests only to trigger a DOM re-check in background tabs; it does not read request/response bodies or treat transport completion as task completion. |
| `https://chatgpt.com/*` | Restricts page access to ChatGPT. |
| optional `tabGroups` | Adds yellow/blue visual state when explicitly enabled by the user. |

## Architecture

```text
ChatGPT tab
  └─ compatibility.js + detector.js + dom-reader.js + content.js
       │  STATUS / COMPLETE (hashed opaque id)
       ▼
Manifest V3 service worker (background.js)
  ├─ background-watch.js   hidden-tab recovery / probing
  ├─ tab-colors.js         optional tab-group ownership + colors
  └─ offscreen.html/js     local WAV playback
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Usage / 使い方 / Uso

This section is written for people who have never installed an unpacked Chrome extension before.

- [English](#usage-english)
- [日本語](#usage-japanese)
- [Español](#usage-spanish)

> **Important:** ChatGPT Completion Sound is currently distributed as a GitHub release, not through the Chrome Web Store. Chrome therefore installs it as an **unpacked extension**. Download only from this repository's official [Releases page](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/releases/latest).

<a id="usage-english"></a>
### English — installation, setup, and everyday use

#### 1. Download the extension

1. Open the [latest GitHub Release](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/releases/latest).
2. Under **Assets**, download the release ZIP named like:
   `chatgpt-completion-sound-vX.Y.Z.zip`
   - For v0.3.0, the file is `chatgpt-completion-sound-v0.3.0.zip`.
   - Prefer this release asset instead of GitHub's automatically generated **Source code (zip)** file.
3. Unzip the downloaded file.
4. Put the extracted extension in a **permanent folder** that you will not move or delete.
   - Example: `Documents/ChatGPT Completion Sound/extension`
   - The folder you load into Chrome must contain `manifest.json`, `background.js`, and the other extension files.
5. Do **not** select the ZIP file itself. Chrome needs the extracted folder.

Why keep the folder in a permanent location? Chrome reads an unpacked extension directly from that folder. If you delete or move it, the extension can stop loading.

#### 2. Install it in Chrome

Requires **Chrome 120 or later**.

1. Open Chrome.
2. Type `chrome://extensions` in the address bar and press Enter.
3. Turn on **Developer mode** in the upper-right corner.
4. Click **Load unpacked**.
5. Select the extracted folder that contains `manifest.json`.
6. Confirm that **ChatGPT Completion Sound / チャッピー完了音** appears in the extensions list.
7. Optional but recommended: click Chrome's puzzle-piece Extensions icon and pin **チャッピー完了音** so it is easy to open.

Because this is an unpacked GitHub release, Chrome may show developer-mode wording. Verify that you downloaded the ZIP from this repository before loading it.

#### 3. Choose your completion sound

The current extension UI is mainly Japanese. The exact button labels are shown below so you can follow them even if you do not read Japanese.

1. Click the **チャッピー完了音** extension icon.
2. Click **`音声と色の設定`** — “Sound and color settings.”
3. Under **`1. 完了音声を選ぶ`**, click **`WAVファイルを選択`**.
4. Choose a local **WAV file of 5 MB or less**.
5. Adjust the volume slider if necessary.
6. Click **`音声を1回鳴らす`** — “Play sound once.”
7. Make sure you can actually hear the test sound before continuing.

The WAV is copied into Chrome extension storage. After it has been selected successfully, the original WAV file does not need to remain connected or mounted.

#### 4. Turn on automatic completion notifications

1. In the settings page, find **`2. 自動通知を有効にする`**.
2. Turn on **`開いているChatGPTのタブで通知する`**.
3. If ChatGPT tabs were already open before installation or after an update, reload those ChatGPT tabs once.
4. If ChatGPT is currently generating a response, wait until that response finishes before reloading the tab.

No OpenAI API key, C2C setup, server, or extra account connection is required.

#### 5. Optional: enable yellow/blue tab colors

1. In settings, find **`3. タブを色で知らせる`**.
2. Turn on **`タブの色も変える`**.
3. The first time, Chrome asks for the **tab groups** permission. Choose **Allow**.
4. From then on, eligible ChatGPT tabs are shown independently:
   - **Yellow — `チャッピー · 作業中`**: ChatGPT is generating.
   - **Blue — `チャッピー · 完了`**: the response finished.
5. Blue remains until the next task or navigation. Starting another task in that tab changes it back to yellow.

The extension deliberately does not take over every kind of tab. Pinned tabs, split-view tabs, tabs already in your own group, and user-modified groups may use **sound only** instead of color.

#### 6. Everyday use

Once setup is complete, normal use is simple:

1. Open ChatGPT at `https://chatgpt.com/`.
2. Start a task as usual.
3. You may switch to another tab and continue working.
4. While ChatGPT is generating, an eligible tab becomes yellow.
5. When ChatGPT finishes normally:
   - that tab becomes blue;
   - your selected WAV plays **once**.
6. Other ChatGPT tabs keep their own state. A completed tab becoming blue should not turn another still-working tab blue.
7. Starting another task in the same conversation returns that tab to yellow.

A **manual Stop**, a recognized error, or navigation away from the task does **not** count as a normal completion and should not play the completion sound.

#### 7. What the extension can and cannot monitor

It can monitor ChatGPT tabs that are loaded in the **same Chrome profile** where the extension is installed.

It cannot guarantee notification when:

- the ChatGPT tab has been closed;
- Chrome has discarded or deeply suspended the tab;
- Chrome is closed;
- the computer is asleep;
- ChatGPT changes its web interface in a way the Compatibility Shield cannot identify safely.

When the page structure is unknown or ambiguous, Compatibility Shield intentionally fails closed rather than guessing and producing a false completion notification.

#### 8. Troubleshooting

**No sound**
1. Open **`音声と色の設定`**.
2. Confirm that a WAV file is selected.
3. Click **`音声を1回鳴らす`**.
4. Check macOS/Windows system volume and mute state.
5. Make sure automatic notifications are enabled.
6. Reload the ChatGPT tab once after installing or updating the extension.
7. Remember that manually stopping a response intentionally produces no completion sound.

**No yellow/blue color**
1. Confirm **`タブの色も変える`** is enabled.
2. Confirm Chrome's tab-groups permission was allowed.
3. Use an ordinary, unpinned ChatGPT tab that is not already inside one of your own tab groups.
4. Split-view, pinned, or already-grouped tabs can still receive sound without color.

**The popup says the structure is incompatible**
- The Compatibility Shield has decided that the current ChatGPT page cannot be identified safely.
- Check the [latest release](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/releases/latest) for an update.
- If the newest release still has the problem, open a GitHub issue without including private conversation text.

**More than one completion sound plays**
- Check whether another completion notifier is also enabled, such as a separate C2C completion-sound feature or another Chrome extension.

#### 9. Updating to a newer release

For unpacked extensions, the safest beginner-friendly method is to keep the **same permanent installation folder**:

1. Download the new release ZIP from the official Releases page.
2. Unzip it somewhere temporary.
3. Close or finish any ChatGPT responses currently running.
4. Replace the contents of your existing permanent extension folder with the new release files.
5. Open `chrome://extensions`.
6. Find **ChatGPT Completion Sound / チャッピー完了音** and click **Reload**.
7. Reload your already-open ChatGPT tabs once.
8. Open the extension popup and confirm the displayed version.

Keeping the same folder path helps Chrome continue to treat it as the same unpacked installation and retain its local settings.

#### 10. Privacy in plain language

- Your ChatGPT conversation text is **not sent to an external server by this extension**.
- Your selected WAV stays in Chrome's local extension storage.
- No OpenAI API key is required.
- No remote code or telemetry is required for the notification feature.
- The extension only requests access needed for `chatgpt.com` and its documented browser features.

<a id="usage-japanese"></a>
### 日本語 — ダウンロード、設定、普段の使い方

#### 1. 拡張機能をダウンロードする

1. [最新のGitHub Release](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/releases/latest) を開きます。
2. **Assets** の中から、
   `chatgpt-completion-sound-vX.Y.Z.zip`
   という名前のZIPをダウンロードします。
   - v0.3.0なら `chatgpt-completion-sound-v0.3.0.zip` です。
   - GitHubが自動生成する **Source code (zip)** ではなく、上記のRelease用ZIPを選んでください。
3. ダウンロードしたZIPを展開します。
4. 展開した拡張機能を、**あとで削除したり移動したりしない常設フォルダ**に置きます。
   - 例：`書類/ChatGPT Completion Sound/extension`
5. Chromeで選ぶのはZIPそのものではなく、**`manifest.json` が入っている展開済みフォルダ**です。

Chromeは「パッケージ化されていない拡張機能」をそのフォルダから直接読み込み続けます。あとでフォルダを削除・移動すると、拡張機能が読み込めなくなることがあります。

#### 2. Chromeへインストールする

**Chrome 120以降**が必要です。

1. Chromeを開きます。
2. アドレス欄に `chrome://extensions` と入力してEnterを押します。
3. 右上の **「デベロッパー モード」** をオンにします。
4. **「パッケージ化されていない拡張機能を読み込む」** をクリックします。
5. 先ほど展開した、`manifest.json` が入っているフォルダを選びます。
6. 一覧に **「チャッピー完了音」** が表示されたことを確認します。
7. 使いやすくするなら、Chrome右上の拡張機能（パズルのピース）から **「チャッピー完了音」** をピン留めしておくと便利です。

GitHubから手動導入するため、Chrome上では「デベロッパー モード」の拡張機能として扱われます。必ずこの公式リポジトリのReleaseからダウンロードしたZIPを使用してください。

#### 3. 完了音声を設定する

1. Chrome右上の **「チャッピー完了音」** をクリックします。
2. **「音声と色の設定」** をクリックします。
3. **「1. 完了音声を選ぶ」** の **「WAVファイルを選択」** をクリックします。
4. パソコン内にある **5MB以下のWAVファイル** を選びます。
5. 必要なら音量スライダーを調整します。
6. **「音声を1回鳴らす」** をクリックします。
7. 実際にスピーカーから音が聞こえることを確認してください。

選択したWAVはChromeの拡張機能用ローカルストレージへコピーされます。設定が終わった後は、元のWAVファイルを外付けSSDなどへ接続し続ける必要はありません。

#### 4. 自動通知をオンにする

1. 設定画面の **「2. 自動通知を有効にする」** を開きます。
2. **「開いているChatGPTのタブで通知する」** をオンにします。
3. 拡張機能を初めて入れた直後や更新した直後は、すでに開いているChatGPTタブを一度だけ再読み込みしてください。
4. ChatGPTが回答生成中なら、その回答が終わってから再読み込みしてください。

OpenAI APIキー、C2Cの設定、追加サーバー、別サービスへのログインは不要です。

#### 5. 黄色・青色のタブ表示も使う

色表示は任意です。音声だけでも使えます。

1. **「3. タブを色で知らせる」** の **「タブの色も変える」** をオンにします。
2. 初回だけChromeから「タブグループ」の権限確認が出るので、**許可**します。
3. 対象になるChatGPTタブは、それぞれ独立して次のように表示されます。
   - **黄色「チャッピー · 作業中」**：ChatGPTが回答を生成中
   - **青色「チャッピー · 完了」**：回答が正常に完了
4. 完了した青色は、次の作業を始めるか画面移動するまで残ります。
5. 同じタブで次の依頼を始めると、再び黄色になります。

固定タブ、分割表示中のタブ、すでに自分で作ったグループに入っているタブ、手動で変更したグループは、勝手に変更しない設計です。その場合は**色なし・音声のみ**になることがあります。

#### 6. 普段の使い方

一度設定した後は、特別な操作はほとんどありません。

1. `https://chatgpt.com/` を開きます。
2. いつも通りChatGPTへ作業を依頼します。
3. 回答生成が始まったら、別のタブへ移動して他の仕事をして構いません。
4. 作業中の対象タブは黄色になります。
5. ChatGPTが正常に回答を終えると、
   - **そのタブだけ**青色になり、
   - 設定した完了音が**1回だけ**鳴ります。
6. 他のChatGPTタブは、それぞれの作業状態を保ちます。別のタブがまだ作業中なら黄色のままです。
7. 同じ会話で次の依頼をすると、そのタブは黄色へ戻ります。

**手動で停止した場合、ChatGPT側で認識できるエラーが出た場合、別画面へ移動した場合**は、正常完了として扱わないため、完了音を鳴らしません。

#### 7. 通知できる範囲

この拡張機能が監視できるのは、**この拡張機能を入れた同じChromeプロファイルで開いているChatGPTタブ**です。

次の状態では通知を保証できません。

- ChatGPTタブを閉じた
- Chromeがタブを休止・破棄した
- Chrome自体を終了した
- パソコンがスリープ中
- ChatGPTの画面構造が大きく変わり、Compatibility Shieldが安全に判定できない

Compatibility Shieldは、画面構造が不明・曖昧なときに「たぶん完了した」と推測しません。誤通知を防ぐため、安全側に止まります。

#### 8. うまく動かないとき

**音が鳴らない**
1. **「音声と色の設定」** を開きます。
2. WAVが選択済みか確認します。
3. **「音声を1回鳴らす」** を押します。
4. Mac/Windows本体がミュートになっていないか、音量が小さすぎないか確認します。
5. **「開いているChatGPTのタブで通知する」** がオンか確認します。
6. 導入・更新後ならChatGPTタブを一度再読み込みします。
7. 手動停止した回答では、仕様として完了音は鳴りません。

**黄色・青色にならない**
1. **「タブの色も変える」** がオンか確認します。
2. Chromeの「タブグループ」権限を許可したか確認します。
3. 固定されていない通常のChatGPTタブで試します。
4. すでに別のタブグループへ入っているタブや分割表示では、色を付けず音声だけになる場合があります。

**「互換性シールド」で構造を確認できない・incompatibleと表示される**
- ChatGPT側の画面構造が変わり、拡張機能が安全に判定できなくなっている可能性があります。
- [最新Release](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/releases/latest) が出ていないか確認してください。
- 最新版でも直らない場合は、会話本文などの個人情報を貼らずにGitHub Issueで報告してください。

**完了音が2回以上鳴る**
- C2C側の完了音や、別の完了通知拡張機能も同時に有効になっていないか確認してください。

#### 9. 新しいバージョンへ更新する

初心者には、**最初に決めた常設フォルダの場所を変えず、中身だけ新版へ入れ替える方法**をおすすめします。

1. 公式Releasesページから新しいZIPをダウンロードします。
2. 新しいZIPを一時フォルダへ展開します。
3. 実行中のChatGPTの回答がある場合は、終わるまで待ちます。
4. いまChromeへ読み込ませている常設フォルダの中身を、新版のファイルで置き換えます。
5. `chrome://extensions` を開きます。
6. **「チャッピー完了音」** の **「再読み込み」** を押します。
7. すでに開いているChatGPTタブを一度再読み込みします。
8. 拡張機能のポップアップを開き、表示されるバージョンを確認します。

同じフォルダの場所を使い続けることで、Chromeが同じ「パッケージ化されていない拡張機能」として扱いやすくなり、ローカル設定も維持しやすくなります。

#### 10. プライバシーを簡単に言うと

- ChatGPTの**会話本文を、この拡張機能が外部サーバーへ送ることはありません**。
- 選んだWAVはChrome内のローカルストレージへ保存されます。
- OpenAI APIキーは不要です。
- 通知機能のためにリモートコードやテレメトリーは必要ありません。
- アクセス対象は `chatgpt.com` と、READMEに記載したChrome機能に限定しています。

<a id="usage-spanish"></a>
### Español — descarga, configuración y uso diario

#### 1. Descargar la extensión

1. Abre la [última versión en GitHub Releases](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/releases/latest).
2. En **Assets**, descarga el ZIP con un nombre como:
   `chatgpt-completion-sound-vX.Y.Z.zip`
   - Para v0.3.0: `chatgpt-completion-sound-v0.3.0.zip`.
   - Usa este archivo de la versión publicada, no el archivo automático **Source code (zip)** de GitHub.
3. Descomprime el ZIP.
4. Guarda la carpeta extraída en una **ubicación permanente** que no vayas a borrar ni mover.
   - Ejemplo: `Documentos/ChatGPT Completion Sound/extension`
5. La carpeta que selecciones en Chrome debe contener `manifest.json`. No selecciones el ZIP directamente.

Chrome carga una extensión descomprimida directamente desde esa carpeta. Si después borras o mueves la carpeta, la extensión puede dejar de funcionar.

#### 2. Instalarla en Chrome

Se requiere **Chrome 120 o posterior**.

1. Abre Chrome.
2. Escribe `chrome://extensions` en la barra de direcciones y pulsa Enter.
3. Activa **Modo de desarrollador / Developer mode**.
4. Pulsa **Cargar descomprimida / Load unpacked**.
5. Selecciona la carpeta extraída que contiene `manifest.json`.
6. Comprueba que aparece **ChatGPT Completion Sound / チャッピー完了音**.
7. Opcional: fija **チャッピー完了音** desde el menú de extensiones de Chrome para tenerlo siempre visible.

Como esta versión se instala manualmente desde GitHub, Chrome la trata como una extensión de modo desarrollador. Comprueba siempre que el ZIP procede de este repositorio oficial.

#### 3. Elegir el sonido de finalización

La interfaz actual de la extensión está principalmente en japonés. A continuación aparecen las etiquetas japonesas exactas para que puedas seguir los pasos.

1. Pulsa el icono de **チャッピー完了音**.
2. Pulsa **`音声と色の設定`** — configuración de sonido y color.
3. En **`1. 完了音声を選ぶ`**, pulsa **`WAVファイルを選択`**.
4. Selecciona un archivo **WAV de 5 MB o menos**.
5. Ajusta el volumen si es necesario.
6. Pulsa **`音声を1回鳴らす`** — reproducir el sonido una vez.
7. Comprueba que realmente puedes oírlo antes de continuar.

El WAV seleccionado se copia al almacenamiento local de la extensión en Chrome. Después de configurarlo, el archivo WAV original no necesita permanecer conectado.

#### 4. Activar las notificaciones automáticas

1. Busca **`2. 自動通知を有効にする`**.
2. Activa **`開いているChatGPTのタブで通知する`**.
3. Si ya tenías pestañas de ChatGPT abiertas antes de instalar o actualizar la extensión, recárgalas una vez.
4. Si ChatGPT está generando una respuesta, espera a que termine antes de recargar la pestaña.

No necesitas una clave de la API de OpenAI, C2C, un servidor adicional ni otra cuenta.

#### 5. Opcional: activar los colores amarillo y azul

1. Busca **`3. タブを色で知らせる`**.
2. Activa **`タブの色も変える`**.
3. La primera vez, Chrome pedirá permiso para **grupos de pestañas**. Pulsa **Permitir**.
4. Cada pestaña de ChatGPT compatible se gestiona de forma independiente:
   - **Amarillo — `チャッピー · 作業中`**: ChatGPT está trabajando.
   - **Azul — `チャッピー · 完了`**: la respuesta ha terminado.
5. El azul permanece hasta que empieces una nueva tarea o cambies de página. Una nueva tarea vuelve a poner esa pestaña en amarillo.

La extensión evita modificar pestañas fijadas, vistas divididas, grupos que ya hayas creado o grupos que hayas modificado manualmente. En esos casos puedes recibir **solo el sonido**.

#### 6. Uso diario

Después de la configuración inicial:

1. Abre `https://chatgpt.com/`.
2. Envía una tarea a ChatGPT como siempre.
3. Puedes cambiar a otra pestaña y seguir trabajando.
4. Mientras ChatGPT genera la respuesta, la pestaña compatible se vuelve amarilla.
5. Cuando termina normalmente:
   - **solo esa pestaña** se vuelve azul;
   - el WAV configurado suena **una sola vez**.
6. Las demás pestañas de ChatGPT conservan su propio estado. Una pestaña que todavía está trabajando debe seguir amarilla.
7. Si empiezas otra tarea en la misma conversación, la pestaña vuelve a amarillo.

Si pulsas **Stop** manualmente, se detecta un error reconocido o navegas a otra página, no se considera una finalización normal y no debe sonar el aviso de finalización.

#### 7. Qué puede y qué no puede vigilar

La extensión vigila las pestañas de ChatGPT abiertas en el **mismo perfil de Chrome** donde está instalada.

No puede garantizar una notificación si:

- has cerrado la pestaña;
- Chrome ha descartado o suspendido profundamente la pestaña;
- Chrome está cerrado;
- el ordenador está en reposo;
- ChatGPT cambia su interfaz y Compatibility Shield no puede identificar la estructura de forma segura.

Si la estructura es desconocida o ambigua, Compatibility Shield se detiene de forma segura en lugar de adivinar y producir una falsa notificación.

#### 8. Solución de problemas

**No se oye el sonido**
1. Abre **`音声と色の設定`**.
2. Comprueba que hay un WAV seleccionado.
3. Pulsa **`音声を1回鳴らす`**.
4. Comprueba el volumen del sistema y que no esté silenciado.
5. Confirma que las notificaciones automáticas están activadas.
6. Después de instalar o actualizar, recarga la pestaña de ChatGPT una vez.
7. Recuerda que una respuesta detenida manualmente no reproduce el sonido de finalización.

**No aparece amarillo/azul**
1. Confirma que **`タブの色も変える`** está activado.
2. Confirma que aceptaste el permiso de grupos de pestañas.
3. Prueba con una pestaña normal de ChatGPT que no esté fijada ni dentro de otro grupo.
4. Las pestañas fijadas, agrupadas previamente o en vista dividida pueden recibir sonido sin color.

**El popup indica que la estructura es incompatible**
- Compatibility Shield no puede identificar de forma segura la estructura actual de ChatGPT.
- Comprueba si existe una [versión más reciente](https://github.com/OPP-studio-macchino/chatgpt-completion-sound/releases/latest).
- Si continúa ocurriendo en la última versión, abre un Issue de GitHub sin incluir texto privado de tus conversaciones.

**El sonido se reproduce más de una vez**
- Comprueba si también está activo otro sistema de aviso, por ejemplo un sonido de finalización de C2C u otra extensión de Chrome.

#### 9. Actualizar a una nueva versión

Para una extensión descomprimida, recomendamos conservar la **misma carpeta permanente**:

1. Descarga el nuevo ZIP desde la página oficial de Releases.
2. Descomprímelo en una carpeta temporal.
3. Espera a que terminen las respuestas de ChatGPT que estén en curso.
4. Sustituye el contenido de la carpeta permanente que Chrome ya está usando por los archivos de la nueva versión.
5. Abre `chrome://extensions`.
6. Busca **ChatGPT Completion Sound / チャッピー完了音** y pulsa **Reload / Recargar**.
7. Recarga una vez las pestañas de ChatGPT que ya estaban abiertas.
8. Abre el popup de la extensión y comprueba la versión mostrada.

Mantener la misma ruta de la carpeta ayuda a que Chrome siga tratando la instalación como la misma extensión descomprimida y facilita conservar la configuración local.

#### 10. Privacidad, explicado de forma sencilla

- El texto de tus conversaciones de ChatGPT **no se envía a un servidor externo por esta extensión**.
- El WAV seleccionado se guarda en el almacenamiento local de la extensión de Chrome.
- No necesitas una clave de la API de OpenAI.
- La función de aviso no necesita código remoto ni telemetría.
- El acceso está limitado a `chatgpt.com` y a las funciones de Chrome documentadas en este README.

## Install from source — developers

If you are contributing to the project or testing the repository directly instead of using a release ZIP:

1. Clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository's `extension/` directory.
6. Open the extension settings and choose a WAV file (5 MB or less).
7. Use **`音声を1回鳴らす`** to verify local audio.
8. Enable automatic notifications; optionally enable tab colors and grant the `tabGroups` permission.

The WAV is copied into Chrome extension storage. The source audio file does not need to remain attached afterward.

## Expected behavior

| Event | Tab state | Sound |
| --- | --- | --- |
| Generating / completion settling | Yellow `チャッピー · 作業中` | No |
| Normal response completion | Blue `チャッピー · 完了` | Once |
| Next job on the same tab | Yellow again | No, until completion |
| Manual stop | Managed completion state is cleared; never becomes blue because of the stop | No |
| Recognized error / navigation | Completion state is cleared | No |
| Extension disabled | Managed groups are released | No |

## Development

Requirements:

- Node.js 20+
- npm
- Python 3 (release validation only)

```bash
npm ci --ignore-scripts
npm test
npm run validate
```

The extension itself has no runtime npm dependencies. `linkedom` is used only by development tests.

### Test coverage

The suite covers state-machine logic, profile/envelope validation, fail-closed compatibility health, the local Canary model, DOM variants, content delivery, hidden-tab behavior and options/permissions. Exact dated counts are in [docs/VALIDATION.md](docs/VALIDATION.md).

The suite specifically covers bugs found during real-device E2E work, including background-tab completion, native timer `Illegal invocation`, visibility-only state transitions, current ChatGPT timeline final controls, service-worker restarts, duplicate delivery, a second job on an already-blue tab, legacy group migration, and manual-stop suppression.

See [docs/VALIDATION.md](docs/VALIDATION.md) for the current automated and real-device acceptance baseline.

## Build a local release ZIP

```bash
npm run build
```

This validates the repository and writes a deterministic unpacked-extension ZIP under `dist/`. It does **not** upload or publish anything.

## Maintenance workflow

This project is maintained as an active OSS project rather than a one-off ZIP:

1. Reproduce bugs with a minimal fixture or real-device E2E case.
2. Add a regression test before or alongside the fix.
3. Run CI on every pull request.
4. Review permission or privacy changes explicitly.
5. Keep release notes in [CHANGELOG.md](CHANGELOG.md).
6. Triage bug reports and security reports separately.

See [MAINTAINERS.md](MAINTAINERS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Codex and maintainer automation

The repository is intentionally structured for agent-assisted maintenance: small modules, explicit state machines, deterministic fixtures, an `AGENTS.md`, and regression tests for browser lifecycle failures.

Useful Codex workflows include:

- PR review and regression-test generation.
- Issue triage and reproduction planning.
- DOM-change analysis when ChatGPT UI structure changes.
- Release validation and changelog preparation.
- Security review of message origin checks, permission boundaries, persistent state migrations, and offscreen audio handling.

The project is also a good candidate for **Codex Security** because browser extensions combine privileged browser APIs, injected page code, cross-context messaging, persistent storage, and permission boundaries. Security findings still require human review before any patch is merged.

## Roadmap

- [ ] Public beta packaging and reproducible release artifacts.
- [ ] More real-device E2E scenarios across Chrome versions and macOS releases.
- [ ] Fixtures for additional ChatGPT UI variations without storing real conversation content.
- [ ] Automated package integrity checks in CI.
- [ ] Accessibility and localization improvements.
- [ ] Chrome Web Store release after public-release acceptance criteria are met.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first. For security-sensitive reports, use the process in [SECURITY.md](SECURITY.md) rather than posting exploit details in a public issue.

## 日本語概要

「チャッピー完了音」は、開いているChatGPTタブの回答生成を監視し、**作業中は黄色、完了時は青色＋好きなWAV音声**で知らせるChrome拡張です。別タブを見ていても完了通知できること、同じタブで次の作業を始めると黄色へ戻ること、手動停止では完了音・青色を出さないことを重要な受入条件にしています。

会話本文や選択した音声を外部サーバーへ送信する実装はありません。開発・不具合報告・PRはこのリポジトリで公開して継続的に管理します。

## License

[MIT](LICENSE)

## Disclaimer

This is an independent open-source project and is **not an official OpenAI or ChatGPT extension**. “ChatGPT” is used only to describe compatibility with the ChatGPT web application.
