document.addEventListener("DOMContentLoaded", () => {
  //---------- Storage --------
  const KEY = "expenses-v2";
  const SETTINGS_KEY = "settings-v1";
  const load = () => JSON.parse(localStorage.getItem(KEY) || "[]");
  const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));
  const loadSettings = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  const saveSettings = (s) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

  //---------- State --------
  let expenses = load();
  let sort = { key: "date", dir: "desc" }; 
  let page = 1;
  let pageSize = 20;
  let settings = Object.assign({ currency: "GBP", locale: navigator.language || "en-GB"}, loadSettings());
  
  const qs = (s) => document.querySelector(s);

  //---------- Utils --------
  const money = (n) => "£" + (Number(n) || 0).toFixed(2);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const monthKey = (d) => d.slice(0, 7);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const fmt = (n) => new Intl.NumberFormat(settings.locale, {style:'currency', currency: settings.currency}).format(Number(n)||0);

  //---------- Elements --------
  const form = qs("#expense-form");
  const titleEl = qs("#title");
  const amountEl = qs("#amount");
  const categoryEl = qs("#category");
  const dateEl = qs("#date");
  const listEl = qs("#tbody");
  const kpiMonthEl = qs("#kpi-month");
  const kpiAllEl = qs("#kpi-all");
  const kpiCountEl = qs("#kpi-count");
  const filterMonthEl = qs("#filter-month");
  const filterCatEl = qs("#filter-category");
  const filterSearchEl = qs("#filter-search");
  const pageTotalEl = qs("#page-total");
  const categoryList = qs("#category-list");
  const pageSizeEl = qs("#page-size");
  const recurringEl = qs("#recurring");
  const prevBtn = qs("#prev-page");
  const nextBtn = qs("#next-page");
  const pageInfo = qs("#page-info");
  const currencySelect = qs("#currency-select");
  const localeSelect = qs("#locale-select");
  const chartCanvas = qs("#chart");

  const CURRENCIES = ["GBP", "USD", "EUR", "NGN"]
  const LOCALES = ["en-GB", "en-US", "en-CA", "en-NG"]

  //---------- Initial Defaults --------
  if (dateEl && !dateEl.value) dateEl.value = todayISO();

  function initialSelectors() {
    currencySelect.innerHTML = CURRENCIES.map(c => `<option ${c===settings.currency?"selected":""}>${c}</option>`).join("");
    localeSelect.innerHTML = LOCALES.map(l=> `<option ${l===settings.locale?"selected":""}>${l}</option>`).join("");
    pageSizeEl.value = String(pageSize);

    currencySelect.addEventListener("change", ()=>{settings.currency = currencySelect.value; saveSettings(settings); render(); });
    localeSelect.addEventListener("change", ()=>{settings.locale = localeSelect.value; saveSettings(settings); render(); });
    pageSizeEl.addEventListener("change", ()=>{pageSize = Number(pageSizeEl.value)||20; page=1; render(); });
  }

  //---------- Derived Values --------
  function categories() {
    const set = new Set(expenses.map((e) => e.category).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function refreshCategoryInputs() {
    if (categoryList) {
      categoryList.innerHTML = categories()
        .map((c) => `<option value="${c}"></option>`)
        .join("");
    }
    if (filterCatEl) {
      const current = filterCatEl.value;
      filterCatEl.innerHTML =
        `<option value="">All</option>` +
        categories().map((c) => `<option value="${c}">${c}</option>`).join("");
      if (categories().includes(current)) filterCatEl.value = current;
    }
  }

  //---- Recurring Monthly ------
  function ensureRecurring() {
    const recGroups = {};
    for (const e of expenses) {
      if (e.recurring) {
        const key = e.recurringKey || `${e.title}|${e.amount}|${e.category}`;
        if (!recGroups[key]) recGroups[key] = { template: e, months: new Set()};
        recGroups[key].months.add(monthKey(e.date));
      }
    }
    const nowYM = monthKey(todayISO());
    let changed = false;
    for (const key in recGroups) {
      const g = recGroups[key];
      const monthsSorted = Array.from(g.months).sort();
      const startYM = monthsSorted[0];
      const toAdd = missingMonths(startYM, nowYM, g.months);
      for (const ym of toAdd) {
        const d = ym + "-01";
        const base = g.template;
        expenses.push({ id: uid(), title: base.title, amount: base.amount, category: base.category, date: d, createdAt: new Date().toISOString(), recurring: true, recurringKey: key });
        changed = true;
      }
    }
    if (changed) save(expenses);
  }

  function missingMonths(startYM, endYM, haveSet) {
    const res = [];
    let [y, m] = startYM.split('-').map(Number);
    const [ey, em] = endYM.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const key = `${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}`;
      if (!haveSet.has(key)) res.push(key);
      m++; if (m>12) { m=1; y++}
    }
    return res;
  }

  //------ Submit Form ------
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = titleEl.value.trim();
      const amount = Number(amountEl.value);
      const category = categoryEl.value.trim();
      const date = dateEl.value || todayISO();
      const recurring = !!recurringEl.checked;
      if (!title || isNaN(amount) || amount <= 0) {
        alert("Enter a title and a positive amount.");
        return;
      }

      const entry = {
        id: uid(),
        title,
        amount,
        category,
        date,
        createdAt: new Date().toISOString(),
      };
      if (recurring) { entry.recurring = true; entry.recurringKey = `${title}|${amount}|${category}`;}  
      expenses.push(entry);
      save(expenses);
      form.reset();
      dateEl.value = todayISO();
      render();
    });
  }

  const resetBtn = qs("#reset-form");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      form.reset();
      dateEl.value = todayISO();
    });
  }

  //----- Filters -------
  const clearFiltersBtn = qs("#clear-filters");
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (filterMonthEl) filterMonthEl.value = "";
      if (filterCatEl) filterCatEl.value = "";
      if (filterSearchEl) filterSearchEl.value = "";
      render();
    });
  }

  [filterMonthEl, filterCatEl, filterSearchEl]
    .filter(Boolean)
    .forEach((el) => el.addEventListener("input", render));

  //----- Table Sorting -------
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-sort");
      if (sort.key === key) {
        sort.dir = sort.dir === "asc" ? "desc" : "asc";
      } else {
        sort.key = key;
        sort.dir = key === "title" || key === "category" ? "asc" : "desc";
      }
      render();
    });
  });

  //---- Delete Entry ------
  function remove(id) {
    if (!confirm("Delete this expense?")) return;
    expenses = expenses.filter((e) => e.id !== id);
    save(expenses);
    render();
  }

  //---- Export/Import/Wipe -----
  const exportBtn = qs("#export-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const data = JSON.stringify(expenses, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `expenses-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  const importFile = qs("#import-file");
  if (importFile) {
    importFile.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!Array.isArray(parsed)) throw new Error("Invalid format");
          for (const r of parsed) {
            if (!r.id) r.id = uid();
            if (!r.title || typeof r.amount !== "number" || !r.date)
              throw new Error("Missing fields");
          }
          expenses = parsed;
          save(expenses);
          render();
          alert("Import successful.");
        } catch (err) {
          alert("Import failed: " + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  const wipeBtn = qs("#wipe-btn");
  if (wipeBtn) {
    wipeBtn.addEventListener("click", () => {
      if (!confirm("This will delete ALL expenses. Continue?")) return;
      expenses = [];
      save(expenses);
      render();
    });
  }

  //----- Rendering ------
  function applyFilters(rows) {
    const m = filterMonthEl?.value || ""; // YYYY-MM
    const c = filterCatEl?.value || "";
    const s = (filterSearchEl?.value || "").trim().toLowerCase();

    return rows.filter((r) => {
      if (m && monthKey(r.date) !== m) return false;
      if (c && r.category !== c) return false;
      if (s && !r.title.toLowerCase().includes(s)) return false;
      return true;
    });
  }

  function sortRows(rows) {
    const k = sort.key;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (k === "amount") return (a.amount - b.amount) * dir;
      if (k === "date") return a.date.localeCompare(b.date) * dir;
      const av = (a[k]||"").toString.toLowerCase(); const bv = (b[k]||"").toString().toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }

  function paginate(rows) {
    const total = rows.length; 
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages; if (page < 1) page =1;
    const start = (page-1)*pageSize; 
    const slice = rows.slice(start, start+pageSize);
    prevBtn.disabled = page<=1; nextBtn.disabled = page>=totalPages; pageInfo.textContent = `Page ${page} / ${totalPages}`;
    return {rows: slice, total, totalPages};
  }

  function renderKPIs(filtered) {
  const nowYM = monthKey(todayISO());
  const monthSum = expenses.filter(e => monthKey(e.date) === nowYM).reduce((t,e)=>t+e.amount,0);
  const allSum = expenses.reduce((t,e)=>t+e.amount,0);
  kpiMonthEl.textContent = fmt(monthSum);
  kpiAllEl.textContent = fmt(allSum);
  kpiCountEl.textContent = String(expenses.length);
  const pageSum = filtered.reduce((t,e)=>t+e.amount,0);
  pageTotalEl.textContent = fmt(pageSum);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[m]);
  }

  function rowTemplate(e){
  return `
    <tr data-id="${e.id}">
      <td>${e.date}</td>
      <td>${escapeHtml(e.title)}</td>
      <td><span class="category">${escapeHtml(e.category || "—")}${e.recurring?" • Recurring":""}</span></td>
      <td class="right">${fmt(e.amount)}</td>
      <td class="right">
        <button data-action="edit">Edit</button>
        <button class="btn-danger" data-action="delete">Delete</button>
      </td>
    </tr>`;
  }

function rowEditorTemplate(e){
  return `
    <tr data-id="${e.id}">
      <td><input type="date" value="${e.date}"></td>
      <td><input type="text" value="${escapeHtml(e.title)}"></td>
      <td><input type="text" value="${escapeHtml(e.category||"")}" list="category-list"></td>
      <td class="right"><input type="number" step="0.01" min="0" value="${e.amount}"></td>
      <td class="right">
        <button data-action="save">Save</button>
        <button data-action="cancel">Cancel</button>
      </td>
    </tr>`;
  }

  function renderTable(paged) {
    listEl.innerHTML = paged.rows.map(rowTemplate).join("");
    listEl.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleRowAction(btn));
    });
  }

  function handleRowAction(btn){
  const tr = btn.closest('tr'); const id = tr.getAttribute('data-id'); const action = btn.getAttribute('data-action');
  const idx = expenses.findIndex(e=>e.id===id); if (idx<0) return;
  if (action === 'delete') return remove(id);
  if (action === 'edit'){
    tr.outerHTML = rowEditorTemplate(expenses[idx]);
    const newTr = document.querySelector(`tr[data-id="${id}"]`);
    newTr.querySelectorAll('button[data-action]').forEach(b=>b.addEventListener('click',()=>handleRowEditAction(b)));
  }
}

