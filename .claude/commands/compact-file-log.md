---
name: compact-file-log
description: Interactively remove file read operations to free up context space
arguments:
---

### 手順：

1. 最初に、`count-current-session-lines` を使って開始行（`OPERATION_START`）を記録します。

2. `extract-file-read-results` を `type: "all"` で実行して、すべてのファイル読み込み操作を抽出します。

3. 以下のような形式で番号付きリスト（同じファイルへの複数の読み込みはグループ化）を表示します：

   ```
   セッション内のファイル読み込み操作:
   1. /src/components/Button.tsx（行: 120, 245, 380）
   2. /src/components/Button.css（行: 145）
   3. package.json（行: 200, 412）
   4. node_modules/react/index.js（行: 250, 278, 301, 345）
   5. /src/utils/api.ts（行: 467）
   ...

   どれを削除しますか？（例: 1,2,4 または 1-5 または all）:
   ```

   ※このプロンプトの言語は、ユーザーの使用言語に合わせて適宜調整します。

4. ユーザーの入力を待ち、次のように解析します：

   - 個別番号: `"1,3,5"` → 指定されたファイルすべての読み込みを削除
   - 範囲: `"1-5"` → 指定範囲内すべてのファイル読み込みを削除
   - 全部: `"all"` → すべてのファイル読み込みを削除
   - 削除しない: `"none"` または空入力

5. 選択されたファイルの全行番号に対して `delete-from-context` を実行します。

6. 操作の痕跡を残さないため、`OPERATION_START` 以降の行を `delete-from-context` で削除します。

7. 処理結果をまとめて返します：

   ```
   X 件のファイル読み込み操作を削除しました
   ```

---

**重要**: あるファイルが選択されると、そのファイルに関するすべての読み込み操作が削除されます。手順 6 で、この操作自体の記録も削除されます。
