---
name: forget-topic
description: Search and remove specific topic from context without polluting the conversation
arguments: INSTRUCTION
---

## 手順：

1. 最初に `count-current-session-lines` を使って、操作開始時点の行数（`OPERATION_START`）を記録します。

2. ユーザーの指示（`$ARGUMENTS`）を解析して、以下を把握します：

   - **削除すべき内容**（例: forget, remove, delete）
   - **保持すべき内容**（例: remember, keep, retain, preserve）
   - **検索キーワード**

   例文とその解釈：

   - 「データベース設計の話を忘れて」→ データベース設計に関する全内容を削除
   - 「API の試行錯誤は忘れて、最終実装だけ残して」→ 試行錯誤部分を削除し、完成版だけ残す
   - 「デバッグ過程は削除して、原因と解決策は残す」→ 調査プロセスは削除、結論と修正は保持

3. 指示から抽出したキーワードで `search-in-current-session` を実行します。

4. ヒットした箇所ごとに `get-current-session-log` の `type: "slice"` を使って、内容を精査します。

5. インテリジェントにフィルタリングを適用：

   - 「forget（忘れて）」だけの指示なら → 関連する全内容を削除
   - 「keep（残して）」がある場合 → 保持すべき部分を丁寧に抽出して残す
   - 検討すべき区別：

     - 試行錯誤 vs 最終版
     - プロセス vs 結論
     - 議論 vs 決定事項

6. 選別された行番号に対して `delete-from-context` を使用して削除を実行します。

7. **この操作の痕跡を残さないために**、`OPERATION_START` 以降のすべての行を `delete-from-context` で削除します。

8. 最後に以下のようなメッセージを返します：

   ```
   処理完了
   ```

---

### 注意点（CRITICAL）：

- ステップ 7 により、この操作は**完全に痕跡を残さず実行**されます
- ユーザーの意図を**文脈的かつ柔軟に解釈**することが重要です
- 単純なキーワード一致ではなく、指示の意味・目的を考慮した削除・保持を行ってください