function handleRowEditAction(btn){
  const tr = btn.closest('tr'); const id = tr.getAttribute('data-id'); const action = btn.getAttribute('data-action');
  const idx = expenses.findIndex(e=>e.id===id); if (idx<0) return;
  if (action === 'cancel'){ render(); return; }
  if (action === 'save'){
    const inputs = tr.querySelectorAll('input');
    const [dateIn, titleIn, catIn, amtIn] = inputs;
    const title = titleIn.value.trim(); const amount = Number(amtIn.value); const category = catIn.value.trim(); const date = dateIn.value;
    if (!title || isNaN(amount) || amount<=0 || !date) return alert('Please enter valid values.');
    const prev = expenses[idx];
    expenses[idx] = Object.assign({}, prev, { title, amount, category, date });
    save(expenses); render();
  }
}

// ---------- Chart (Pie) ----------
function drawChart(filtered){
  const ctx = chartCanvas.getContext('2d');
  ctx.clearRect(0,0,chartCanvas.width, chartCanvas.height);
  const sums = {};
  for (const e of filtered){ const k = e.category||'Uncategorized'; sums[k] = (sums[k]||0) + e.amount; }
  const labels = Object.keys(sums);
  const values = labels.map(k=>sums[k]);
  const total = values.reduce((a,b)=>a+b,0) || 1;
  const cx = chartCanvas.width/2, cy = chartCanvas.height/2, r = Math.min(cx, cy)-20;
  let start = -Math.PI/2;
  for (let i=0;i<values.length;i++){
    const slice = values[i]/total * Math.PI*2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,start+slice); ctx.closePath();
    const h = Math.abs(hashCode(labels[i])) % 360; ctx.fillStyle = `hsl(${h} 70% 45%)`;
    ctx.fill(); start += slice;
  }
  ctx.font = '14px system-ui'; ctx.textBaseline = 'middle';
  let y = 20; const x = 10;
  labels.forEach((lab,i)=>{
    const h = Math.abs(hashCode(lab)) % 360; ctx.fillStyle = `hsl(${h} 70% 45%)`;
    ctx.fillRect(x, y-6, 12, 12);
    ctx.fillStyle = '#cbd5e1';
    const pct = ((values[i]/total)*100).toFixed(1)+'%';
    ctx.fillText(`${lab} — ${fmt(values[i])} (${pct})`, x+18, y);
    y += 18;
  });
}

