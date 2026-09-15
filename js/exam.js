const $app = document.getElementById("app");
const TYPE_AR = {
  tf: "صح / خطأ",
  mcq: "اختيار من متعدد",
  scenario: "سيناريو مؤسسي",
  image: "تعرّف الصورة",
  classify: "تصنيف",
};

const BIN_MAP = Object.fromEntries(BINS.map((b) => [b.id, b]));
const ITEM_MAP = Object.fromEntries(CLASSIFY.map((x) => [x.id, x]));

const state = {
  name: "",
  klass: "",
  part: 0,
  classify: {},
  classifyOrder: [],
  picked: null,
  order: [],
  answers: {},
  i: 0,
  startedAt: 0,
  finishedAt: 0,
  endsAt: 0,
  tick: null,
  submitted: false,
  timedOut: false,
  sendNote: "",
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function qAt(i) {
  return QUESTIONS.find((q) => q.id === state.order[i]);
}

function classifyPoints() {
  return CLASSIFY.length;
}

function part2Points() {
  return QUESTIONS.reduce((s, q) => s + q.points, 0);
}

function totalPoints() {
  return classifyPoints() + part2Points();
}

function placedCount() {
  return Object.keys(state.classify).length;
}

function nowStamp(ms) {
  return new Date(ms || Date.now()).toLocaleString("ar-JO", { dateStyle: "short", timeStyle: "medium" });
}

function durationInfo(startMs, endMs) {
  const totalSec = Math.max(0, Math.round((endMs - startMs) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return {
    seconds: totalSec,
    minutes: Math.round((totalSec / 60) * 100) / 100,
    clock: String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"),
    text: m + " دقيقة و " + s + " ثانية",
  };
}

function typePercent(details, type) {
  const rows = details.filter((d) => d.type === type);
  if (!rows.length) return "";
  const max = rows.reduce((s, d) => s + d.points, 0);
  const earned = rows.reduce((s, d) => s + d.earned, 0);
  return max ? Math.round((earned / max) * 100) : 0;
}

function joinItems(rows, fmt) {
  return rows.length ? rows.map(fmt).join("  |  ") : "لا يوجد";
}

function sheetsUrl() {
  return String((window.PD_CLOUD || {}).sheetsUrl || "").trim();
}

function sendCloud(pack) {
  const url = sheetsUrl();
  if (!url) return "missing";
  const body = JSON.stringify(pack);
  try {
    let form = document.getElementById("examCloudForm");
    if (!form) {
      form = document.createElement("form");
      form.id = "examCloudForm";
      form.method = "POST";
      form.target = "examSink";
      form.acceptCharset = "UTF-8";
      form.style.display = "none";
      ["payload", "data"].forEach((name) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        form.appendChild(input);
      });
      document.body.appendChild(form);
    }
    form.action = url;
    form.querySelector("[name=payload]").value = body;
    form.querySelector("[name=data]").value = body;
    form.submit();
    return "sent";
  } catch (err) {
    try {
      fetch(url, {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: "payload=" + encodeURIComponent(body),
      });
      return "sent";
    } catch (e2) {
      return "fail";
    }
  }
}

function gradeClassify() {
  return CLASSIFY.map((item, i) => {
    const chosenId = state.classify[item.id];
    const chosen = chosenId ? BIN_MAP[chosenId] : null;
    const correct = BIN_MAP[item.cat];
    const ok = chosenId === item.cat;
    return {
      num: i + 1,
      id: item.id,
      type: "classify",
      typeAr: "تصنيف",
      topic: correct.name,
      points: 1,
      prompt: "صنّف: " + item.name,
      chosen: chosen ? chosen.name : "لم يصنّف",
      correctText: correct.name,
      result: !chosenId ? "لم يجب" : (ok ? "صحيح" : "خطأ"),
      earned: ok ? 1 : 0,
      explain: item.name + " تنتمي إلى «" + correct.name + "».",
    };
  });
}

function gradePart2() {
  return state.order.map((id, i) => {
    const q = QUESTIONS.find((x) => x.id === id);
    const chosenId = state.answers[q.id];
    const chosen = q.options.find((o) => o.id === chosenId);
    const correct = q.options.find((o) => o.ok);
    const ok = Boolean(chosenId && correct && chosenId === correct.id);
    return {
      num: i + 1,
      id: q.id,
      type: q.type,
      typeAr: TYPE_AR[q.type],
      topic: q.topic,
      points: q.points,
      prompt: q.prompt,
      chosen: chosen ? chosen.text : "لم يجب",
      correctText: correct ? correct.text : "",
      result: !chosenId ? "لم يجب" : (ok ? "صحيح" : "خطأ"),
      earned: ok ? q.points : 0,
      explain: q.explain,
    };
  });
}

function grade() {
  const classifyDetails = gradeClassify();
  const part2Details = gradePart2();
  const details = classifyDetails.concat(part2Details);
  const p1Earned = classifyDetails.reduce((s, d) => s + d.earned, 0);
  const p1Max = classifyPoints();
  const p2Earned = part2Details.reduce((s, d) => s + d.earned, 0);
  const p2Max = part2Points();
  const earned = p1Earned + p2Earned;
  const max = totalPoints();
  const percent = max ? Math.round((earned / max) * 100) : 0;
  const percentP1 = p1Max ? Math.round((p1Earned / p1Max) * 100) : 0;
  const percentP2 = p2Max ? Math.round((p2Earned / p2Max) * 100) : 0;
  const correct = details.filter((d) => d.result === "صحيح").length;
  const wrong = details.filter((d) => d.result === "خطأ").length;
  const skipped = details.filter((d) => d.result === "لم يجب").length;
  const weak = {};
  details.forEach((d) => {
    if (d.result !== "صحيح") weak[d.topic] = (weak[d.topic] || 0) + 1;
  });
  const weakTopics = Object.entries(weak).sort((a, b) => b[1] - a[1]).map(([t, n]) => t + " (" + n + ")");
  let band = "لم يثبت الفهم بعد — أعد درس المعالجة اليدوية والآلية والسؤال الذهبي ثم أعد المحاولة.";
  if (percent >= 85) band = "أتقنت الدرس: تميّز اليدوية من الآلية وتعرف متى نختار كل نوع.";
  else if (percent >= 70) band = "فهم جيد مع ثغرات. راجع التصنيف أو الموضوعات الضعيفة أدناه.";
  else if (percent >= 50) band = "بداية تمييز، لكن قاعدة «من يعالج البيانات؟» تحتاج تثبيتًا.";
  return {
    details,
    classifyDetails,
    part2Details,
    p1Earned,
    p1Max,
    p2Earned,
    p2Max,
    percentP1,
    percentP2,
    earned,
    max,
    percent,
    correct,
    wrong,
    skipped,
    weakTopics,
    band,
  };
}

function examPayload(g) {
  const finishedAt = state.finishedAt || Date.now();
  const dur = durationInfo(state.startedAt, finishedAt);
  const errors = g.details.filter((d) => d.result === "خطأ");
  const blanks = g.details.filter((d) => d.result === "لم يجب");
  const goods = g.details.filter((d) => d.result === "صحيح");
  return {
    kind: "data-processing",
    name: state.name,
    klass: state.klass,
    when: nowStamp(finishedAt),
    startedAt: nowStamp(state.startedAt),
    finishedAt: nowStamp(finishedAt),
    durationSeconds: dur.seconds,
    durationMinutes: dur.minutes,
    durationClock: dur.clock,
    durationText: dur.text,
    allowedMinutes: EXAM.minutes,
    submitType: state.timedOut ? "انتهى الوقت — تسليم تلقائي" : "تسليم يدوي",
    minutes: EXAM.minutes,
    correct: g.correct,
    wrong: g.wrong,
    skipped: g.skipped,
    answered: g.correct + g.wrong,
    total: CLASSIFY.length + QUESTIONS.length,
    points: g.earned,
    maxPoints: g.max,
    percent: g.percent,
    percentPart1: g.percentP1,
    percentPart2: g.percentP2,
    pointsPart1: g.p1Earned,
    maxPart1: g.p1Max,
    pointsPart2: g.p2Earned,
    maxPart2: g.p2Max,
    percentTf: typePercent(g.part2Details, "tf"),
    percentMcq: typePercent(g.part2Details, "mcq"),
    percentScenario: typePercent(g.part2Details, "scenario"),
    percentImage: typePercent(g.part2Details, "image"),
    percentClassify: g.percentP1,
    band: g.band,
    weakTopics: g.weakTopics.join("، ") || "لا يوجد",
    errorSummary: joinItems(errors, (d) =>
      (d.type === "classify" ? "تصنيف " : "س") + d.num + " [" + d.topic + "] أجاب: " + d.chosen + " | الصحيح: " + d.correctText
    ),
    skippedSummary: joinItems(blanks, (d) =>
      (d.type === "classify" ? "تصنيف " : "س") + d.num + " [" + d.topic + "] " + d.prompt
    ),
    correctSummary: joinItems(goods, (d) =>
      (d.type === "classify" ? "تصنيف " : "س") + d.num + " [" + d.topic + "]"
    ),
    classifySummary: joinItems(g.classifyDetails, (d) =>
      d.prompt.replace("صنّف: ", "") + " → " + d.chosen + (d.result === "صحيح" ? " ✓" : " ✗ (" + d.correctText + ")")
    ),
    details: g.details,
    classifyDetails: g.classifyDetails,
  };
}

function setPartBadge(text) {
  const el = document.getElementById("part-badge");
  if (!el) return;
  if (!text) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
}

function renderStart() {
  document.body.classList.add("is-start");
  const n1 = CLASSIFY.length;
  const n2 = QUESTIONS.length;
  $app.innerHTML = `
    <div class="start-fit">
      <p class="kicker">${esc(EXAM.unit)}</p>
      <h1>${esc(EXAM.title)}</h1>
      <p class="lead">جزآن سهلاً: صنّف يدوية أو آلية، ثم أجب عن صور وصح/خطأ وأسئلة فهم من درس العرض.</p>
      <div class="grid start-stats">
        <div class="stat"><b>جزآن</b> تصنيف ثم فهم</div>
        <div class="stat"><b>${n1 + n2}</b> بندًا · ${totalPoints()} درجة</div>
        <div class="stat"><b>${EXAM.minutes} د</b> ثم تسليم تلقائي</div>
      </div>
      <article class="panel start-panel">
        <h2>قبل أن تبدأ</h2>
        <ul>
          <li><strong>الجزء الأول:</strong> اسحب البطاقة إلى «يدوية» أو «آلية»، أو اضغط البطاقة ثم الصندوق.</li>
          <li><strong>السؤال الذهبي:</strong> من يعالج البيانات الآن؟ إنسان = يدوية · جهاز = آلية.</li>
          <li>وجود حاسوب أو إنسان في الصورة لا يكفي وحده — انظر من يعالج.</li>
          <li>بعد إنهاء التصنيف لا يمكن الرجوع لتعديله.</li>
          <li><strong>الجزء الثاني:</strong> صور جديدة، صح/خطأ، واختيار بسيط. تنقّل بحرية قبل التسليم.</li>
        </ul>
        <form id="start-form">
          <div class="form-row">
            <label>اسم الطالب <input id="nm" required autocomplete="name" /></label>
            <label>الشعبة / الصف <input id="kl" placeholder="مثال: 11 ت" /></label>
          </div>
          <small class="err hidden" id="err">اكتب الاسم للبدء.</small>
          <button class="btn" type="submit">بدء الامتحان</button>
        </form>
      </article>
    </div>
  `;
  $app.querySelector("#start-form").onsubmit = (e) => {
    e.preventDefault();
    const name = $app.querySelector("#nm").value.trim();
    if (!name) {
      $app.querySelector("#err").classList.remove("hidden");
      return;
    }
    state.name = name;
    state.klass = $app.querySelector("#kl").value.trim();
    startExam();
  };
}

function startExam() {
  document.body.classList.remove("is-start");
  state.classifyOrder = shuffle(CLASSIFY.map((x) => x.id));
  state.classify = {};
  state.picked = null;
  state.order = shuffle(QUESTIONS.map((q) => q.id));
  QUESTIONS.forEach((q) => {
    if (q.type !== "tf") q.options = shuffle(q.options);
  });
  state.answers = {};
  state.i = 0;
  state.part = 1;
  state.submitted = false;
  state.timedOut = false;
  state.startedAt = Date.now();
  state.finishedAt = 0;
  state.endsAt = state.startedAt + EXAM.minutes * 60 * 1000;
  document.getElementById("timer-box").classList.remove("hidden");
  if (state.tick) clearInterval(state.tick);
  state.tick = setInterval(updateTimer, 250);
  updateTimer();
  renderClassify();
}

function updateTimer() {
  const left = Math.max(0, state.endsAt - Date.now());
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const el = document.getElementById("timer");
  if (el) el.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  const box = document.getElementById("timer-box");
  if (box) box.classList.toggle("warn", left < 5 * 60 * 1000);
  if (left <= 0 && !state.submitted) submitExam(true);
}

function placeItem(itemId, binId) {
  if (!ITEM_MAP[itemId] || !BIN_MAP[binId]) return;
  state.classify[itemId] = binId;
  state.picked = null;
  renderClassify();
}

function unplaceItem(itemId) {
  delete state.classify[itemId];
  state.picked = null;
  renderClassify();
}

function renderClassify() {
  setPartBadge("الجزء 1 · التصنيف");
  const n = CLASSIFY.length;
  const done = placedCount();
  const pool = state.classifyOrder.filter((id) => !state.classify[id]);
  $app.innerHTML = `
    <div class="meta">
      <span class="badge">سحب وإفلات · ${n} جهازًا · ${n} درجة</span>
      <span>صُنِّف ${done} من ${n}</span>
    </div>
    <article class="panel classify-intro">
      <h2>ضع كل جهاز في فئته الصحيحة</h2>
      <p class="lead">اسحب البطاقة إلى الصندوق، أو اضغط البطاقة ثم الصندوق. يمكنك إعادة البطاقة إلى المجموعة بالضغط عليها داخل الصندوق.</p>
    </article>
    <div class="pool ${pool.length ? "" : "pool-empty"}" id="pool" data-bin="">
      ${pool.length
        ? pool.map((id) => chipHtml(id)).join("")
        : `<p class="pool-msg">صُنِّف كل البنود. راجع الصناديق ثم انتقل للجزء الثاني.</p>`}
    </div>
    <div class="bins">
      ${BINS.map((bin) => {
        const items = state.classifyOrder.filter((id) => state.classify[id] === bin.id);
        return `
          <section class="bin tone-${bin.tone}" data-bin="${bin.id}">
            <header>
              <h3>${esc(bin.name)}</h3>
              <small>${esc(bin.nameEn)} · ${items.length}</small>
            </header>
            <div class="bin-drop">
              ${items.length ? items.map((id) => chipHtml(id, true)).join("") : `<span class="bin-hint">أفلت هنا</span>`}
            </div>
          </section>
        `;
      }).join("")}
    </div>
    <div class="pager">
      <span class="hint-inline">${state.picked ? "اختر الصندوق الآن، أو اضغط البطاقة مرة أخرى للإلغاء." : ""}</span>
      <button class="btn" id="to-part2">${done < n ? "متابعة وفي بنود غير مصنّفة" : "إنهاء التصنيف والانتقال للفهم"}</button>
    </div>
  `;
  bindClassifyEvents();
  $app.querySelector("#to-part2").onclick = () => {
    if (done < n) renderClassifyConfirm();
    else startPart2();
  };
}

function chipHtml(id, inBin) {
  const item = ITEM_MAP[id];
  const on = state.picked === id ? " on" : "";
  const placed = inBin ? " in-bin" : "";
  return `<button type="button" class="chip${on}${placed}" draggable="true" data-chip="${id}">${esc(item.name)}</button>`;
}

function bindClassifyEvents() {
  $app.querySelectorAll("[data-chip]").forEach((el) => {
    const id = el.dataset.chip;
    el.onclick = (e) => {
      e.stopPropagation();
      if (el.dataset.dragged === "1") {
        el.dataset.dragged = "";
        return;
      }
      if (state.classify[id]) {
        unplaceItem(id);
        return;
      }
      state.picked = state.picked === id ? null : id;
      renderClassify();
    };
    el.addEventListener("dragstart", (e) => {
      state.picked = id;
      el.dataset.dragged = "1";
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      setTimeout(() => { el.dataset.dragged = ""; }, 0);
    });
  });

  const zones = $app.querySelectorAll(".bin, #pool");
  zones.forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("over");
      const id = e.dataTransfer.getData("text/plain") || state.picked;
      const binId = zone.getAttribute("data-bin") || "";
      if (!id) return;
      if (!binId) unplaceItem(id);
      else placeItem(id, binId);
    });
    if (zone.classList.contains("bin")) {
      zone.addEventListener("click", () => {
        if (state.picked && !state.classify[state.picked]) {
          placeItem(state.picked, zone.getAttribute("data-bin"));
        }
      });
    }
  });
}

