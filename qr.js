// מקודד QR מינימלי: מצב בייטים, תיקון שגיאות L, גרסאות 1-5. מוטמע ולא נטען מרשת,
// כדי שהחדר ייפתח גם בלי אינטרנט. אומת בהרצה חוזרת מול המפענח jsQR של האפליקציה.
const QR = (() => {
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  // מקדמי פולינום מחולל לתיקון שגיאות
  function genPoly(n) {
    let p = [1];
    for (let i = 0; i < n; i++) {
      const q = [...p, 0];
      for (let j = 0; j < p.length; j++) q[j + 1] ^= mul(p[j], EXP[i]);
      p = q;
    }
    return p;
  }
  function ecc(data, n) {
    const g = genPoly(n), res = new Uint8Array(data.length + n);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const c = res[i];
      if (!c) continue;
      for (let j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], c);
    }
    return res.slice(data.length);
  }

  // רמת תיקון L, גרסאות 1-5 בלבד: כולן בלוק יחיד, ולכן אין שזירה ואין בלוק מידע גרסה.
  // [מילות נתונים, מילות תיקון]. די והותר לכתובת החדר.
  const VER = { 1: [19, 7], 2: [34, 10], 3: [55, 15], 4: [80, 20], 5: [108, 26] };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] };

  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    let ver = 0;
    for (let v = 1; v <= 5; v++) if (bytes.length + 2 <= VER[v][0]) { ver = v; break; }
    if (!ver) throw new Error('too long for QR v5');
    const [cap, eccLen] = VER[ver];
    const size = 17 + ver * 4;

    // ---- זרם ביטים: מזהה מצב, אורך, נתונים, ריפוד ----
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    push(4, 4);                                   // מצב בייטים
    push(bytes.length, 8);
    for (const b of bytes) push(b, 8);
    const totalBits = cap * 8;
    for (let i = 0; i < 4 && bits.length < totalBits; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    const PAD = [0xec, 0x11];
    for (let i = 0; data.length < cap; i++) data.push(PAD[i % 2]);

    // ---- תיקון שגיאות. בלוק יחיד, ולכן הנתונים ואחריהם בתי התיקון ----
    const out = [...data, ...ecc(Uint8Array.from(data), eccLen)];

    // ---- פריסת המודולים ----
    const m = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const setF = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) m[r][c] = v; };
    const finder = (r, c) => {
      for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
        const inRing = (i === 0 || i === 6 || j === 0 || j === 6);
        const inCore = (i >= 2 && i <= 4 && j >= 2 && j <= 4);
        setF(r + i, c + j, (i >= 0 && i <= 6 && j >= 0 && j <= 6 && (inRing || inCore)) ? 1 : 0);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) { m[6][i] = i % 2 ? 0 : 1; m[i][6] = i % 2 ? 0 : 1; }
    for (const a of ALIGN[ver]) for (const b of ALIGN[ver]) {
      if ((a < 8 && b < 8) || (a < 8 && b > size - 9) || (a > size - 9 && b < 8)) continue;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++)
        m[a + i][b + j] = (Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0)) ? 1 : 0;
    }
    m[size - 8][8] = 1;                            // מודול קבוע

    // שמירת מקום לביטי הפורמט
    const fmtCells = [];
    for (let i = 0; i <= 5; i++) fmtCells.push([8, i], [i, 8]);
    fmtCells.push([8, 7], [8, 8], [7, 8]);
    for (let i = 0; i < 8; i++) fmtCells.push([8, size - 1 - i]);
    for (let i = 0; i < 7; i++) fmtCells.push([size - 1 - i, 8]);
    for (const [r, c] of fmtCells) if (m[r][c] === -1) m[r][c] = 0;

    // זיגזג מימין לשמאל, שתי עמודות בכל פעם
    const free = [];
    let up = true;
    for (let c = size - 1; c > 0; c -= 2) {
      if (c === 6) c--;                            // דילוג על עמודת התזמון
      for (let k = 0; k < size; k++) {
        const r = up ? size - 1 - k : k;
        for (const cc of [c, c - 1]) if (m[r][cc] === -1) free.push([r, cc]);
      }
      up = !up;
    }
    free.forEach(([r, c], i) => {
      const byte = out[i >> 3];
      m[r][c] = byte === undefined ? 0 : (byte >> (7 - (i & 7))) & 1;
    });

    // ---- מיסוך: בוחרים את המסכה עם ציון העונשין הנמוך ביותר ----
    const MASKS = [
      (r, c) => (r + c) % 2, (r, c) => r % 2, (r, c) => c % 3,
      (r, c) => (r + c) % 3, (r, c) => (((r / 2) | 0) + ((c / 3) | 0)) % 2,
      (r, c) => ((r * c) % 2) + ((r * c) % 3), (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2,
    ];
    let best = null, bestScore = Infinity;
    for (let mk = 0; mk < 8; mk++) {
      const g = m.map(row => Int8Array.from(row));
      for (const [r, c] of free) if (MASKS[mk](r, c) === 0) g[r][c] ^= 1;
      // ביטי פורמט: רמת תיקון L היא 01, ואחריהם מספר המסכה, עם BCH ו-XOR קבוע
      let fmt = (1 << 3) | mk, rem = fmt;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) * 0x537);
      const bitsF = ((fmt << 10) | rem) ^ 0x5412;
      // עותק ראשון סביב הפינה השמאלית העליונה, עותק שני מפוצל בין העמודה
      // התחתונה (ביטים 0-6) לשורה הימנית (ביטים 7-14)
      const put = (i, v) => {
        if (i < 6) g[8][i] = v;
        else if (i === 6) g[8][7] = v;
        else if (i === 7) g[8][8] = v;
        else if (i === 8) g[7][8] = v;
        else g[14 - i][8] = v;
        if (i < 7) g[size - 1 - i][8] = v;
        else g[8][size - 15 + i] = v;
      };
      // הביט הגבוה נכתב ראשון: התא (8,0) מחזיק את ביט 14, לא את ביט 0
      for (let i = 0; i < 15; i++) put(i, (bitsF >> (14 - i)) & 1);
      let score = 0;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        if (c < size - 1 && r < size - 1 && g[r][c] === g[r][c+1] && g[r][c] === g[r+1][c] && g[r][c] === g[r+1][c+1]) score += 3;
      }
      for (let r = 0; r < size; r++) {
        let run = 1;
        for (let c = 1; c < size; c++) {
          if (g[r][c] === g[r][c-1]) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
          else run = 1;
        }
      }
      let dark = 0;
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += g[r][c];
      score += Math.floor(Math.abs(dark * 100 / (size * size) - 50) / 5) * 10;
      if (score < bestScore) { bestScore = score; best = g; }
    }
    return { size, modules: best };
  }

  // ציור על קנבס: שחור על לבן עם שוליים שקטים, אחרת מצלמות לא מפענחות
  function draw(canvas, text, px = 240, quiet = 4) {
    const { size, modules } = encode(text);
    const total = size + quiet * 2;
    const scale = Math.max(1, Math.floor(px / total));
    canvas.width = canvas.height = total * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      if (modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    return canvas;
  }
  return { encode, draw };
})();

window.QR = QR;