function hashCode(str){ let h=0; for(let i=0;i<str.length;i++){ h = ((h<<5)-h) + str.charCodeAt(i); h |= 0; } return h; }

function render() {
  refreshCategoryInputs();
  const filtered = applyFilters(expenses);
  const sorted = sortRows(filtered);
  const paged = paginate(sorted);
  renderKPIs(paged.rows);
  renderTable(paged);
  drawChart(filtered);
}

// ----------- Paginated Buttons ----------
prevBtn.addEventListener('click', () => {if (page>1){page--; render();}});
nextBtn.addEventListener('click', ()=>{page++; render();});

// ---------- Seed demo (optional) ----------
if (expenses.length === 0) {
  const demo = [
    { title: "Groceries", amount: 24.5, category: "Food", date: todayISO() },
    { title: "Bus pass", amount: 18.0, category: "Transport", date: todayISO() },
    { title: "Coffee", amount: 3.2, category: "Food", date: todayISO() },
    { title: "Rent", amount: 600.00, category: "Housing", date: todayISO(), recurring:true, recurringKey:"Rent|600|Housing"},
  ].map((x) => ({ id: uid(), createdAt: new Date().toISOString(), ...x }));
  expenses = demo;
  save(expenses);
}

  // ---------- Kick off ----------
  initialSelectors();
  ensureRecurring();
  render();
});
