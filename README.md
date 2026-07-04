# もちぽよバトラーズ

かわいい「もちぽよ」を集めて・育てて・バトルするブラウザゲーム。

- HTML / CSS / Vanilla JavaScript（ES Modules）
- ビルド不要の静的サイト。`index.html` をHTTPサーバ経由で開くだけで動く
- セーブは LocalStorage（キー: `mochipoyo_battlers_save_v1`）
- モンスター・スキル・アイテム・ステージのデータは `data/` に分離

## ローカルで遊ぶ

```bash
npx serve .
```

## デプロイ

Vercel に静的サイトとしてそのままデプロイ可能（ビルド設定不要）。

## 画像素材

`assets/monsters/icon/`（丸枠用・正方形）と `assets/monsters/full/`（全身・縦長）に配置。
未配置のキャラは絵文字プレースホルダーで表示される。
