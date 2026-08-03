// ---------- מסיבה בלי קלפים: מארח, שחקן ומצב מכשיר יחיד ----------
// ראו party_core.js לתשתית ולחוקים. כאן יושבות מכונת המצבים של המארח,
// הלקוח שרץ בטלפון, וכל המסכים.
(() => {
  const P = window.Party;
  const { Net, renderTimeline, correct, insertAt, draw, gapLabel, labelToNode, COLORS,
          LS_ME, LS_ROOM, LS_CFG, $, el, bdi, B } = P;

  const show = id => {
    // אנימציית מסך הבית אינה נעצרת מכאן מעצמה, והמכשיר הזה מנגן, מאיר ומשמש לוח
    // לכל הערב. קנבס מלא ב-60 פריימים לשנייה הוא חום וסוללה שאין להם קונה.
    try { B().fxStop(); } catch (e) {}
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const s = $(id);
    if (s) s.classList.add('active');
  };
  // טקסט לבן על צהוב או על מנטה אינו נקרא. שמונה צבעי המושבים כוללים ארבעה בהירים,
  // ולכן צבע הכתב נגזר מהבהירות של הרקע ולא נקבע מראש.
  const ink = c => {
    const n = parseInt(String(c).slice(1), 16);
    const lum = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
    return lum > 150 ? '#12081f' : '#fff';
  };
  const cfg = () => {
    try { return JSON.parse(localStorage.getItem(LS_CFG) || '{}'); } catch (e) { return {}; }
  };
  const setCfg = o => localStorage.setItem(LS_CFG, JSON.stringify({ ...cfg(), ...o }));
  const target = () => cfg().target || 10;

  // ============================================================
  // מארח
  // ============================================================
  const Host = (() => {
    let S = null;          // {code, seats:[], round, phase, song, target, solo}
    let seq = 0;
    // דור המשחק. לולאת טעינת השיר רצה עם await, ויציאה באמצע חייבת לעצור אותה,
    // אחרת שיר ממשיך להתנגן על מסך הבית בלי שום כפתור שיעצור אותו.
    let alive = 0;
    // סיבוב אחד בכל רגע. "השיר הבא", "מתחילים" ו"שיר אחר" כולם קוראים ל-nextRound,
    // ושתי לולאות במקביל גונבות זו לזו את הנגינה ורושמות שיר אחר מזה שהשולחן שמע.
    let busy = false;
    // מסך המנצח נקבע בהשהיה. בלי הידית הזאת הוא נוחת גם על סיבוב חדש שנפתח בינתיים.
    let winTimer = null;
    // שחזור אחד בכל רגע. הוא מריץ טעינת מאגר והקמת חדר, ושתי כניסות פותחות
    // שני עמיתים על אותו קוד ומפילות את החדר שכבר עלה.
    let resuming = false;
    // החדר לא נפתח מחדש בשחזור. הלוח והמוזיקה ממשיכים, אבל הטלפונים לא יחזרו,
    // וזה חייב להיאמר על הבמה, המסך היחיד שהשחזור באמת מציג.
    let noRoom = false;
    const seats = () => S ? S.seats : [];
    const online = () => seats().filter(s => s.online);

    function fresh(code, solo) {
      clearTimeout(winTimer); winTimer = null;
      busy = false;
      S = { code, seats: [], round: 0, phase: 'lobby', song: null,
            target: target(), solo: !!solo, winner: null, log: [] };
      seq = 0;
      noRoom = false;
      alive++;
    }
    function kill() {
      clearTimeout(winTimer); winTimer = null;
      busy = false;
      alive++; S = null;
      // משחק שהסתיים בכוונה אינו ממתין לשחזור בפתיחה הבאה
      try { localStorage.removeItem(LS_ROOM); } catch (e) {}
    }
    // טקסט בלבד, בלי למחוק את האייקון שיושב בתוך הכפתור
    const btnLabel = (b, txt) => {
      if (!b) return;
      const t = [...b.childNodes].find(n => n.nodeType === 3);
      if (t) t.textContent = txt; else b.appendChild(document.createTextNode(txt));
    };
    const lockButtons = on => {
      const n = $('lg-next-btn'); if (n) n.disabled = on;
      if (on) $('lg-reveal-btn').disabled = true;
    };
    // קישור העֵרה על הבמה: נוצר פעם אחת ומוסתר. הכפתור הירוק המקורי יושב במסך
    // הנגינה של משחק הקלפים, שאינו מוצג כלל במסיבה.
    function wakeLink(on) {
      let a = $('lg-wake');
      if (!a) {
        if (!on) return;
        a = el('a', 'big green');
        a.id = 'lg-wake';
        a.target = '_blank'; a.rel = 'noopener';
        a.style.cssText = 'display:none;text-decoration:none;padding:14px 10px;margin-top:10px';
        a.textContent = 'להעיר את ספוטיפיי';
        const st = $('s-lg-stage');
        (st.querySelector('.body') || st).appendChild(a);
      }
      try { a.href = B().wakeUrl(); } catch (e) {}
      a.style.display = on ? 'block' : 'none';
    }
    // חותמת זמן: מכשיר המארח נסגר על ידי המערכת באמצע ערב, והשחזור צריך לדעת
    // אם התמונה שלפניו היא מהמסיבה הזאת או משבוע שעבר
    const save = () => { try { localStorage.setItem(LS_ROOM, JSON.stringify({ ...S, t: Date.now() })); } catch (e) {} };
    const RESUME_TTL = 3 * 60 * 60 * 1000;
    function savedRoom() {
      try {
        const d = JSON.parse(localStorage.getItem(LS_ROOM) || 'null');
        // משחק שנגמר אינו ממתין לשחזור. רוב הערבים נסגרים בלי "סיום", והתמונה
        // הזאת חטפה כל פתיחה במשך שלוש שעות והציעה להמשיך משחק שכבר הוכרע.
        if (d && d.round > 0 && d.phase !== 'done' && d.t && Date.now() - d.t < RESUME_TTL) return d;
      } catch (e) {}
      return null;
    }

    // הפונקציה היחידה שבונה מצב יוצא. זהו המקום היחיד בקוד שבו שנה, שם שיר
    // או אמן יכולים להיכנס לחוט, ולכן דליפת תשובה היא נקודת כשל אחת ולא פזורה.
    function snapshot(pid) {
      const me = seats().find(s => s.pid === pid);
      const reveal = S.phase === 'reveal' || S.phase === 'done';
      const snap = {
        v: 1, t: 'SNAP', seq: ++seq, phase: S.phase, round: S.round, target: S.target,
        roster: seats().map(s => ({ pid: s.pid, name: s.name, colour: s.colour,
                                    n: s.tl.length, bulls: s.bulls,
                                    placed: s.place !== null && s.place !== undefined, online: s.online })),
        winner: S.winner,
      };
      // מי שלא שיבץ בסיבוב הזה אינו מקבל פסק דין. מושב חדש נולד עם hit=false,
      // ומצטרף באמצע חשיפה היה מקבל ✗ ענק על סיבוב שלא השתתף בו.
      if (me) snap.me = { pid: me.pid, tl: me.tl, place: me.place, n: me.tl.length, bulls: me.bulls,
                          hit: reveal && me.place !== null && me.place !== undefined ? me.hit : undefined };
      // בזמן האזנה שדות השיר פשוט אינם קיימים על האובייקט, במקום להיות ריקים
      if (reveal && S.song) snap.song = { year: S.song.year, t: S.song.t, a: S.song.a };
      return snap;
    }
    const push = () => {
      for (const s of seats()) if (s.key) Net.hostSend(s.key, snapshot(s.pid));
      render();
      save();
    };

    // ---------- מסכים ----------
    function render() {
      if (!S) return;
      if (S.phase === 'lobby') renderLobby();
      else if (S.phase === 'listen') renderStage();
      else if (S.phase === 'reveal') renderReveal();
      else if (S.phase === 'done') renderWin();
    }

    function renderLobby() {
      $('lg-code').textContent = S.code;
      const box = $('lg-seats');
      box.innerHTML = '';
      for (const s of seats()) {
        const chip = el('span', 'lg-seat');
        const dot = el('i', 'lg-dot'); dot.style.background = s.online ? '#06d6a0' : '#8b7fa3';
        chip.appendChild(dot);
        chip.appendChild(document.createTextNode(s.name));
        chip.style.borderColor = s.colour;
        box.appendChild(chip);
      }
      const n = seats().length;
      const btn = $('lg-start');
      const enough = S.solo ? n >= 1 : n >= 2;
      btn.disabled = !enough;
      btn.textContent = enough ? 'מתחילים' : (S.solo ? 'הוסיפו שחקן' : 'צריך עוד שחקן אחד');
    }

    function renderStage() {
      // הקוד והריבוע חיים רק במסך הלובי, שלא חוזר יותר. טלפון שנפל צריך מאיפה
      // להקריא את הקוד בחזרה, ובלי זה אין שום דרך להחזיר אותו למשחק.
      $('lg-round').textContent = 'סיבוב ' + S.round + '  ·  קוד ' + S.code;
      const box = $('lg-tiles');
      box.innerHTML = '';
      for (const s of seats()) {
        const placed = s.place !== null && s.place !== undefined;
        const t = el('div', 'lg-tile' + (placed ? ' done' : ''));
        t.style.borderColor = s.colour;
        if (!s.online) t.classList.add('off');
        t.appendChild(el('div', 'lg-tile-n', s.name));
        t.appendChild(el('div', 'lg-tile-c', String(s.tl.length)));
        t.appendChild(el('div', 'lg-tile-s',
          placed ? '✓ בפנים' : ((S.solo || !s.key) ? 'הקישו לשיבוץ' : '...')));
        // מכשיר יחיד: הכניסה היחידה לשיבוץ הייתה קבורה במסך הטבלה, ומשפחה
        // שלחצה "חשוף עכשיו" קיבלה ✗ לכולם וציר זמן שלעולם לא גדל.
        // מושב בלי טלפון בחדר מרושת הוא אותו מקרה בדיוק, והוא נספר בין המחוברים.
        if ((S.solo || !s.key) && !placed) {
          t.onclick = () => placeFor(s.pid); t.style.cursor = 'pointer';
          t.setAttribute('role', 'button'); t.tabIndex = 0; t.classList.add('tap');
        }
        box.appendChild(t);
      }
      const tag = $('lg-stage-tag');
      if (tag) tag.textContent = noRoom
        ? 'החדר לא נפתח מחדש. אפשר להמשיך מכאן: מקישים על שם של שחקן ומשבצים עבורו.'
        : S.solo
          ? 'מעבירים את הטלפון. כל אחד ואחת בתורם מקישים על השם שלהם ומשבצים.'
          : 'האזינו. כל אחד משבץ בטלפון שלו, בסתר.';
      const placedOf = s => s.place !== null && s.place !== undefined;
      const missing = seats().filter(s => !placedOf(s));
      const ready = online().filter(placedOf).length;
      const tot = online().length;
      const c = $('lg-count');
      // בלי אף מחובר "0 מתוך 0 בחרו" נקרא כתקלת ספירה במקום כמצב חיבור.
      // מגיעים לכאן מיד אחרי שחזור, שבו כל המושבים מסומנים מנותקים.
      // מושב שנפל מהחיבור ולא שיבץ יצא משני הצדדים של השבר והבמה הכריזה "כולם בחרו".
      c.textContent = !tot ? 'אף טלפון לא מחובר כרגע'
        : missing.length ? (ready >= tot ? 'מחכים ל' + missing[0].name : `${ready} מתוך ${tot} בחרו`)
        : 'כולם בחרו';
      c.classList.toggle('full', tot > 0 && !missing.length);
      // שורת המצב שורדת ציור מחדש: render נקרא על כל הודעת רשת, ובלי זה
      // ההסבר על מה שקורה בנגינה נמחק ברגע שטלפון כלשהו משבץ
      const nt = $('lg-note'); if (nt) nt.textContent = S.note || '';
      // בלי S.song הכפתור מוביל לחשיפה שתקרוס על שנה חסרה ותציג את הסיבוב הקודם
      $('lg-reveal-btn').disabled = busy || !S.heard || !S.song;
      btnLabel($('lg-reveal-btn'), (S.heard || S.song) ? 'חשוף עכשיו' : 'רגע, השיר נטען');
    }

    // חשיפה על מסך המארח בלבד. הטלפונים ריקים בכוונה, כדי ששישה ראשים
    // יעלו מהמסכים באותו רגע במקום שכל אחד יקרא תוצאה פרטית לבד.
    function renderReveal() {
      const rv = $('s-lg-reveal');
      rv.classList.remove('play'); void rv.offsetWidth; rv.classList.add('play');
      $('lg-rv-year').textContent = S.song.year;
      $('lg-rv-title').textContent = S.song.t;
      $('lg-rv-artist').textContent = S.song.a;
      const box = $('lg-rv-seats');
      box.innerHTML = '';
      for (const s of seats()) {
        const t = el('div', 'lg-rv-tile ' + (s.hit ? 'hit' : 'miss'));
        t.style.borderColor = s.colour;
        t.appendChild(el('div', 'lg-tile-n', s.name));
        const g = el('div', 'lg-rv-gap');
        g.appendChild(labelToNode(s.place === null || s.place === undefined
          ? 'בלי שיבוץ' : gapLabel(s.tlBefore, s.place)));
        t.appendChild(g);
        t.appendChild(el('div', 'lg-rv-mark', s.hit ? '✓' : '✗'));
        if (s.hit && s.bull) t.appendChild(el('div', 'lg-bull', 'בול'));
        else if (!s.hit && s.near) t.appendChild(el('div', 'lg-near', 'כמעט'));
        box.appendChild(t);
      }
      renderNostalgia();
      $('lg-rv-note').textContent = commentary();
    }

    // הרצועה הרגשית: מי היה בן כמה. בלי פועל ובלי שם עצם ממוגדר, ולכן
    // אותו טקסט מתאים לכל השולחן.
    function renderNostalgia() {
      const band = $('lg-nost');
      band.innerHTML = '';
      const withBorn = seats().filter(s => s.born);
      if (!withBorn.length) { band.style.display = 'none'; return; }
      band.style.display = '';
      const h = el('div', 'lg-nost-h');
      h.appendChild(document.createTextNode('בשנת '));
      h.appendChild(bdi(S.song.year));
      band.appendChild(h);
      const row = el('div', 'lg-nost-row');
      for (const s of withBorn) {
        const age = S.song.year - s.born;
        const chip = el('div', 'lg-nost-chip');
        chip.appendChild(el('div', 'lg-nost-name', s.name));
        if (age === 0) { chip.classList.add('gold'); chip.appendChild(el('div', 'lg-nost-v', 'שנת הלידה')); }
        else if (age < 0) {
          chip.appendChild(el('div', 'lg-nost-v', 'לפני הלידה'));
          const sub = el('div', 'lg-nost-sub'); sub.appendChild(bdi(-age)); chip.appendChild(sub);
        } else {
          const v = el('div', 'lg-nost-v'); v.appendChild(bdi(age)); chip.appendChild(v);
          if (age >= 13 && age <= 22) chip.classList.add('phones');
        }
        row.appendChild(chip);
      }
      band.appendChild(row);
      if (withBorn.some(s => { const a = S.song.year - s.born; return a >= 13 && a <= 22; }))
        band.appendChild(el('div', 'lg-nost-cap', 'אוזניות: הגיל שבו זה היה הפסקול'));
    }

    // פרשנות בסגנון שדרן: משפטים שמניים בלי פועל, ולכן בלי מגדר
    function commentary() {
      const on = online();
      const hits = on.filter(s => s.hit);
      if (!on.length) return '';
      if (hits.length === on.length && on.length > 1) return 'כולם צדקו. או שהשיר קל מדי, או שאתם טובים מדי.';
      if (!hits.length) return 'אף אחד. השנה הזאת שייכת לבית.';
      if (hits.length === 1) return 'רק ' + hits[0].name + '. כל השאר לא.';
      const bulls = hits.filter(s => s.bull);
      if (bulls.length >= 2) return 'בול אצל שניים.';
      const lead = [...seats()].sort((a, b) => b.tl.length - a.tl.length)[0];
      if (lead && S.target - lead.tl.length === 1) return 'עוד שיר אחד ל' + lead.name + ' לניצחון.';
      return hits.length + ' מתוך ' + on.length + '.';
    }

    function renderWin() {
      const w = seats().find(s => s.pid === S.winner);
      if (!w) return;
      $('lg-win-name').textContent = w.name;
      $('lg-win-name').style.color = w.colour;
      $('lg-win-line').textContent = w.tl.length + ' שירים בציר הזמן.';
      renderTimeline($('lg-win-tl'), w.tl, {});
    }

    function renderBoard() {
      const box = $('lg-board-list');
      box.innerHTML = '';
      for (const s of [...seats()].sort((a, b) => b.tl.length - a.tl.length)) {
        const row = el('div', 'lg-board-row');
        const nm = el('div', 'lg-board-name', s.name); nm.style.color = s.colour;
        row.appendChild(nm);
        const bar = el('div', 'lg-bar');
        const fill = el('i'); fill.style.width = Math.min(100, s.tl.length / S.target * 100) + '%';
        fill.style.background = s.colour; bar.appendChild(fill);
        row.appendChild(bar);
        const cnt = el('div', 'lg-board-n'); cnt.appendChild(bdi(s.tl.length + '/' + S.target));
        row.appendChild(cnt);
        const act = el('button', 'small');
        act.textContent = 'שיבוץ עבור ' + s.name;
        act.onclick = () => placeFor(s.pid);
        // הטבלה נפתחת גם מהחשיפה, ושם placeFor חוזר בשקט. כפתור שלא מגיב כלל
        // נראה בדיוק כמו אפליקציה תקועה, ולכן הוא מאפיר.
        act.disabled = !S || S.phase !== 'listen';
        row.appendChild(act);
        box.appendChild(row);
      }
    }

    // ---------- זרימת המשחק ----------
    async function open(solo) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      fresh(code, solo);
      // דור הפתיחה: שתי כניסות חופפות הורגות זו את העמית של זו, והראשונה
      // מתעוררת רק כעבור חמש עשרה שניות וזורקת את המארח ממשחק שכבר רץ.
      const gen = alive;
      show('s-lg-lobby');
      $('lg-code').textContent = '...';
      $('lg-qr-wrap').style.display = 'none';
      { const t = $('lg-lobby-tag'); if (t) t.textContent = 'כוונו את המצלמה של הטלפון לריבוע'; }
      $('lg-net').textContent = 'מקימים חדר...';
      $('lg-net').className = 'lg-pill wait';
      B().primePlayback();          // בתוך מחוות הלחיצה: משחרר צליל לכל הערב
      B().keepAwake();
      if (!await B().loadData()) return;
      if (gen !== alive) return;
      if (solo) { soloReady(); return; }
      try {
        await Net.hostOpen(code, {
          onMessage: (key, msg, conn) => onPlayer(key, msg, conn),
          onDrop: key => { const s = seats().find(x => x.key === key); if (s) { s.online = false; s.key = null; push(); } },
        });
        if (gen !== alive) return;
        drawQR(code);
        $('lg-net').textContent = 'החדר פתוח';
        $('lg-net').className = 'lg-pill ok';
      } catch (e) {
        if (gen !== alive) return;
        // כשל בהקמת החדר אינו סוף הערב: אותו משחק בדיוק רץ ממכשיר אחד
        $('lg-net').textContent = 'אין חיבור לשרת ההצטרפות';
        $('lg-net').className = 'lg-pill bad';
        show('s-lg-solo');
      }
      if (gen !== alive) return;
      renderLobby();
    }

    function drawQR(code) {
      const url = location.origin + location.pathname + '#j=' + code;
      try {
        window.QR.draw($('lg-qr'), url, 240, 4);
        $('lg-qr-wrap').style.display = '';
        $('lg-url').textContent = url.replace(/^https?:\/\//, '');
      } catch (e) { $('lg-qr-wrap').style.display = 'none'; }
      $('lg-code').textContent = code;
    }

    // שחזור מסיבה שנקטעה: הטלפון של המארח הוא הרמקול, הלוח ומרכזיית החיבורים,
    // ו-iOS סוגר לו את הלשונית אחרי שיחה או מעבר לספוטיפיי. בלי זה כל צירי הזמן
    // והניקוד נמחקים בזמן שתמונת מצב שלמה יושבת באחסון בלי שאיש קורא אותה.
    // הטלפונים חוזרים מעצמם: HELLO עם המזהה והסוד מחזיר לכל אחד את המושב שלו.
    async function resume() {
      if (resuming) return false;
      const d = savedRoom();
      if (!d) return false;
      resuming = true;
      // חייב לרוץ בתוך מחוות הלחיצה עצמה, לפני כל המתנה, אחרת הדפדפן באייפון
      // כבר אינו סופר את זה כמחווה והצליל נשאר חסום לשארית הערב
      B().primePlayback();
      B().keepAwake();
      try {
        delete d.t;
        S = d;
        noRoom = false;
        for (const s of seats()) { s.online = false; s.key = null; }
        alive++;
        if (!await B().loadData()) return false;
        if (!S.solo) {
          try {
            await Net.hostOpen(S.code, {
              onMessage: (key, msg, conn) => onPlayer(key, msg, conn),
              onDrop: key => { const s = seats().find(x => x.key === key); if (s) { s.online = false; s.key = null; push(); } },
            });
            drawQR(S.code);
          } catch (e) {
            // בלי חדר הטלפונים לא יחזרו, אבל הלוח, הניקוד והמוזיקה כן
            noRoom = true;
          }
        }
        // סיבוב האזנה משוחזר נושא heard ושיר של שיר שאיש לא שמע: המנוע ריק,
        // כפתור הנגינה מת וכפתור החשיפה היה שופט את השולחן על שקט. מנגנים מחדש.
        if (S.phase === 'listen') {
          S.song = null;
          S.heard = false;
          show('s-lg-stage');
          B().keepAwake();   // רק עכשיו מסך מסיבה פעיל, ולפני כן הנעילה נדחתה
          await nextRound();
          return true;
        }
        show(S.phase === 'done' ? 's-lg-win' : 's-lg-reveal');
        render();
        B().keepAwake();
        return true;
      } finally { resuming = false; }
    }

    async function soloReady() {
      // אפשר להגיע לכאן גם בלי שחדר הוקם, למשל כשבוחרים מכשיר יחיד מראש
      if (!S) {
        fresh(String(Math.floor(1000 + Math.random() * 9000)), true);
        B().primePlayback(); B().keepAwake();
        if (!await B().loadData()) return;
      }
      S.solo = true;
      drawQR(S.code);
      $('lg-net').textContent = 'מצב מכשיר אחד';
      $('lg-net').className = 'lg-pill ok';
      $('lg-qr-wrap').style.display = 'none';
      // drawQR כתב קוד וקישור הצטרפות שאינם מובילים לשום מקום כשאין חדר.
      // מי שינסה לסרוק או להקליד יקבל "לא נמצא חדר" ויחשוב שהאפליקציה תקועה.
      $('lg-url').textContent = '';
      $('lg-code').textContent = '';
      { const t = $('lg-lobby-tag'); if (t) t.textContent = 'מעבירים את הטלפון מיד ליד. כולם משחקים מהמכשיר הזה.'; }
      show('s-lg-lobby');
      if (!seats().length) { addSeat('שחקן 1'); addSeat('שחקן 2'); }
      renderLobby();
    }

    function addSeat(name, born, key) {
      const pid = 'p' + Math.random().toString(36).slice(2, 9);
      const used = new Set(seats().map(s => s.name));
      let nm = name || 'שחקן';
      let i = 2; while (used.has(nm)) nm = name + ' ' + (i++);
      const seat = { pid, secret: Math.random().toString(36).slice(2), name: nm,
                     born: born || null, colour: COLORS[seats().length % COLORS.length],
                     tl: [], place: null, bulls: 0, online: true, key: key || null,
                     hit: false, bull: false, near: false, tlBefore: [] };
      S.seats.push(seat);
      return seat;
    }

    function onPlayer(key, msg, conn) {
      if (!msg || !S) return;
      if (msg.t === 'HELLO') {
        let seat = msg.pid && seats().find(s => s.pid === msg.pid && s.secret === msg.secret);
        if (seat) {
          // אותו שחקן ממכשיר אחר: המכשיר הישן מקבל הודעה מפורשת במקום להישאר
          // תלוי באוויר ולהיספר כשחקן שלא בחר
          if (seat.key && seat.key !== key) Net.hostSend(seat.key, { v: 1, t: 'BYE' });
          seat.online = true; seat.key = key;
          if (msg.name) seat.name = msg.name;
          if (msg.born) seat.born = msg.born;
        }
        else seat = addSeat(msg.name, msg.born, key);
        Net.hostSend(key, { v: 1, t: 'WELCOME', pid: seat.pid, secret: seat.secret,
                            colour: seat.colour, code: S.code,
                            rules: { target: S.target } });
        push();
        return;
      }
      const seat = seats().find(s => s.key === key);
      if (!seat) return;
      if (msg.t === 'PLACE' && S.phase === 'listen' && msg.round === S.round) {
        seat.place = msg.idx; push();
      } else if (msg.t === 'UNPLACE' && S.phase === 'listen') { seat.place = null; push(); }
      else if (msg.t === 'RENAME' && msg.name) { seat.name = String(msg.name).slice(0, 16); push(); }
      else if (msg.t === 'PING') Net.hostSend(key, { v: 1, t: 'PONG' });
    }

    async function start() {
      // "מתחילים" ו"משחק חדש" שניהם מגיעים לכאן, ובלי שומר עומס הקשה כפולה
      // בזמן טעינת השיר מאפסת את מונה הסיבובים אחרי שהלולאה כבר קידמה אותו
      if (busy) return;
      if (!seats().length) return;
      // הכפתור הזה מוחק את ציר הזמן של כולם, וקודם הוא הבטיח "עוד סיבוב"
      if (S && S.round > 0 && !confirm('להתחיל משחק חדש? ציר הזמן של כולם יימחק.')) return;
      for (const s of seats()) { s.tl = []; s.bulls = 0; }
      S.round = 0; S.winner = null;
      // nextRound מסרב לרוץ כשהמשחק גמור, ומסך המנצח הוא בדיוק המקום שממנו
      // מתחילים משחק חדש
      S.phase = 'listen';
      nextRound();
    }

    async function nextRound() {
      if (!S) return;
      // חלון הרפאים: מסך המנצח עוד לא עלה, וכפתור "השיר הבא" עדיין על המסך.
      // סיבוב נוסף כאן מנגן מוזיקה מתחת למסך מנצח שנוחת עליו כעבור רגע.
      if (S.phase === 'done') return;
      if (busy) return;
      clearTimeout(winTimer); winTimer = null;
      const gen = alive;
      busy = true;
      lockButtons(true);
      try {
      S.round++;
      S.phase = 'listen';
      S.heard = false;
      S.song = null;
      for (const s of seats()) { s.place = null; s.hit = false; s.bull = false; s.near = false; }
      show('s-lg-stage');
      // סדר חשוב: renderStage כותב מחדש את שורת הספירה, ולכן הודעת הטעינה
      // נכתבת אחריו. אחרת השולחן רואה "0 מתוך 4 בחרו" ושקט, בכל סיבוב.
      render();
      wakeLink(false);
      $('lg-count').textContent = 'טוען שיר...';
      S.note = ''; { const n0 = $('lg-note'); if (n0) n0.textContent = ''; }
      const lead = [...seats()].sort((a, b) => b.tl.length - a.tl.length)[0];
      const usedYears = lead ? lead.tl.map(x => x.y) : [];
      let song = null;
      // תקרת זמן לכל הלולאה: שלושה נסיונות של פסקי זמן מצטברים מחזיקים את
      // הבמה נעולה מעל דקה, וגם "שיר אחר" חסום כל אותו זמן.
      const t0 = Date.now();
      for (let i = 0; i < 3 && !song && Date.now() - t0 < 45000; i++) {
        const c = draw(usedYears);
        if (!c) break;
        const ok = await B().playSong(c, (st, msg) => {
          if (!S) return;
          if (st === 'playing') {
            S.heard = true; S.note = ''; wakeLink(false); render();
            const n = $('lg-note'); if (n) n.textContent = '';
            return;
          }
          // הבמה היא המסך היחיד שרואים כאן. בלי זה ההודעה שהייתה פותרת את
          // הערב, ובראשה "ספוטיפיי ישן", נכתבת למסך שאינו מוצג.
          if (S.phase !== 'listen') return;
          // הכפתור היחיד שפותר את הערב אינו נמחק על ידי כל הודעת מצב שבאה
          // אחריו. הוא נעלם כשהסיבוב באמת ממשיך.
          if (st === 'wake') wakeLink(true);
          else if (st === 'loading') wakeLink(false);
          if (msg === undefined) return;
          // ערוץ חדש אל המסך שלפני החשיפה, ולכן עובר באותה רשת ביטחון
          // כמו כל טקסט אחר שם (שם מכשיר בספוטיפיי יכול להכיל מספר שנה)
          const txt = B().stripYears(msg);
          S.note = txt;
          // שורת הספירה נלקחת רק כל עוד אין שיר. משהוכרז הסיבוב היא שייכת למונה
          // המשבצים, וההודעות ממשיכות לשורת המצב הנפרדת.
          // אותה הודעה בשתי שורות סמוכות נקראת כתקלת ציור, ולכן כותבים לאחת בלבד
          const n = $('lg-note');
          if (!S.song) { $('lg-count').textContent = txt; if (n) n.textContent = ''; }
          else if (n) n.textContent = txt;
        });
        if (gen !== alive) return;
        if (ok) song = c;
        else { await new Promise(r => setTimeout(r, 200)); if (gen !== alive) return; }
      }
      if (gen !== alive) return;
      // כשל טעינה מנקה את השיר הקודם. בלי זה לחיצה על "נגן" הייתה מחזירה את השיר
      // של הסיבוב הקודם, פותחת את כפתור החשיפה, וכל השולחן היה נשפט על שנה ישנה.
      if (!song) {
        S.song = null;
        S.heard = false;
        // ניתוק המנוע: בלי זה מאזין השגיאה של האודיו עדיין יכול להגיע לאירוע
        // נגינה אמיתי, להדליק את כפתור החשיפה ולחשוף את השנה של הסיבוב הקודם
        B().stopSong();
        B().keepAwake();   // stopSong משחרר את נעילת המסך, והבמה עדיין פתוחה
        render();
        btnLabel($('lg-reveal-btn'), 'חשוף עכשיו');
        $('lg-count').textContent = 'לא הצלחתי לטעון שיר. אפשר לנסות שיר אחר.';
        return;
      }
      if (gen !== alive) return;
      S.song = song;
      B().used.add(song.a + '::' + song.t); B().persist();
      // מכריזים רק אחרי שהמוזיקה באמת התחילה, אחרת שיר שיתחלף ישנה
      // את השנה מתחת לאנשים שכבר שיבצו
      if (gen !== alive) return;
      Net.hostBroadcast({ v: 1, t: 'ROUND', round: S.round });
      push();
      } finally {
        if (gen === alive) {
        busy = false;
        const n = $('lg-next-btn'); if (n && !(S && S.phase === 'done')) n.disabled = false;
        if (S) $('lg-reveal-btn').disabled = !S.heard || !S.song;
        }
      }
    }

    function reveal() {
      if (!S || S.phase !== 'listen') return;
      // בלי שיר אין שנה. חשיפה כאן הייתה זורקת חריגה באמצע הציור ומשאירה
      // על המסך את השנה והתוצאות של הסיבוב הקודם כאילו הן של הסיבוב הזה.
      if (!S.song) return;
      S.phase = 'reveal';
      for (const s of seats()) {
        s.tlBefore = [...s.tl];
        if (s.place === null || s.place === undefined) { s.hit = false; s.near = false; continue; }
        s.hit = correct(s.tl, s.place, S.song.year);
        const lo = s.place > 0 ? s.tl[s.place - 1].y : null;
        const hi = s.place < s.tl.length ? s.tl[s.place].y : null;
        s.bull = s.hit && ((lo !== null && Math.abs(S.song.year - lo) <= 1) ||
                           (hi !== null && Math.abs(S.song.year - hi) <= 1));
        s.near = !s.hit && ((lo !== null && Math.abs(S.song.year - lo) <= 1) ||
                            (hi !== null && Math.abs(S.song.year - hi) <= 1));
        if (s.hit) { s.tl = insertAt(s.tl, S.song); if (s.bull) s.bulls++; }
      }
      // בלי תורות כל מי שצדק מרוויח שיר באותו סיבוב, ולכן שניים שחוצים יחד את היעד
      // הם הסיום הרגיל ולא מקרה קצה. שובר שוויון: יותר שירים, ואז יותר בולים.
      const won = seats().filter(s => s.tl.length >= S.target);
      if (won.length) {
        const w = [...won].sort((a, b) => b.tl.length - a.tl.length || b.bulls - a.bulls)[0];
        S.winner = w.pid;
        S.phase = 'done';
        // ארבע שניות שבהן כולם דוקרים את הכפתור הגדול, בדיוק ברגע הניצחון
        const nb = $('lg-next-btn'); if (nb) nb.disabled = true;
      }
      show('s-lg-reveal');
      // ציור מפורש: בסיבוב המנצח השלב כבר 'done', ו-render היה שולח את המסך
      // הזה ל-renderWin ומשאיר על המסך את השנה והתוצאות של הסיבוב הקודם
      renderReveal();
      push();
      if (S.phase === 'done') winTimer = setTimeout(() => { show('s-lg-win'); renderWin(); }, 4200);
    }

    // שיבוץ ידני בשביל טלפון שמת: אף כשל מכשיר לא עוצר את השולחן
    function placeFor(pid) {
      const s = seats().find(x => x.pid === pid);
      if (!s || S.phase !== 'listen') return;
      Player.openLocalPlacement(s, idx => { s.place = idx; push(); });
    }

    return { open, start, nextRound, reveal, renderBoard, soloReady, addSeat, kill, resume, savedRoom,
             state: () => S, busy: () => busy, push, show: render, placeFor };
  })();

  // ============================================================
  // שחקן: תצוגה דקה שמרנדרת מה שהתמונה אומרת ושולחת כוונות בלבד
  // ============================================================
  const Player = (() => {
    let me = null;         // {pid, secret, colour}
    let snap = null;
    let code = null;
    let sel = null;
    let locked = false;
    // הסיבוב שהמסך הזה מצייר. הודעת ROUND מגיעה רק לחיבורים שהיו פתוחים באותו רגע,
    // וטלפון שנרדם וחזר היה מציג "נעלת" על שיבוץ שהמארח כבר דחה.
    let lastRound = null;
    let localMode = null;  // שיבוץ מקומי במצב מכשיר יחיד
    // הצטרפות אחת בכל רגע. joinRoom הורס את העמית הקודם, ושתי הקשות בתוך חלון
    // החיבור מייצרות שני HELLO בלי מזהה, ומכאן מושב רפאים שנספר לנצח.
    let joining = false;
    // הסיבוב שכבר עבר את מעבר החשיפה במסך הזה. המארח משדר שוב באמצע החשיפה
    // על כל אירוע רשת, וכל שידור כזה זרק את כולם חזרה למסך ההמתנה.
    let shown = null;
    // ניתוק מדווח פעמיים, מ-close ומ-error, וגם ההתחברות מחדש עצמה סוגרת את החיבור
    // הישן ומדווחת שוב. בלי נעילה ומונה זה מאכיל את עצמו ומנסה בלי סוף.
    let dropTimer = null, reconnecting = false, tries = 0;

    const store = () => {
      try { return JSON.parse(localStorage.getItem(LS_ME) || '{}'); } catch (e) { return {}; }
    };
    const remember = () => {
      const all = store(); all[code] = { pid: me.pid, secret: me.secret, name: $('lg-name').value };
      localStorage.setItem(LS_ME, JSON.stringify(all));
    };

    function joinScreen(c) {
      code = c;
      show('s-lg-join');
      $('lg-join-title').textContent = 'מצטרפים לחדר ' + c;
      const prev = store()[c];
      if (prev && prev.name) $('lg-name').value = prev.name;
      renderYears();
    }

    // בורר שנת לידה: שורת כפתורים בכיוון לטיני בתוך דף עברי, כי גריד
    // מספרים ב-RTL מבלבל, ובלי בורר תאריכים מקומי שנראה שונה בכל מכשיר
    function renderYears() {
      const box = $('lg-years');
      if (box.childElementCount) return;
      const now = new Date().getFullYear();
      for (let y = now - 5; y >= 1930; y--) {
        const b = el('button', 'lg-year', String(y));
        b.onclick = () => {
          box.querySelectorAll('.lg-year').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          box.dataset.born = y;
        };
        box.appendChild(b);
      }
      setTimeout(() => {
        const t = [...box.children].find(b => b.textContent === '1975');
        if (t) box.scrollLeft = t.offsetLeft - box.clientWidth / 2;
      }, 30);
    }

    async function go() {
      if (joining) return;
      joining = true;
      const jb = $('lg-join-btn'); if (jb) jb.disabled = true;
      try {
        const name = ($('lg-name').value || '').trim().slice(0, 16);
        const errBox = $('lg-join-err');
        if (!name) { errBox.className = 'err'; errBox.textContent = 'צריך שם'; return; }
        const born = $('lg-years').dataset.born ? Number($('lg-years').dataset.born) : null;
        // חיבור יכול לקחת חמש עשרה שניות, והודעת התקדמות בצבע שגיאה הזמינה
        // בדיוק את ההקשה השנייה שמייצרת את מושב הרפאים
        errBox.className = 'tag'; errBox.textContent = 'מתחברים...';
        const prev = store()[code];
        try {
          await Net.joinRoom(code, { onMessage: onHost, onDrop: dropped });
        } catch (e) {
          errBox.className = 'err';
          errBox.textContent = e && e.missing
            ? 'לא נמצא חדר עם הקוד הזה' : 'החיבור נכשל. בדקו שאתם על אותה רשת.';
          return;
        }
        Net.playerSend({ v: 1, t: 'HELLO', code, name, born,
                         pid: prev ? prev.pid : null, secret: prev ? prev.secret : null });
        errBox.textContent = '';
      } finally {
        joining = false;
        if (jb) jb.disabled = false;
      }
    }

    function dropped() {
      if (!code || reconnecting) return;
      $('lg-drop').style.display = 'flex';
      clearTimeout(dropTimer);
      dropTimer = setTimeout(() => { if (code) reconnect(); }, 2000);
    }
    async function reconnect() {
      if (reconnecting || !code) return;
      reconnecting = true;
      tries++;
      const prev = store()[code];
      try {
        await Net.joinRoom(code, { onMessage: onHost, onDrop: dropped });
        Net.playerSend({ v: 1, t: 'HELLO', code, name: prev ? prev.name : 'שחקן',
                         pid: prev ? prev.pid : null, secret: prev ? prev.secret : null });
        tries = 0;
        const rb = $('lg-drop-retry'); if (rb) rb.style.display = 'none';
        $('lg-drop').style.display = 'none';
      } catch (e) {
        // אחרי חמישה ניסיונות עוצרים, אבל החדר פתוח והמושב עם ציר הזמן שמור
        // אצל המארח. "החדר נסגר" היה שקר שנועל את הטלפון מאחורי כיסוי בלי מוצא.
        if (tries >= 5) {
          $('lg-drop-msg').textContent = 'איבדנו את החיבור. בדקו את הוויפיי.';
          let rb = $('lg-drop-retry');
          if (!rb) {
            rb = el('button', 'small');
            rb.id = 'lg-drop-retry';
            rb.textContent = 'לנסות שוב';
            rb.onclick = () => {
              tries = 0;
              $('lg-drop-msg').textContent = 'מתחבר מחדש...';
              rb.style.display = 'none';
              reconnect();
            };
            $('lg-drop').firstElementChild.appendChild(rb);
          }
          rb.style.display = '';
        }
        else { clearTimeout(dropTimer); dropTimer = setTimeout(reconnect, 2500); }
      } finally { reconnecting = false; }
    }
    // יציאה מסודרת: בלי זה כיסוי הניתוק נשאר על המסך ובולע כל הקשה
    function kill() {
      code = null; snap = null;
      sel = null; locked = false; lastRound = null; shown = null; me = null;
      clearTimeout(dropTimer);
      tries = 0;
      $('lg-drop').style.display = 'none';
    }

    function onHost(msg) {
      if (!msg) return;
      $('lg-drop').style.display = 'none';
      if (msg.t === 'WELCOME') {
        me = { pid: msg.pid, secret: msg.secret, colour: msg.colour };
        remember();
        // הטלפון של השחקן אינו מבקש נעילת מסך בשום מקום אחר, והוא ננעל
        // מעצמו באמצע ההאזנה ונופל מהחיבור
        B().keepAwake();
        return;
      }
      if (msg.t === 'BYE') {
        // המושב עבר למכשיר אחר. מפסיקים להתחבר מחדש, אחרת שני מכשירים
        // ייאבקו על אותו מושב ללא סוף.
        // ניקוי מלא: שאריות של סיבוב קודם גורמות למסך להבטיח שיבוץ שהמארח
        // החדש מעולם לא קיבל.
        try { Net.close(); } catch (e) {}
        kill();
        window.App.show('s-home');
        return;
      }
      if (msg.t === 'ROUND') { sel = null; locked = false; return; }
      if (msg.t !== 'SNAP') return;
      snap = msg;
      paint();
    }

    function paint() {
      if (!snap) return;
      // טלפון של שחקן ננעל מעצמו באמצע ההאזנה, iOS מקפיא את הדף והחיבור נופל.
      // כל תמונת מצב נכנסת מבקשת מחדש את הנעילה שהדפדפן שחרר בזמן הרקע.
      B().keepAwake();
      // התמונה היא האמת. סיבוב חדש מאפס את הבחירה המקומית גם כשהודעת ROUND
      // לא הגיעה, אחרת המסך מבטיח שיבוץ שאינו קיים אצל המארח.
      if (snap.round !== lastRound) { lastRound = snap.round; sel = null; locked = false; }
      if (snap.phase === 'lobby') { renderWait(); show('s-lg-wait'); return; }
      if (snap.phase === 'listen') { renderPlace(); show('s-lg-place'); return; }
      if (snap.phase === 'reveal' || snap.phase === 'done') {
        // מעבר אחד לכל סיבוב. תמונת מצב נוספת באמצע החשיפה, למשל כשטלפון אחד
        // הונח על הפנים, החזירה את כל השאר למסך ההמתנה והרטיטה אותם מחדש.
        if (shown !== snap.round) {
          shown = snap.round;
          show('s-lg-watch');
          const colour = (me && me.colour) || '#2b0a4e';
          $('s-lg-watch').style.background = colour;
          $('s-lg-watch').style.color = ink(colour);
          setTimeout(() => { if (snap && (snap.phase === 'reveal' || snap.phase === 'done')) renderResult(); }, 1500);
        } else if (snap.song) renderResult();
      }
    }

    function renderWait() {
      const c = $('lg-wait-circle');
      const colour = (me && me.colour) || '#ff3d81';
      c.style.background = colour;
      c.style.color = ink(colour);
      c.textContent = (snap.me && snap.roster.find(r => r.pid === snap.me.pid) || {}).name || '';
      const box = $('lg-wait-others');
      box.innerHTML = '';
      for (const r of snap.roster) {
        const chip = el('span', 'lg-seat', r.name);
        chip.style.borderColor = r.colour;
        box.appendChild(chip);
      }
    }

    function renderPlace() {
      // הביטול שייך רק לשיבוץ מקומי על מכשיר המארח. לשחקן מרוחק זה המסך שלו,
      // ובלי יציאה משלו אין לו שום כפתור אם המארח נעלם בלי שהחיבור נסגר.
      const cb = $('lg-place-cancel'); if (cb) cb.style.display = 'none';
      const qb = $('lg-place-quit'); if (qb) qb.style.display = '';
      const tl = (snap.me && snap.me.tl) || [];
      if (snap.me && snap.me.place !== null && snap.me.place !== undefined && sel === null) {
        sel = snap.me.place; locked = true;
      }
      $('lg-place-hint').textContent = locked ? 'נעלת. אפשר לשנות עד החשיפה'
        : sel === null ? 'הקישו על הרווח הנכון' : 'עכשיו הקישו על הכפתור הוורוד למטה';
      renderTimeline($('lg-place-tl'), tl, {
        chosen: sel, locked,
        onGap: i => { sel = i; renderPlace(); },
      });
      const btn = $('lg-confirm');
      btn.innerHTML = '';
      if (locked) {
        btn.classList.add('ghost');
        btn.appendChild(document.createTextNode('שיניתי את דעתי'));
        btn.disabled = false;
        btn.onclick = () => { locked = false; Net.playerSend({ v: 1, t: 'UNPLACE' }); renderPlace(); };
      } else if (sel === null) {
        btn.classList.remove('ghost');
        btn.appendChild(document.createTextNode('קודם בוחרים מקום'));
        btn.disabled = true;
        btn.onclick = null;
      } else {
        btn.classList.remove('ghost');
        btn.disabled = false;
        // עטיפה ב-span אחד: הכפתור הוא flex, ורווחים בין פריטי flex נבלעים
        const wrap = el('span');
        // בסיבוב הראשון ציר הזמן ריק, וגם הרווח היחיד וגם כפתור האישור נשאו
        // בדיוק את אותה כותרת ורודה. הפועל מבדיל ביניהם.
        wrap.appendChild(document.createTextNode(tl.length ? 'לשים ' : 'מאשרים: '));
        wrap.appendChild(labelToNode(gapLabel(tl, sel)));
        btn.appendChild(wrap);
        btn.onclick = () => {
          locked = true;
          Net.playerSend({ v: 1, t: 'PLACE', round: snap.round, idx: sel });
          if (navigator.vibrate) navigator.vibrate(15);
          renderPlace();
        };
      }
    }

    function renderResult() {
      if (!snap || !snap.song) return;
      // בלי שיבוץ אין פסק דין. מסך החשיפה נשאר פתוח עד שהמארח ממשיך, וזה בדיוק
      // הרגע שבו מצטרפים מאחרים סורקים את הריבוע.
      // מסך ההמתנה נצבע כאן ולא רק בלובי: מי שסרק את הריבוע באמצע חשיפה קיבל
      // עיגול צבע ריק ורשימת שחקנים ריקה, בלי שום סימן שההצטרפות הצליחה
      if (snap.me && snap.me.hit == null) { renderWait(); show('s-lg-wait'); return; }
      show('s-lg-result');
      const hit = snap.me && snap.me.hit;
      $('lg-res-mark').textContent = hit ? '✓' : '✗';
      $('lg-res-mark').className = 'lg-res-mark ' + (hit ? 'hit' : 'miss');
      $('lg-res-verdict').textContent = hit ? 'צדקת' : 'פספסת';
      $('lg-res-year').textContent = snap.song.year;
      $('lg-res-title').textContent = snap.song.t;
      $('lg-res-artist').textContent = snap.song.a;
      const left = snap.target - (snap.me ? snap.me.n : 0);
      // שיר אחד מניצחון הוא הרגע הגדול של המשחק, ו"עוד 1 שירים" הורס אותו
      const lf = $('lg-res-left');
      lf.textContent = '';
      if (left === 1) lf.appendChild(document.createTextNode('עוד שיר אחד לניצחון'));
      else if (left > 1) {
        lf.appendChild(document.createTextNode('עוד '));
        lf.appendChild(bdi(left));
        lf.appendChild(document.createTextNode(' שירים לניצחון'));
      }
      // המשחק נגמר: בלי זה כל מי שהפסיד קיבל "עוד 3 שירים לניצחון" בדיוק
      // בשנייה שבה המסך הגדול מכתיר מישהו אחר
      if (snap.phase === 'done') {
        const w = snap.roster.find(r => r.pid === snap.winner);
        const mine = !!(snap.me && w && w.pid === snap.me.pid);
        lf.textContent = '';
        lf.appendChild(document.createTextNode(
          mine ? 'הכתר שלך 👑' : w ? 'המשחק נגמר. הכתר של ' + w.name + '.' : 'המשחק נגמר.'));
      }
      renderTimeline($('lg-res-tl'), (snap.me && snap.me.tl) || [], {});
      if (navigator.vibrate) navigator.vibrate(hit ? 80 : [40, 60, 40]);
    }

    // שיבוץ על מכשיר המארח, למצב מכשיר יחיד ולטלפון שמת
    function openLocalPlacement(seat, done) {
      localMode = { seat, done };
      sel = null; locked = false;
      show('s-lg-place');
      $('lg-place-who').textContent = seat.name;
      $('lg-place-who').style.display = '';
      // שתי כניסות מגיעות לכאן בהקשה אחת, גם בטעות. בלי יציאה נשארים לכודים
      // במסך של שחקן אחר, וההימלטות היחידה היא לשבץ בשמו.
      const cb = $('lg-place-cancel'); if (cb) cb.style.display = '';
      // יציאה מסיימת את כל המשחק, ואין לה מקום במסך שהמארח פותח לכל שחקן בתורו
      const qb = $('lg-place-quit'); if (qb) qb.style.display = 'none';
      const paintLocal = () => {
        $('lg-place-hint').textContent = sel === null ? 'הקישו על הרווח הנכון'
          : 'עכשיו הקישו על הכפתור הוורוד למטה';
        renderTimeline($('lg-place-tl'), seat.tl, { chosen: sel, onGap: i => { sel = i; paintLocal(); } });
        const btn = $('lg-confirm');
        btn.innerHTML = ''; btn.classList.remove('ghost');
        btn.disabled = sel === null;
        if (sel === null) btn.appendChild(document.createTextNode('קודם בוחרים מקום'));
        else {
          const wrap = el('span');
          wrap.appendChild(document.createTextNode(seat.tl.length ? 'לשים ' : 'מאשרים: '));
          wrap.appendChild(labelToNode(gapLabel(seat.tl, sel)));
          btn.appendChild(wrap);
        }
        btn.onclick = () => { const d = localMode.done; localMode = null;
                              $('lg-place-who').style.display = 'none';
                              if (cb) cb.style.display = 'none';
                              show('s-lg-stage'); d(sel); };
      };
      paintLocal();
    }

    // יציאה בלי לשבץ בשם מישהו אחר
    function cancelLocal() {
      localMode = null;
      sel = null;
      locked = false;
      $('lg-place-who').style.display = 'none';
      const cb = $('lg-place-cancel'); if (cb) cb.style.display = 'none';
      const qb = $('lg-place-quit'); if (qb) qb.style.display = 'none';
      show('s-lg-stage');
      Host.show();
    }

    return { joinScreen, go, openLocalPlacement, cancelLocal, kill, snap: () => snap };
  })();

  // ============================================================
  // נקודות כניסה
  // ============================================================
  function setup() {
    show('s-lg-setup');
    renderResumeOffer();
    const box = $('lg-target');
    box.innerHTML = '';
    for (const n of [6, 8, 10, 12]) {
      const b = el('button', n === target() ? 'on' : '', String(n));
      b.onclick = () => { setCfg({ target: n }); setup(); };
      box.appendChild(b);
    }
    const modes = $('lg-modes');
    modes.innerHTML = '';
    for (const m of B().MODES) {
      const b = el('button', m.k === B().gameMode() ? 'on' : '', m.name);
      b.onclick = () => { window.App.setGameMode(m.k); setup(); };
      modes.appendChild(b);
    }
  }

  // מסיבה שנקטעה: הצעה אחת בראש מסך ההקמה, ורק כל עוד היא טרייה
  function renderResumeOffer() {
    let b = $('lg-resume');
    const d = Host.savedRoom();
    if (!d) { if (b) b.style.display = 'none'; return; }
    if (!b) {
      b = el('button', 'big alt2', 'המשך את המסיבה');
      b.id = 'lg-resume';
      // השחזור לוקח עד עשרים שניות עד שמסך כלשהו מתחלף, וזה בדיוק הרגע שבו
      // מקישים שוב. הקשה שנייה פותחת עמית נוסף על חדר חי.
      b.onclick = async () => {
        if (b.disabled) return;
        b.disabled = true;
        const old = b.textContent;
        b.textContent = 'מחזירים את המסיבה...';
        try { await Host.resume(); }
        finally { b.disabled = false; b.textContent = old; }
      };
      const body = $('s-lg-setup').querySelector('.body');
      body.insertBefore(b, body.firstChild);
    }
    b.style.display = '';
  }

  // הצעה בפתיחת האפליקציה, לפני שחזור קלף. הוחזר true אם יש מה להמשיך.
  function resumeOffer() {
    if (!Host.savedRoom()) return false;
    setup();
    return true;
  }

  // קוד חדר בכתובת: נבדק בטעינה לפני שחזור סיבוב קלפים ישן
  function checkHash() {
    const m = (location.hash || '').match(/[#&]j=(\d{4})/);
    if (!m) return false;
    history.replaceState(null, '', location.pathname);
    if (!B().loadData) return false;
    B().loadData().then(() => Player.joinScreen(m[1]));
    return true;
  }

  function joinByCode(c) { Player.joinScreen(String(c)); }

  window.Party.ui = {
    setup, checkHash, joinByCode, resumeOffer,
    cancelPlace: () => Player.cancelLocal(),
    open: () => Host.open(false),
    solo: () => Host.soloReady(),
    start: () => Host.start(),
    next: () => Host.nextRound(),
    reveal: () => Host.reveal(),
    board: () => { Host.renderBoard(); show('s-lg-board'); },
    // חזרה למסך שממנו באמת אפשר להמשיך. אחרי ניצחון זה מסך המנצח, ולא הבמה
    // שכפתור החשיפה שלה חסום ואין ממנה דרך לסיבוב נוסף.
    backToGame: () => {
      const S = Host.state();
      if (!S) return window.App.show('s-home');
      show(S.phase === 'done' ? 's-lg-win' : S.phase === 'reveal' ? 's-lg-reveal' : 's-lg-stage');
      Host.show();
    },
    // הבמה הציעה לנסות שוב בלי לתת שום דרך לעשות זאת
    retryRound: () => {
      const S = Host.state();
      if (!S || S.phase !== 'listen') return;
      // בלי בדיקת העומס הספירה הייתה יורדת בזמן שהסיבוב הנוכחי עוד נטען,
      // והקריאה עצמה נבלעת בנעילה. שתיקה כאן היא בדיוק מה שנראה כמו תקיעה.
      if (Host.busy()) { $('lg-count').textContent = 'עוד רגע, מחפש שיר'; return; }
      // מספר הסיבוב מתקדם גם כאן. מספר חוזר מבטל את ההשוואה היחידה שיש ל-paint,
      // וטלפון שגמגם על פני הניסיון החוזר נשאר נעול על שיבוץ שהמארח כבר שכח.
      Host.nextRound();
    },
    joinPrompt: () => {
      const v = ($('lg-code-in').value || '').trim();
      if (/^\d{4}$/.test(v)) joinByCode(v);
      else { $('lg-code-in').style.display = ''; $('lg-code-in').focus(); }
    },
    join: () => Player.go(),
    newCode: () => Host.open(false),
    addSoloSeat: () => { const n = prompt('שם השחקן'); if (n) { Host.addSeat(n); Host.show(); } },
    share: () => {
      const S = Host.state();
      if (!S) return;
      const url = location.origin + location.pathname + '#j=' + S.code;
      // בלי חלון שיתוף מקומי הכפתור לא עשה כלום. העתקה ללוח היא נחיתה רכה.
      if (navigator.share) navigator.share({ title: 'היטסטר רמיקס', url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url)
        .then(() => { $('lg-net').textContent = 'הקישור הועתק'; }).catch(() => {});
    },
    // יציאה שבאמת עוצרת: הודעת פרידה לטלפונים, סגירת החיבור, ביטול לולאת
    // טעינת השיר שאולי רצה ברקע, וניקוי כיסוי הניתוק בטלפון
    quit: () => {
      // "סיום" יושב באותה שורת כפתורים עם "טבלה", ואין ממנו דרך חזרה: כל צירי
      // הזמן, הניקוד והסיבוב נמחקים לתמיד
      // Host.state() ריק בכל טלפון שאינו המארח, ולכן שם לא נשאלה שום שאלה
      // וההקשה היחידה שעל המסך הוציאה שחקן מהמשחק באמצע סיבוב
      const S = Host.state();
      const ps = Player.snap();
      if (S && S.round > 0) { if (!confirm('לסיים את המשחק? ציר הזמן של כולם יימחק.')) return; }
      else if (ps && ps.round > 0) { if (!confirm('לצאת מהמשחק? כדי לחזור צריך להקליד את קוד החדר.')) return; }
      try { if (Host.state()) Net.hostBroadcast({ v: 1, t: 'BYE' }); } catch (e) {}
      try { Net.close(); } catch (e) {}
      Host.kill();
      Player.kill();
      B().stopSong();
      B().releaseWake();
      window.App.show('s-home');
    },
  };
})();