function renderClassifyConfirm() {
  const n = CLASSIFY.length;
  const done = placedCount();
  $app.innerHTML = `
    <h1>إنهاء الجزء الأول؟</h1>
    <p class="lead">تم تصنيف ${done} من ${n}. البنود غير المصنّفة تُحسب صفرًا، ولا يمكن تعديل التصنيف بعد المتابعة.</p>
    <div class="pager">
      <button class="btn ghost" id="back">العودة للتصنيف</button>
      <button class="btn" id="go">تأكيد والانتقال للجزء الثاني</button>
    </div>
  `;
  $app.querySelector("#back").onclick = () => renderClassify();
  $app.querySelector("#go").onclick = () => startPart2();
}

function startPart2() {
  state.part = 2;
  state.picked = null;
  state.i = 0;
  renderQuestion();
}

function renderQuestion() {
  setPartBadge("الجزء 2 · الفهم");
  const q = qAt(state.i);
  const n = state.order.length;
  const chosen = state.answers[q.id];
  $app.innerHTML = `
    <div class="meta">
      <span class="badge">${TYPE_AR[q.type]} · ${esc(q.topic)} · ${q.points} درجة</span>
      <span>سؤال ${state.i + 1} من ${n} · أُجيب ${Object.keys(state.answers).length}/${n}</span>
    </div>
    <article class="panel">
      <h2>${esc(q.prompt)}</h2>
      ${q.image ? `<div class="q-image"><img src="${esc(q.image)}" alt="${esc(q.imageAlt || "")}" referrerpolicy="no-referrer" /></div>` : ""}
      ${q.options.map((o) => `
        <button class="choice ${chosen === o.id ? "on" : ""}" data-opt="${o.id}">${esc(o.text)}</button>
      `).join("")}
      <div class="pager">
        <button class="btn ghost" id="prev" ${state.i === 0 ? "disabled" : ""}>السابق</button>
        <button class="btn" id="next">${state.i === n - 1 ? "مراجعة التسليم" : "التالي"}</button>
      </div>
    </article>
    <div class="dots" id="dots"></div>
    <p style="margin-top:16px"><button class="btn danger" id="finish">تسليم الامتحان الآن</button></p>
  `;
  const dots = $app.querySelector("#dots");
  state.order.forEach((id, idx) => {
    const b = document.createElement("button");
    b.textContent = idx + 1;
    if (idx === state.i) b.classList.add("now");
    if (state.answers[id]) b.classList.add("done");
    b.onclick = () => { state.i = idx; renderQuestion(); };
    dots.appendChild(b);
  });
  $app.querySelectorAll("[data-opt]").forEach((btn) => {
    btn.onclick = () => {
      state.answers[q.id] = btn.dataset.opt;
      renderQuestion();
    };
  });
  $app.querySelector("#prev").onclick = () => { state.i = Math.max(0, state.i - 1); renderQuestion(); };
  $app.querySelector("#next").onclick = () => {
    if (state.i === n - 1) renderConfirm();
    else { state.i += 1; renderQuestion(); }
  };
  $app.querySelector("#finish").onclick = () => renderConfirm();
}

