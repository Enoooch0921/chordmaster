# 原譜括號和弦

完整和弦的外括號是來源文字，儲存與移調不能剝除。例如G調的(G/B)移到A調為(A/C#)，數字為(1/3)，並且能由數字轉回相同帶括號和弦。C(add9)的括號是和弦性質，仍照舊解析。

musicUtils 的 getParenthesizedChordInner只拆配對且內部起始為和弦root／數字degree的全和弦外括號；transposeChord、normalizeChordEnharmonic、getNashvilleNumber、parseNashvilleToChord、isNashville都保留外括號。ChordSheet沿用內部formatter排版root、性質及slashbass，再畫外括號。沒有推定括號和弦的拍數、攻擊時間或演奏遍次。

回歸證據：src/lib/parenthesizedChords.test.tsx，修前(G/B)→(G/C#)、(G/3)兩種錯誤可重現；修後文字移調／數字正反轉／性質括號／原調未定／三列布局／儲存／keychange／跨拍號剪貼簿通過。第1555批真實原譜的两個(G/B)另做桌面與手機驗證。這是本機改動，尚未發布。
