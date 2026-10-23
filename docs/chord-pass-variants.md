# 指定遍數替代和弦

`Bar.chordPassVariants` 保留原譜指定「第二遍」等和弦。每筆資料有整數 `pass >= 2`、`chords` 與選用的 `chordSubdivisions`；使用本小節原調與既有拍位格式。原小節的 `chords`、`chordMarks`、`chordSubdivisions` 是首遍和弦，也適用於沒有指定替代和弦的其他遍數。

《恩典之流》主歌第 5 格：

```json
{
  "chords": ["C", "", "C/E", ""],
  "chordPassVariants": [{ "pass": 2, "chords": ["C/E", "", "C7", ""] }]
}
```

`selectChordPass` 與 `getChordPassEvents` 依指定遍數解析同一小節的和弦與攻擊拍位；替代和弦不繼承首遍的拍內偏移。預覽及匯出列出各替代遍數和弦與原和弦，使用同樣的移調、capo 與數字和弦顯示。兩個編輯器均可新增、編輯、移除指定遍數和弦；複製、貼上、移調、存檔與復原保留這些資料。

此欄位只記錄條件和弦，不新增小節、反覆線或自動推定演奏路線。沒有原譜依據時不建立替代版本。編輯首遍和弦不會同步覆蓋其他遍數；插入拍位則將各遍數的和弦一起移動。

未量出拍內時間的原譜箭頭只存方向字尾，不建立 `chordSubdivisions` 或半拍偏移。歌曲的 `chordTimingVersion` 同時適用首遍與指定遍數和弦；舊格式載入時兩者一起遷移，重存後不再次交換方向。