function renderConfirm() {
  setPartBadge("تسليم");
  const n = QUESTIONS.length;
  const done = Object.keys(state.answers).length;
  const cDone = placedCount();
  $app.innerHTML = `
    <h1>تسليم الامتحان</h1>
    <p class="lead">التصنيف: ${cDone} من ${CLASSIFY.length}. الفهم: ${done} من ${n}. البنود الفارغة تُحسب صفرًا. بعد التسليم تُحفظ البيانات ولا يُعاد فتح التصنيف.</p>
    <div class="pager">
      <button class="btn ghost" id="back">العودة لأسئلة الفهم</button>
      <button class="btn danger" id="go">تأكيد التسليم</button>
    </div>
  `;
  $app.querySelector("#back").onclick = () => renderQuestion();
  $app.querySelector("#go").onclick = () => submitExam(false);
}

function submitExam(timedOut) {
  if (state.submitted) return;
  state.submitted = true;
  state.timedOut = Boolean(timedOut);
  state.finishedAt = Date.now();
  if (state.tick) clearInterval(state.tick);
  const box = document.getElementById("timer-box");
  if (box) box.classList.add("hidden");
  setPartBadge("");
  const g = grade();
  g.duration = durationInfo(state.startedAt, state.finishedAt);
  g.timedOut = state.timedOut;
  state.sendNote = sendCloud(examPayload(g));
  renderResult(g);
}

