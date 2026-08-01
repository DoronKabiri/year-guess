// ---------- מסיבה בלי קלפים: מארח, שחקן ומצב מכשיר יחיד ----------
// ראו party_core.js לתשתית ולחוקים. כאן יושבות מכונת המצבים של המארח,
// הלקוח שרץ בטלפון, וכל המסכים.
(() => {
  const P = window.Party;
  const { Net, renderTimeline, correct, insertAt, draw, gapLabel, labelToNode, COLORS,
          LS_ME, LS_ROOM, LS_CFG, $, el, bdi, B } = P;

  const show = id => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const s = $(id);
    if (s) s.classList.add('active');
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
    const seats = () => S ? S.seats : [];
    const online = () => seats().filter(s => s.online);

    function fresh(code, solo) {
      S = { code, seats: [], round: 0, phase: 'lobby', song: null,
            target: target(), solo: !!solo, winner: null, log: [] };
      seq = 0;
    }
    const save = () => { try { localStorage.setItem(LS_ROOM, JSON.stringify(S)); } catch (e) {} };

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
      if (me) snap.me = { pid: me.pid, tl: me.tl, place: me.place, n: me.tl.length, bulls: me.bulls,
                          hit: reveal ? me.hit : undefined };
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
      $('lg-round').textContent = 'סיבוב ' + S.round;
      const box = $('lg-tiles');
      box.innerHTML = '';
      for (const s of seats()) {
        const t = el('div', 'lg-tile' + (s.place !== null && s.place !== undefined ? ' done' : ''));
        t.style.borderColor = s.colour;
        if (!s.online) t.classList.add('off');
        t.appendChild(el('div', 'lg-tile-n', s.name));
        t.appendChild(el('div', 'lg-tile-c', String(s.tl.length)));
        t.appendChild(el('div', 'lg-tile-s', (s.place !== null && s.place !== undefined) ? 'בחר' : '...'));
        box.appendChild(t);
      }
      const ready = online().filter(s => s.place !== null && s.place !== undefined).length;
      const tot = online().length;
      const c = $('lg-count');
      c.textContent = ready >= tot && tot ? 'כולם בחרו' : `${ready} מתוך ${tot} בחרו`;
      c.classList.toggle('full', ready >= tot && tot > 0);
      $('lg-reveal-btn').disabled = !S.heard;
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
          ? 'לא בחר' : gapLabel(s.tlBefore, s.place)));
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
        act.textContent = 'מקמו בשבילו';
        act.onclick = () => placeFor(s.pid);
        row.appendChild(act);
        box.appendChild(row);
      }
    }

    // ---------- זרימת המשחק ----------
    async function open(solo) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      fresh(code, solo);
      show('s-lg-lobby');
      $('lg-code').textContent = '...';
      $('lg-qr-wrap').style.display = 'none';
      $('lg-net').textContent = 'מקימים חדר...';
      $('lg-net').className = 'lg-pill wait';
      B().primePlayback();          // בתוך מחוות הלחיצה: משחרר צליל לכל הערב
      B().keepAwake();
      if (!await B().loadData()) return;
      if (solo) { soloReady(); return; }
      try {
        await Net.hostOpen(code, {
          onMessage: (key, msg, conn) => onPlayer(key, msg, conn),
          onDrop: key => { const s = seats().find(x => x.key === key); if (s) { s.online = false; s.key = null; push(); } },
        });
        drawQR(code);
        $('lg-net').textContent = 'החדר פתוח';
        $('lg-net').className = 'lg-pill ok';
      } catch (e) {
        // כשל בהקמת החדר אינו סוף הערב: אותו משחק בדיוק רץ ממכשיר אחד
        $('lg-net').textContent = 'אין חיבור לשרת ההצטרפות';
        $('lg-net').className = 'lg-pill bad';
        show('s-lg-solo');
      }
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
      if (!seats().length) return;
      for (const s of seats()) { s.tl = []; s.bulls = 0; }
      S.round = 0; S.winner = null;
      nextRound();
    }

    async function nextRound() {
      if (!S) return;
      S.round++;
      S.phase = 'listen';
      S.heard = false;
      for (const s of seats()) { s.place = null; s.hit = false; s.bull = false; s.near = false; }
      show('s-lg-stage');
      $('lg-count').textContent = 'טוען שיר...';
      render();
      const lead = [...seats()].sort((a, b) => b.tl.length - a.tl.length)[0];
      const usedYears = lead ? lead.tl.map(x => x.y) : [];
      let song = null;
      for (let i = 0; i < 3 && !song; i++) {
        const c = draw(usedYears);
        if (!c) break;
        const ok = await B().playSong(c, st => { if (st === 'playing') { S.heard = true; render(); } });
        if (ok) song = c; else await new Promise(r => setTimeout(r, 200));
      }
      if (!song) { $('lg-count').textContent = 'לא הצלחתי לטעון שיר. נסו שוב.'; return; }
      S.song = song;
      B().used.add(song.a + '::' + song.t); B().persist();
      // מכריזים רק אחרי שהמוזיקה באמת התחילה, אחרת שיר שיתחלף ישנה
      // את השנה מתחת לאנשים שכבר שיבצו
      Net.hostBroadcast({ v: 1, t: 'ROUND', round: S.round });
      push();
    }

    function reveal() {
      if (!S || S.phase !== 'listen') return;
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
      const won = seats().filter(s => s.tl.length >= S.target);
      if (won.length === 1) { S.winner = won[0].pid; S.phase = 'done'; }
      show(S.phase === 'done' ? 's-lg-reveal' : 's-lg-reveal');
      push();
      if (S.phase === 'done') setTimeout(() => { show('s-lg-win'); renderWin(); }, 4200);
    }

    // שיבוץ ידני בשביל טלפון שמת: אף כשל מכשיר לא עוצר את השולחן
    function placeFor(pid) {
      const s = seats().find(x => x.pid === pid);
      if (!s || S.phase !== 'listen') return;
      Player.openLocalPlacement(s, idx => { s.place = idx; push(); });
    }

    return { open, start, nextRound, reveal, renderBoard, soloReady, addSeat,
             state: () => S, push, show: render, placeFor };
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
    let localMode = null;  // שיבוץ מקומי במצב מכשיר יחיד

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
      const name = ($('lg-name').value || '').trim().slice(0, 16);
      if (!name) { $('lg-join-err').textContent = 'צריך שם'; return; }
      const born = $('lg-years').dataset.born ? Number($('lg-years').dataset.born) : null;
      $('lg-join-err').textContent = 'מתחבר...';
      const prev = store()[code];
      try {
        await Net.joinRoom(code, { onMessage: onHost, onDrop: dropped });
      } catch (e) {
        $('lg-join-err').textContent = e && e.missing
          ? 'לא נמצא חדר עם הקוד הזה' : 'החיבור נכשל. בדקו שאתם על אותה רשת.';
        return;
      }
      Net.playerSend({ v: 1, t: 'HELLO', code, name, born,
                       pid: prev ? prev.pid : null, secret: prev ? prev.secret : null });
      $('lg-join-err').textContent = '';
    }

    function dropped() {
      $('lg-drop').style.display = 'flex';
      setTimeout(() => { if (code) reconnect(); }, 2000);
    }
    async function reconnect() {
      const prev = store()[code];
      try {
        await Net.joinRoom(code, { onMessage: onHost, onDrop: dropped });
        Net.playerSend({ v: 1, t: 'HELLO', code, name: prev ? prev.name : 'שחקן',
                         pid: prev ? prev.pid : null, secret: prev ? prev.secret : null });
        $('lg-drop').style.display = 'none';
      } catch (e) { setTimeout(reconnect, 2500); }
    }

    function onHost(msg) {
      if (!msg) return;
      $('lg-drop').style.display = 'none';
      if (msg.t === 'WELCOME') {
        me = { pid: msg.pid, secret: msg.secret, colour: msg.colour };
        remember();
        return;
      }
      if (msg.t === 'BYE') {
        // המושב עבר למכשיר אחר. מפסיקים להתחבר מחדש, אחרת שני מכשירים
        // ייאבקו על אותו מושב ללא סוף.
        code = null; snap = null;
        try { Net.close(); } catch (e) {}
        $('lg-drop').style.display = 'none';
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
      if (snap.phase === 'lobby') { renderWait(); show('s-lg-wait'); return; }
      if (snap.phase === 'listen') { renderPlace(); show('s-lg-place'); return; }
      if (snap.phase === 'reveal' || snap.phase === 'done') {
        show('s-lg-watch');
        $('s-lg-watch').style.background = (me && me.colour) || '#2b0a4e';
        setTimeout(() => { if (snap && (snap.phase === 'reveal' || snap.phase === 'done')) renderResult(); }, 1500);
      }
    }

    function renderWait() {
      const c = $('lg-wait-circle');
      c.style.background = (me && me.colour) || '#ff3d81';
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
        if (tl.length) wrap.appendChild(document.createTextNode('לשים '));
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
      show('s-lg-result');
      const hit = snap.me && snap.me.hit;
      $('lg-res-mark').textContent = hit ? '✓' : '✗';
      $('lg-res-mark').className = 'lg-res-mark ' + (hit ? 'hit' : 'miss');
      $('lg-res-verdict').textContent = hit ? 'צדקת' : 'פספסת';
      $('lg-res-year').textContent = snap.song.year;
      $('lg-res-title').textContent = snap.song.t;
      $('lg-res-artist').textContent = snap.song.a;
      const left = snap.target - (snap.me ? snap.me.n : 0);
      $('lg-res-left').textContent = left > 0 ? 'עוד ' + left + ' שירים לניצחון' : '';
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
          if (seat.tl.length) wrap.appendChild(document.createTextNode('לשים '));
          wrap.appendChild(labelToNode(gapLabel(seat.tl, sel)));
          btn.appendChild(wrap);
        }
        btn.onclick = () => { const d = localMode.done; localMode = null;
                              $('lg-place-who').style.display = 'none';
                              show('s-lg-stage'); d(sel); };
      };
      paintLocal();
    }

    return { joinScreen, go, openLocalPlacement, snap: () => snap };
  })();

  // ============================================================
  // נקודות כניסה
  // ============================================================
  function setup() {
    show('s-lg-setup');
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
    setup, checkHash, joinByCode,
    open: () => Host.open(false),
    solo: () => Host.soloReady(),
    start: () => Host.start(),
    next: () => Host.nextRound(),
    reveal: () => Host.reveal(),
    board: () => { Host.renderBoard(); show('s-lg-board'); },
    backToGame: () => { const S = Host.state(); show(S && S.phase === 'reveal' ? 's-lg-reveal' : 's-lg-stage'); },
    join: () => Player.go(),
    newCode: () => Host.open(false),
    addSoloSeat: () => { const n = prompt('שם השחקן'); if (n) { Host.addSeat(n); Host.show(); } },
    share: () => {
      const S = Host.state();
      if (!S) return;
      const url = location.origin + location.pathname + '#j=' + S.code;
      if (navigator.share) navigator.share({ title: 'היטסטר רמיקס', url }).catch(() => {});
    },
    quit: () => { try { Net.close(); } catch (e) {} B().stopSong(); B().releaseWake(); window.App.show('s-home'); },
  };
})();
