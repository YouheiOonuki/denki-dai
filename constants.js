// ===========================
// 家電の電気代・節約額シミュレーター — 単価・目安値・節約の効果（値・出典・確認日をセットで）
// 値はすべて公式の資料の本文から写したもの。出典の無い値は置かない（W が分からない品目は空にして、本体の表示を入れてもらう）
// ブラウザでは window.Constants、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var SOURCES = {
    eftc: {
      label: 'よくある質問 Q&A（電力料金の目安単価）',
      publisher: '公益社団法人 全国家庭電気製品公正取引協議会',
      url: 'https://www.eftc.or.jp/qa/',
      note: '現在の目安単価は、令和4年7月22日に改定された31円/kWh(税込)',
    },
    howto_air: {
      label: '無理のない省エネ節約（空調）',
      publisher: '資源エネルギー庁 省エネポータルサイト',
      url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/general/howto/airconditioning/index.html',
    },
    howto_kitchen: {
      label: '無理のない省エネ節約（キッチン）',
      publisher: '資源エネルギー庁 省エネポータルサイト',
      url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/general/howto/kitchen/index.html',
    },
    howto_ent: {
      label: '無理のない省エネ節約（娯楽）',
      publisher: '資源エネルギー庁 省エネポータルサイト',
      url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/general/howto/entertainment/index.html',
    },
    howto_light: {
      label: '無理のない省エネ節約（照明）',
      publisher: '資源エネルギー庁 省エネポータルサイト',
      url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/general/howto/lighting/index.html',
    },
    howto_clean: {
      label: '無理のない省エネ節約（洗濯・掃除）',
      publisher: '資源エネルギー庁 省エネポータルサイト',
      url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/general/howto/cleaning/index.html',
    },
    howto_bath: {
      label: '無理のない省エネ節約（トイレ）',
      publisher: '資源エネルギー庁 省エネポータルサイト',
      url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/general/howto/bathtoilet/index.html',
    },
    choice: {
      label: '機器の買換で省エネ節約',
      publisher: '資源エネルギー庁 省エネポータルサイト',
      url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/general/choice/',
    },
    catalog: {
      label: '省エネ性能カタログ 2025年版（PDF）',
      publisher: '資源エネルギー庁 省エネ型製品情報サイト',
      url: 'https://seihinjyoho.go.jp/frontguide/pdf/catalog/2025/catalog2025.pdf',
      note: 'エアコンは冷房能力 2.2kW（6 畳）の一覧の平均値 678kWh（期間消費電力量）、冷蔵庫は間冷式・定格内容積 401〜450L の一覧の平均値 286kWh/年（平均 418L）。カタログの目安電気料金は 27 円/kWh（統一省エネラベルの単価）で計算されている',
    },
    user: {
      label: 'お手持ちの製品の表示',
      publisher: '—',
      url: 'https://www.enecho.meti.go.jp/category/saving_and_new/saving/general/choice/',
      note: '公式の目安値が無い品目。本体の銘板・取扱説明書・カタログの値を入れてもらう',
    },
  };

  var CONSTANTS = {
    CHECKED: '2026-09-23',   // 下の出典の本文を取得して確かめた日
    STALE_MONTHS: 12,        // 確認日からこの月数がたったら画面に注意を出す
    SOURCES: SOURCES,

    UNIT_PRICE: { value: 31, label: '新電力料金目安単価（税込）', source: 'eftc', url: SOURCES.eftc.url, revised: '2022-07-22' },

    // 家電のプリセット。method: 'wh'（W×時間）| 'annual'（年間消費電力量）
    // W は省エネポータルの条件から逆算した値（例: テレビは「1 日 1 時間減らすと年 28.87kWh」→ 28.87 ÷ 365 × 1000 ≒ 79W）
    // 冷蔵庫・エアコンの年間消費電力量は、省エネ性能カタログの一覧の平均値（出典 catalog）
    PRESETS: [
      { key: 'aircon', kind: 'aircon', name: 'エアコン（6 畳用）', method: 'annual', annualKwh: 678, source: 'catalog', hint: '省エネ性能カタログ 2025 年版の冷房能力 2.2kW の平均値。お手持ちの製品の「期間消費電力量」にすると正確です' },
      { key: 'fridge', kind: 'fridge', name: '冷蔵庫（400L 台）', method: 'annual', annualKwh: 286, source: 'catalog', hint: '省エネ性能カタログ 2025 年版の 401〜450L の平均値。お手持ちの製品の「年間消費電力量」にすると正確です' },
      { key: 'tv', kind: 'tv', name: 'テレビ（液晶 50V 型）', method: 'wh', watt: 79, hours: 5, days: 30, standbyW: 0, source: 'howto_ent', hint: '1 日 1 時間減らすと年 28.87kWh（省エネポータル）から逆算' },
      { key: 'pc_desk', kind: 'pc', name: 'パソコン（デスクトップ）', method: 'wh', watt: 86, hours: 3, days: 30, standbyW: 0, source: 'howto_ent', hint: '1 日 1 時間短縮で年 31.57kWh（省エネポータル）から逆算' },
      { key: 'pc_note', kind: 'pc', name: 'パソコン（ノート）', method: 'wh', watt: 15, hours: 3, days: 30, standbyW: 0, source: 'howto_ent', hint: '1 日 1 時間短縮で年 5.48kWh（省エネポータル）から逆算' },
      { key: 'led_bulb', kind: 'led', name: '照明（電球形 LED ランプ）', method: 'wh', watt: 7.5, hours: 5, days: 30, qty: 3, standbyW: 0, source: 'howto_light', hint: '省エネポータルの条件の 7.5W' },
      { key: 'led_ceiling', kind: 'led', name: '照明（LED 照明器具）', method: 'wh', watt: 34, hours: 5, days: 30, standbyW: 0, source: 'howto_light', hint: '省エネポータルの条件の 34W' },
      { key: 'incandescent', kind: 'incandescent', name: '照明（白熱電球）', method: 'wh', watt: 54, hours: 5, days: 30, standbyW: 0, source: 'howto_light', hint: '省エネポータルの条件の 54W' },
      { key: 'fluorescent', kind: 'fluorescent', name: '照明（蛍光灯器具）', method: 'wh', watt: 68, hours: 5, days: 30, standbyW: 0, source: 'howto_light', hint: '省エネポータルの条件の 68W' },
      { key: 'vacuum', kind: 'vacuum', name: '掃除機', method: 'wh', watt: 900, hours: 0.25, days: 30, standbyW: 0, source: 'howto_clean', hint: '1 日 1 分短縮で年 5.45kWh（省エネポータル）から逆算' },
      { key: 'pot', kind: 'pot', name: '電気ポット', method: 'wh', watt: null, hours: 1, days: 30, standbyW: 0, source: 'user', hint: '本体の消費電力（W）を入れてください' },
      { key: 'toilet', kind: 'toilet', name: '温水洗浄便座', method: 'wh', watt: null, hours: 24, days: 30, standbyW: 0, source: 'user', hint: '本体の消費電力（W）か、年間消費電力量を入れてください' },
      { key: 'microwave', kind: 'other', name: '電子レンジ', method: 'wh', watt: null, hours: 0.2, days: 30, standbyW: 0, source: 'user', hint: '本体の消費電力（W）を入れてください' },
      { key: 'dryer', kind: 'other', name: 'ドライヤー', method: 'wh', watt: null, hours: 0.2, days: 30, standbyW: 0, source: 'user', hint: '本体の消費電力（W）を入れてください' },
      { key: 'circulator', kind: 'other', name: 'サーキュレーター・扇風機', method: 'wh', watt: null, hours: 8, days: 30, standbyW: 0, source: 'user', hint: '本体の消費電力（W）を入れてください' },
      { key: 'custom', kind: 'other', name: 'その他の家電', method: 'wh', watt: null, hours: 1, days: 30, standbyW: 0, source: 'user', hint: '消費電力（W）と使う時間を入れてください' },
    ],

    // 品目（kind）ごとの、使い方の見直しによる年間の節約電力量（kWh/年）。値と条件は省エネポータルの本文のとおり
    TIPS: {
      aircon: [
        { label: '冷房の設定温度を 1℃上げる（27℃→28℃）', kwhYear: 30.24, condition: '外気温度 31℃、2.2kW、1 日 9 時間', source: 'howto_air' },
        { label: '暖房の設定温度を 1℃下げる（21℃→20℃）', kwhYear: 53.08, condition: '外気温度 6℃、2.2kW、1 日 9 時間', source: 'howto_air' },
        { label: '冷房を 1 日 1 時間短くする', kwhYear: 18.78, condition: '設定温度 28℃', source: 'howto_air' },
        { label: '暖房を 1 日 1 時間短くする', kwhYear: 40.73, condition: '設定温度 20℃', source: 'howto_air' },
        { label: 'フィルターを月に 1〜2 回掃除する', kwhYear: 31.95, condition: '目詰まりしている 2.2kW のエアコンとの比較', source: 'howto_air' },
      ],
      fridge: [
        { label: '設定温度を「強」から「中」にする', kwhYear: 61.72, condition: '周囲温度 22℃', source: 'howto_kitchen' },
        { label: '壁から適切な間隔をあけて置く', kwhYear: 45.08, condition: '上と両側が壁に接している場合と、片側が接している場合の比較', source: 'howto_kitchen' },
        { label: 'ものを詰め込みすぎない', kwhYear: 43.84, condition: '詰め込んだ場合と、半分にした場合の比較', source: 'howto_kitchen' },
        { label: '無駄な開け閉めをしない', kwhYear: 10.40, condition: '旧 JIS の開閉回数と、その 2 倍の比較', source: 'howto_kitchen' },
        { label: '開けている時間を短くする', kwhYear: 6.10, condition: '20 秒と 10 秒の比較', source: 'howto_kitchen' },
      ],
      tv: [
        { label: '画面の明るさ（輝度）を 1 割下げる', kwhYear: 18.73, condition: '液晶 50V 型', source: 'howto_ent' },
      ],
      incandescent: [
        { label: '電球形 LED ランプ（7.5W）に替える', kwhYear: 93.00, condition: '54W の白熱電球から交換、年間 2,000 時間点灯。1 灯あたり', source: 'howto_light' },
      ],
      fluorescent: [
        { label: 'LED 照明器具（34W）に替える', kwhYear: 68.00, condition: '68W の蛍光灯器具から交換、年間 2,000 時間点灯。1 台あたり', source: 'howto_light' },
      ],
      pot: [
        { label: '長く使わないときはプラグを抜く', kwhYear: 107.45, condition: '2.2L を沸かして 1.2L 使い、6 時間保温する場合と、保温せず再沸騰する場合の比較', source: 'howto_kitchen' },
      ],
      toilet: [
        { label: '使わないときはフタを閉める', kwhYear: 34.90, condition: '貯湯式', source: 'howto_bath' },
        { label: '便座の温度を一段階下げる（中→弱）', kwhYear: 26.40, condition: '貯湯式、冷房期間はオフ', source: 'howto_bath' },
        { label: '洗浄水の温度を一段階下げる（中→弱）', kwhYear: 13.80, condition: '貯湯式', source: 'howto_bath' },
      ],
    },

    // 買い替えの目安（10 年前の製品との比較。省エネポータル「機器の買換で省エネ節約」）
    REPLACE_HINTS: [
      { name: '冷蔵庫', text: '今どきの冷蔵庫は 10 年前と比べて約 15〜24% の省エネ', source: 'choice' },
      { name: 'エアコン', text: '今どきの省エネタイプのエアコンは 10 年前と比べて約 13% の省エネ', source: 'choice' },
      { name: '温水洗浄便座', text: '今どきの省エネタイプの温水洗浄便座は 10 年前と比べて約 9% の省エネ', source: 'choice' },
      { name: '照明', text: '電球形 LED ランプは白熱電球と比べて約 86% の省エネ', source: 'choice' },
    ],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONSTANTS;
  else root.Constants = CONSTANTS;
})(this);