function renderResult(g) {
  if (state.sendNote === "sent") {
    send = `<p class="send-status ok">تم إرسال البيانات إلى السحابة. إن لم تظهر في الجدول خلال دقيقة: تأكدي أن نشر Apps Script على Anyone.</p>`;
  } else if (state.sendNote === "missing") {
    send = `<p class="send-status bad">لم يُضبط رابط الجدول بعد. سجّل الدرجة يدويًا: ${g.percent}% (${g.earned}/${g.max}).</p>`;
  } else {
    send = `<p class="send-status bad">تعذّر حفظ البيانات. أخبر المعلم بالاسم والدرجة ${g.percent}%.</p>`;
  }
  $app.innerHTML = `
    <p class="kicker">نتيجة ${esc(state.name)}</p>
    <h1>هل اكتمل فهم المعالجة اليدوية والآلية؟</h1>
    <div class="score-ring" style="--p:${g.percent}"><span>${g.earned}/${g.max}</span></div>
    <p class="band">${g.percent}% · ${g.correct} صحيحة · ${g.wrong} خطأ · ${g.skipped} بلا إجابة · المدة ${esc(g.duration.text)}</p>
    <div class="grid start-stats result-parts">
      <div class="stat"><b>${g.percentP1}%</b> الجزء 1 · التصنيف ${g.p1Earned}/${g.p1Max}</div>
      <div class="stat"><b>${g.percentP2}%</b> الجزء 2 · الفهم ${g.p2Earned}/${g.p2Max}</div>
    </div>
    <p class="lead" style="text-align:center">${esc(g.band)}</p>
    ${send}
    ${g.weakTopics.length ? `<article class="panel"><strong>موضوعات تحتاج مراجعة:</strong> ${esc(g.weakTopics.join("، "))}</article>` : ""}
    <h2>مراجعة التصنيف</h2>
    <div class="review">
      ${g.classifyDetails.map((d) => `
        <article class="${d.result === "صحيح" ? "good" : "bad"}">
          <h3>${esc(d.prompt)} · ${esc(d.result)} · ${d.earned}/${d.points}</h3>
          <p><strong>وضعك:</strong> ${esc(d.chosen)}</p>
          <p><strong>الأصح:</strong> ${esc(d.correctText)}</p>
        </article>
      `).join("")}
    </div>
    <h2>مراجعة الفهم</h2>
    <div class="review">
      ${g.part2Details.map((d, i) => `
        <article class="${d.result === "صحيح" ? "good" : "bad"}">
          <h3>${i + 1}. ${esc(d.typeAr)} · ${esc(d.result)} · ${d.earned}/${d.points}</h3>
          <p>${esc(d.prompt)}</p>
          <p><strong>إجابتك:</strong> ${esc(d.chosen)}</p>
          <p><strong>الأصح:</strong> ${esc(d.correctText)}</p>
          <p>${esc(d.explain)}</p>
        </article>
      `).join("")}
    </div>
  `;
}

renderStart();
