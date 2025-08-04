# Claude Code Context 管理 MCP サーバー

## 背景

Claude Code でのモノレポ開発において、以下のような課題がありました：

- **同じセッションで作業を続けていると性能が落ちていく**: コンテキストが増えすぎて Claude の応答が遅くなったり精度が落ちる
- **別のセッションに切り替えると前提からインプットしなければいけない**: 前回の議論や設計決定を最初から説明し直すのが面倒
- **ファイル読み込み結果がコンテキストを圧迫**: 一度読んだファイルの内容がずっと残り続けて、本当に必要な情報が埋もれる
- **不要になった話題を忘れさせたい**: 試行錯誤の過程や古い議論など、もう参照しない情報を Claude に忘れさせたい

そこで、Claude に「忘れてもらいたいもの」と「覚えておいてもらいたいもの」を選択的に管理できるツールを作ることにしました。

## 作ったもの

この MCP サーバーは Claude Code のセッションファイル（JSONL 形式）を直接操作して、コンテキストの選択的な管理を可能にします。

### できること

**最大の問題「ファイル読み込み」の解決**

- Claude Code でコンテキストを圧迫する最大の要因はファイル読み込み結果
- どのファイルを読んだかを一覧で確認
- 不要になったファイルの内容を Claude に「忘れさせる」

**特定の話題を忘れさせる**

- 「XX の話題についてこのセッションのコンテキストから削除して」のような指示が可能
- 試行錯誤の過程や古い議論を選択的に削除
- 重要な結論だけを残して途中経過は忘れさせる

**セッション間での情報共有**

- 過去のセッションから重要な部分を検索
- 現在のセッションに必要な情報だけをインポート
- セッションをまたいだ継続的な作業が可能

**インタラクティブなセッション要約・コンパクト**

- `/custom-compact` コマンドでセッション全体を効率的に要約
- フェーズ別に会話を整理し、重要な内容だけを残す
- ユーザーと対話しながら安全にコンテキストを圧縮

## 使用例

**ファイル読み込み結果でコンテキストが圧迫されたとき**

1. `/compact-file-log` コマンドを実行
2. 読み込んだファイルの一覧が表示される
3. 不要になったファイルを選んで Claude に忘れさせる

**特定の話題を忘れさせたい**

1. `/forget-topic` コマンドを使用
   - `/forget-topic データベース設計の議論について忘れて`
   - `/forget-topic API実装の試行錯誤は忘れて、最終的な実装だけ覚えておいて`
   - `/forget-topic バグ調査の過程は忘れて、原因と解決策だけ残して`
2. 特定の話題を忘れされることができる

**前のセッションの情報が欲しいとき**

1. `search-across-sessions` でキーワード検索
2. 見つかった重要な情報を `import-from-session` で現在のセッションに取り込み

**間違えて削除してしまったとき**

1. `restore-to-context` で元に戻す（バックアップがあるので安全）

## 技術的な仕組み

### MCP サーバーの機能

**9 個のツール関数で包括的なセッション管理**

- **ログ操作**: 取得・検索・削除・復元・置換
- **セッション間連携**: 横断検索・インポート
- **ファイル管理**: 読み込み結果の特定と整理
- **行数管理**: セッションサイズの把握

### 自動化の部分

**Hooks (.claude/settings.json)**

- MCP ツール実行前：現在のセッションファイルの場所を自動取得
- セッション終了時：ファイル整合性の自動保証（MCP でログを操作するとファイルが壊れることがあるので、それを自動修正）

**カスタムコマンド (.claude/commands/)**

- `/compact-file-log`: ファイル読み込み結果の効率的な整理
- `/forget-topic`: 自然言語指示による話題削除
- `/custom-compact`: 自然言語によるコンパクト

## 制限事項・注意点

- **実験的なツール**: Claude Code のファイルを直接操作するため、仕様変更で動かなくなる可能性があります

## 導入方法

この MCP サーバーを自分のプロジェクトで使用する方法：

### 1. MCP サーバーのセットアップ

まず、この MCP サーバーをビルドします：

```bash
# このリポジトリをクローン（任意の場所）
git clone https://github.com/your-username/claude-contest-mcp.git ~/claude-context-mcp
cd ~/claude-context-mcp

# 依存関係のインストールとビルド
npm install
npm run build

# ビルド済みファイルのパスを確認
npm run path  # このパスをコピーしておく
```

### 2. プロジェクトへの導入

あなたのプロジェクトで以下の設定を行います：

```bash
cd /path/to/your/project
```

#### MCP 設定（`.mcp.json`）

プロジェクトルートに`.mcp.json`を作成：

```json
{
  "mcpServers": {
    "claude-context": {
      "command": "node",
      "args": ["/path/to/claude-context-mcp/dist/index.js"]
    }
  }
}
```

#### Hooks 設定（`.claude/settings.json`）

Hooks の設定は`.claude/settings.json`に追加：

```bash
mkdir -p .claude
```

`.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__claude-context__.*",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.transcript_path' | jq -n --arg path \"$(cat)\" '{\"transcript_path\": $path}' > .claude/session-config.json"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/claude-context-mcp/scripts/fix-claude-jsonl/dist/fix-jsonl.js \"$(jq -r '.transcript_path')\""
          }
        ]
      }
    ]
  }
}
```

注意: `Stop`フックのパスは実際のインストール先に合わせて変更してください。

### 前提条件

- Claude Code の最新版
- jq（JSON プロセッサー）がインストールされていること

### トラブルシューティング

- **MCP サーバーが認識されない場合**: `.mcp.json`のパスが正しいか確認し、Claude Code を再起動
- **コマンドが動作しない場合**: `.claude/commands/`ディレクトリにコマンドがコピーされているか確認
- **Hooks が動作しない場合**: `.claude/settings.json`の設定を確認
- **fix-jsonl が動作しない場合**: 実行権限があることを確認 (`chmod +x /path/to/fix-jsonl`)
