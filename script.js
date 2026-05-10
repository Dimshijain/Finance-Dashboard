// ── DEFAULT CATEGORIES ────────────────────────────────────────
const DEFAULT_CATEGORIES = {
  income:  ['Salary', 'Freelance', 'Investment', 'Business', 'Gift', 'Other Income'],
  expense: ['Food', 'Transport', 'Shopping', 'Entertainment', 'Health', 'Education', 'Bills & Utilities', 'Rent', 'Other']
};

const CATEGORY_ICONS = {
  'Salary':'💼','Freelance':'💻','Investment':'📈','Business':'🏢','Gift':'🎁','Other Income':'💵',
  'Food':'🍔','Transport':'🚗','Shopping':'🛍️','Entertainment':'🎬','Health':'💊',
  'Education':'📚','Bills & Utilities':'🔌','Rent':'🏠','Other':'📦'
};

const DEFAULT_BUDGET_LIMITS = {
  'Food':8000,'Transport':4000,'Shopping':6000,'Entertainment':3000,
  'Health':5000,'Education':10000,'Bills & Utilities':4000,'Rent':15000,'Other':3000
};

// ── STATE ──────────────────────────────────────────────────────
let transactions  = JSON.parse(localStorage.getItem('fin_transactions') || '[]');
let customBudgets = JSON.parse(localStorage.getItem('fin_budget_limits') || 'null') || { ...DEFAULT_BUDGET_LIMITS };
let customCats    = JSON.parse(localStorage.getItem('fin_categories')    || 'null') || { income: [...DEFAULT_CATEGORIES.income], expense: [...DEFAULT_CATEGORIES.expense] };
let reminders     = JSON.parse(localStorage.getItem('fin_reminders')     || '[]');
let goals         = JSON.parse(localStorage.getItem('fin_goals')          || '[]');
let currentView   = 'monthly';
let activeDatePreset = 'all';
let activeDateFrom   = null;
let activeDateTo     = null;

let doughnutChart, barChart, categoryChart, balanceChart;

// ── INIT ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restore saved theme
  const savedTheme = localStorage.getItem('fin_theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('themeBtn').textContent = savedTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
  }

  document.getElementById('date').valueAsDate = new Date();
  document.getElementById('reminderDate').valueAsDate = new Date();
  populateCategories();
  populateDescriptions();
  document.getElementById('type').addEventListener('change', () => {
    // Preserve custom description text across type switch
    const custom     = document.getElementById('descCustom');
    const savedText  = custom.value;
    populateCategories();
    populateDescriptions();
    if (savedText) {
      document.getElementById('desc').value = '__custom__';
      custom.style.display = 'block';
      custom.value = savedText;
    }
  });
  checkRecurring();
  checkReminders();
  renderAll();
  document.getElementById('goalDeadline').valueAsDate = new Date(new Date().setMonth(new Date().getMonth() + 3));
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Scroll-to-top button visibility
  window.addEventListener('scroll', () => {
    const btn = document.getElementById('scrollTopBtn');
    if (btn) btn.classList.toggle('visible', window.scrollY > 300);
  });
});

// ── SMART AUTO-CATEGORY (AI keyword detection) ────────────────
const KEYWORD_CATEGORY_MAP = [
  { keywords: ['rent', 'apartment', 'pg', 'hostel', 'house', 'flat', 'lease'], category: 'Rent' },
  { keywords: ['zomato', 'swiggy', 'food', 'grocery', 'grocer', 'restaurant', 'dining', 'biryani', 'pizza', 'lunch', 'dinner', 'breakfast', 'cafe', 'blinkit', 'zepto', 'bigbasket', 'bazaar', 'dmart', 'eat'], category: 'Food' },
  { keywords: ['ola', 'uber', 'cab', 'petrol', 'fuel', 'bus', 'metro', 'auto', 'rapido', 'train', 'ticket', 'flight', 'travel', 'toll'], category: 'Transport' },
  { keywords: ['netflix', 'hotstar', 'spotify', 'prime', 'movie', 'cinema', 'game', 'gaming', 'ott', 'youtube', 'zee5', 'jiocinema'], category: 'Entertainment' },
  { keywords: ['amazon', 'flipkart', 'myntra', 'shopping', 'clothes', 'shoe', 'fashion', 'mall', 'meesho', 'ajio', 'nykaa'], category: 'Shopping' },
  { keywords: ['doctor', 'hospital', 'medicine', 'pharmacy', 'medical', 'clinic', 'apollo', 'lab', 'health', 'dental', 'test'], category: 'Health' },
  { keywords: ['school', 'college', 'course', 'udemy', 'fees', 'tuition', 'books', 'education', 'coaching', 'certification', 'coursera'], category: 'Education' },
  { keywords: ['electricity', 'water', 'gas', 'wifi', 'internet', 'broadband', 'mobile', 'recharge', 'jio', 'airtel', 'vi', 'bsnl', 'bill', 'utility', 'postpaid'], category: 'Bills & Utilities' },
  { keywords: ['gym', 'fitness', 'yoga', 'cult', 'sport'], category: 'Health' },
];

function autoDetectCategory() {
  const desc   = document.getElementById('descCustom').value.toLowerCase();
  if (desc.length < 3) return;
  const typeEl = document.getElementById('type');
  const select = document.getElementById('category');
  for (const rule of KEYWORD_CATEGORY_MAP) {
    if (rule.keywords.some(kw => desc.includes(kw))) {
      // Switch to expense silently (programmatic set doesn't fire change event)
      if (typeEl.value !== 'expense') {
        typeEl.value = 'expense';
        populateCategories(); // refresh category list only — description untouched
      }
      if (select.value !== rule.category) {
        select.value = rule.category;
        showToast(`🤖 Category auto-detected: ${rule.category}`);
      }
      break;
    }
  }
}

// ── POPULATE CATEGORIES ────────────────────────────────────────
const DESC_OPTIONS = {
  income:  ['Salary Received', 'Monthly Salary', 'Freelance Payment', 'Business Revenue',
             'Investment Return', 'Dividend Income', 'Bonus', 'Gift Received', 'Side Income', 'Other'],
  expense: ['Grocery Shopping', 'Restaurant / Dining', 'Uber / Cab Fare', 'Petrol / Fuel',
             'Online Shopping', 'Movie / OTT', 'Medical Expense', 'Electricity Bill',
             'Rent Payment', 'School / College Fee', 'Gym Membership', 'Mobile Recharge', 'EMI Payment', 'Other']
};

function populateDescriptions() {
  const type   = document.getElementById('type').value;
  const select = document.getElementById('desc');
  const opts   = DESC_OPTIONS[type] || [];
  select.innerHTML = '<option value="">-- Select Description --</option>' +
    opts.map(d => `<option value="${d}">${d}</option>`).join('') +
    '<option value="__custom__">+ Custom...</option>';
  const custom = document.getElementById('descCustom');
  if (custom) { custom.style.display = 'none'; custom.value = ''; }
}

function handleDescSelect(sel) {
  const custom = document.getElementById('descCustom');
  if (sel.value === '__custom__') {
    custom.style.display = 'block';
    custom.focus();
  } else {
    custom.style.display = 'none';
  }
}

function populateCategories() {
  const type   = document.getElementById('type').value;
  const select = document.getElementById('category');
  select.innerHTML = '<option value="" disabled selected>-- Select Category --</option>' +
    customCats[type].map(c => `<option value="${c}">${CATEGORY_ICONS[c] || '📦'} ${c}</option>`).join('');
}

function populateEditCategories() {
  const type   = document.getElementById('editType').value;
  const select = document.getElementById('editCategory');
  select.innerHTML = customCats[type].map(c => `<option value="${c}">${CATEGORY_ICONS[c] || '📦'} ${c}</option>`).join('');
}

// ── CHECK RECURRING ───────────────────────────────────────────
function checkRecurring() {
  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  transactions.filter(t => t.recurring).forEach(t => {
    const txnMonth    = t.date.slice(0, 7);
    const alreadyAdded = transactions.some(x =>
      x.recurring && x.desc === t.desc && x.amount === t.amount &&
      x.type === t.type && x.date.startsWith(ym) && x.id !== t.id
    );
    if (txnMonth !== ym && !alreadyAdded) {
      transactions.unshift({ ...t, id: Date.now() + Math.random(), date: `${ym}-${t.date.slice(8)}` });
    }
  });
  saveData();
}

// ── ADD TRANSACTION ────────────────────────────────────────────
function addTransaction(e) {
  e.preventDefault();
  const descSel   = document.getElementById('desc');
  const descCustom = document.getElementById('descCustom');
  const desc      = descSel.value === '__custom__' ? descCustom.value.trim() : descSel.value.trim();
  const amount    = parseFloat(document.getElementById('amount').value);
  const type      = document.getElementById('type').value;
  const category  = document.getElementById('category').value;
  const date      = document.getElementById('date').value;
  const notes     = document.getElementById('notes').value.trim();
  const recurring = document.getElementById('recurring').checked;

  if (!desc)            { showToast('❌ Please enter a description'); return; }
  if (!amount || amount <= 0) { showToast('❌ Please enter a valid amount'); return; }
  if (!category)        { showToast('❌ Please select a category'); return; }
  if (!date)            { showToast('❌ Please select a date'); return; }

  transactions.unshift({ id: Date.now(), desc, amount, type, category, date, notes, recurring });
  saveData();
  renderAll();
  showToast('✅ Transaction added!');
  populateDescriptions();
  populateCategories();
  document.getElementById('amount').value    = '';
  document.getElementById('notes').value     = '';
  document.getElementById('recurring').checked = false;
}

// ── DELETE TRANSACTION ─────────────────────────────────────────
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveData();
  renderAll();
}

// ── EDIT TRANSACTION ──────────────────────────────────────────
function editTransaction(id) {
  const txn = transactions.find(t => t.id === id);
  if (!txn) return;
  document.getElementById('editId').value         = id;
  document.getElementById('editDesc').value        = txn.desc;
  document.getElementById('editAmount').value      = txn.amount;
  document.getElementById('editType').value        = txn.type;
  populateEditCategories();
  document.getElementById('editCategory').value   = txn.category;
  document.getElementById('editDate').value        = txn.date;
  document.getElementById('editNotes').value       = txn.notes || '';
  document.getElementById('editRecurring').checked = txn.recurring || false;
  document.getElementById('editModal').classList.add('active');
}

function saveEdit(e) {
  e.preventDefault();
  const id  = Number(document.getElementById('editId').value);
  const idx = transactions.findIndex(t => t.id === id);
  if (idx === -1) return;
  transactions[idx] = {
    id,
    desc:      document.getElementById('editDesc').value.trim(),
    amount:    parseFloat(document.getElementById('editAmount').value),
    type:      document.getElementById('editType').value,
    category:  document.getElementById('editCategory').value,
    date:      document.getElementById('editDate').value,
    notes:     document.getElementById('editNotes').value.trim(),
    recurring: document.getElementById('editRecurring').checked
  };
  saveData();
  renderAll();
  closeEditModal();
  showToast('✏️ Transaction updated!');
}

function closeEditModal(e) {
  if (e && e.target !== document.getElementById('editModal')) return;
  document.getElementById('editModal').classList.remove('active');
}

// ── SAVE ───────────────────────────────────────────────────────
function saveData() {
  localStorage.setItem('fin_transactions', JSON.stringify(transactions));
}

// ── RENDER ALL ─────────────────────────────────────────────────
function renderAll() {
  updateSummaryCards();
  renderHealthScore();
  renderDoughnut();
  renderBar();
  renderCategory();
  renderBalanceChart();
  renderSummaryTable();
  renderInsights();
  renderBudget();
  renderReminders();
  renderGoals();
  renderHistory();
}

// ── VIEW TOGGLE ────────────────────────────────────────────────
function switchView(view) {
  currentView = view;
  document.getElementById('btnMonthly').classList.toggle('active', view === 'monthly');
  document.getElementById('btnYearly').classList.toggle('active',  view === 'yearly');
  document.getElementById('summaryTitle').textContent  = view === 'monthly' ? '📆 Monthly Summary' : '📅 Yearly Summary';
  document.getElementById('periodHeader').textContent  = view === 'monthly' ? 'Month' : 'Year';
  renderSummaryTable();
}

function renderSummaryTable() {
  currentView === 'monthly' ? renderMonthlyTable() : renderYearlyTable();
}

// ── MONTHLY SUMMARY TABLE ──────────────────────────────────────
function renderMonthlyTable() {
  const tbody = document.getElementById('monthlyTableBody');
  const months = getLast6Months();

  const rows = months
    .map(m => {
      const inc = sumByMonth(m, 'income');
      const exp = sumByMonth(m, 'expense');
      const sav = inc - exp;
      const rate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
      return { label: m.label, inc, exp, sav, rate };
    })
    .filter(r => r.inc > 0 || r.exp > 0);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg" style="padding:20px">Add transactions to see monthly summary.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const savCls   = r.sav >= 0 ? 'pos' : 'neg';
    const savSign  = r.sav >= 0 ? '+₹' : '-₹';
    const rateCls  = r.rate >= 30 ? 'good' : r.rate >= 10 ? 'warn' : 'danger';
    return `<tr>
      <td><strong>${r.label}</strong></td>
      <td class="col-income">+₹${fmt(r.inc)}</td>
      <td class="col-expense">-₹${fmt(r.exp)}</td>
      <td class="col-savings ${savCls}">${savSign}${fmt(Math.abs(r.sav))}</td>
      <td><span class="rate-pill ${rateCls}">${r.rate}%</span></td>
    </tr>`;
  }).join('');
}

// ── YEARLY SUMMARY TABLE ───────────────────────────────────────
function renderYearlyTable() {
  const tbody = document.getElementById('monthlyTableBody');
  const years = [...new Set(transactions.map(t => t.date.slice(0, 4)))].sort();
  if (years.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-msg" style="padding:20px">Add transactions to see yearly summary.</td></tr>';
    return;
  }
  tbody.innerHTML = years.map(yr => {
    const inc  = transactions.filter(t => t.type === 'income'  && t.date.startsWith(yr)).reduce((s, t) => s + t.amount, 0);
    const exp  = transactions.filter(t => t.type === 'expense' && t.date.startsWith(yr)).reduce((s, t) => s + t.amount, 0);
    const sav  = inc - exp;
    const rate = inc > 0 ? Math.round(((inc - exp) / inc) * 100) : 0;
    const savCls  = sav >= 0 ? 'pos' : 'neg';
    const savSign = sav >= 0 ? '+₹' : '-₹';
    const rateCls = rate >= 30 ? 'good' : rate >= 10 ? 'warn' : 'danger';
    return `<tr>
      <td><strong>${yr}</strong></td>
      <td class="col-income">+₹${fmt(inc)}</td>
      <td class="col-expense">-₹${fmt(exp)}</td>
      <td class="col-savings ${savCls}">${savSign}${fmt(Math.abs(sav))}</td>
      <td><span class="rate-pill ${rateCls}">${rate}%</span></td>
    </tr>`;
  }).join('');
}

// ── COUNT-UP ANIMATION ─────────────────────────────────────────
function countUp(el, endVal, prefix = '', suffix = '', duration = 800) {
  const startTime = performance.now();
  const startVal  = 0;
  function step(now) {
    const elapsed  = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased    = 1 - Math.pow(1 - progress, 3);
    const current  = Math.round(startVal + (endVal - startVal) * eased);
    el.textContent = prefix + fmt(current) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── SUMMARY CARDS ──────────────────────────────────────────────
function updateSummaryCards() {
  const income  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const rate    = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;

  countUp(document.getElementById('totalIncome'),  income,             '₹', '');
  countUp(document.getElementById('totalExpense'), expense,            '₹', '');
  countUp(document.getElementById('netBalance'),   Math.abs(balance),  balance < 0 ? '-₹' : '₹', '');
  countUp(document.getElementById('savingsRate'),  rate,               '',  '%');

  const balEl = document.getElementById('netBalance');
  setTimeout(() => { balEl.style.color = balance >= 0 ? '#00c2a8' : '#ff6b6b'; }, 820);
}

// ── FINANCIAL HEALTH SCORE ─────────────────────────────────────
function renderHealthScore() {
  const income  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const rate    = income > 0 ? ((income - expense) / income) * 100 : 0;

  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const overCount = Object.entries(customBudgets).filter(([cat, limit]) => {
    const spent = transactions.filter(t => t.type === 'expense' && t.category === cat && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
    return spent > limit;
  }).length;
  const budgetCatCount = Object.keys(customBudgets).length;

  let score = 0;
  if (rate >= 30) score += 40; else if (rate >= 20) score += 30; else if (rate >= 10) score += 20; else if (rate > 0) score += 10;
  const adherence = budgetCatCount > 0 ? (budgetCatCount - overCount) / budgetCatCount : 1;
  score += Math.round(adherence * 30);
  if (income > 0) score += 15;
  if (transactions.length >= 20) score += 15; else if (transactions.length >= 10) score += 10; else if (transactions.length >= 5) score += 5;
  if (transactions.length === 0) score = 0;

  document.getElementById('healthScore').textContent = score;
  const fill = document.getElementById('healthFill');
  fill.style.width = score + '%';
  const tier = score >= 75 ? 'excellent' : score >= 50 ? 'good' : score >= 25 ? 'fair' : 'poor';
  fill.className = 'health-fill ' + tier;
  const msgs = { excellent:'🌟 Excellent Financial Health!', good:'👍 Good Financial Health', fair:'⚠️ Fair — Room to Improve', poor:'🔴 Poor — Take Action Now' };
  document.getElementById('healthLabel').textContent = transactions.length === 0 ? 'Add transactions to calculate your score' : msgs[tier];
}

// ── DOUGHNUT CHART ─────────────────────────────────────────────
function renderDoughnut() {
  const income  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const ctx = document.getElementById('doughnutChart').getContext('2d');

  if (doughnutChart) doughnutChart.destroy();

  if (income === 0 && expense === 0) {
    drawEmptyState(ctx, 'Add transactions to see chart');
    return;
  }

  const isLightDonut = document.documentElement.getAttribute('data-theme') === 'light';
  const donutTextClr = isLightDonut ? '#374151' : '#e2e8f0';

  doughnutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Income', 'Expense'],
      datasets: [{
        data: [income, expense],
        backgroundColor: ['#00d4aa', '#ff6b6b'],
        borderColor: ['#00a882', '#e84a4a'],
        borderWidth: 2,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: donutTextClr, padding: 16, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ' ₹' + fmt(ctx.parsed) } }
      }
    }
  });
}

// ── BAR CHART (monthly) ────────────────────────────────────────
function renderBar() {
  const months = getLast6Months();
  const incomeData  = months.map(m => sumByMonth(m, 'income'));
  const expenseData = months.map(m => sumByMonth(m, 'expense'));

  const ctx = document.getElementById('barChart').getContext('2d');
  if (barChart) barChart.destroy();

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textClr = isLight ? '#374151' : '#e2e8f0';
  const mutedClr = isLight ? '#6b7280' : '#8892a4';
  const gridClr = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        { label: 'Income',  data: incomeData,  backgroundColor: 'rgba(0,212,170,0.72)',  borderColor: '#00d4aa', borderWidth: 1.5, borderRadius: 6 },
        { label: 'Expense', data: expenseData, backgroundColor: 'rgba(255,107,107,0.72)', borderColor: '#ff6b6b', borderWidth: 1.5, borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: textClr, padding: 14, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ' ₹' + fmt(ctx.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: mutedClr }, grid: { color: gridClr } },
        y: { ticks: { color: mutedClr, callback: v => '₹' + v }, grid: { color: gridClr }, beginAtZero: true }
      }
    }
  });
}

// ── CATEGORY PIE CHART ─────────────────────────────────────────
function renderCategory() {
  const expTxns = transactions.filter(t => t.type === 'expense');
  const catMap  = {};
  expTxns.forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });

  const labels = Object.keys(catMap);
  const data   = Object.values(catMap);

  const ctx = document.getElementById('categoryChart').getContext('2d');
  if (categoryChart) categoryChart.destroy();

  if (labels.length === 0) {
    drawEmptyState(ctx, 'No expense data yet');
    return;
  }

  const COLORS = ['#00c2a8','#38bdf8','#fbbf24','#34d399','#ff6b6b','#60a5fa','#f472b6','#a3e635','#2dd4bf'];

  const isLightPie = document.documentElement.getAttribute('data-theme') === 'light';
  const pieTextClr = isLightPie ? '#374151' : '#e2e8f0';
  const pieBorder  = isLightPie ? '#f0f4ff' : '#1a1a2e';

  categoryChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: COLORS.slice(0, labels.length),
        borderColor: pieBorder,
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: pieTextClr, padding: 10, font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ' ₹' + fmt(ctx.parsed) } }
      }
    }
  });
}

// ── BALANCE TREND LINE CHART ───────────────────────────────────
function renderBalanceChart() {
  const ctx = document.getElementById('balanceChart').getContext('2d');
  if (balanceChart) balanceChart.destroy();
  if (transactions.length === 0) { drawEmptyState(ctx, 'No data yet'); return; }

  const sorted  = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  let running   = 0;
  const labels  = [];
  const data    = [];
  sorted.forEach(t => {
    running += t.type === 'income' ? t.amount : -t.amount;
    labels.push(new Date(t.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }));
    data.push(running);
  });

  const isLight  = document.documentElement.getAttribute('data-theme') === 'light';
  const textClr  = isLight ? '#374151' : '#e2e8f0';
  const mutedClr = isLight ? '#6b7280' : '#8892a4';
  const gridClr  = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';

  balanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Balance',
        data,
        borderColor: '#00c2a8',
        backgroundColor: 'rgba(0,194,168,0.12)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: data.length > 30 ? 0 : 4,
        pointBackgroundColor: '#00c2a8'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ' ₹' + fmt(ctx.parsed.y) } }
      },
      scales: {
        x: { ticks: { color: mutedClr, maxTicksLimit: 6, maxRotation: 0 }, grid: { color: gridClr } },
        y: { ticks: { color: mutedClr, callback: v => '₹' + v }, grid: { color: gridClr } }
      }
    }
  });
}

// ── SMART INSIGHTS (AI-style rule-based analysis) ─────────────
function renderInsights() {
  const grid = document.getElementById('insightsGrid');
  const tips = [];

  const income  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const rate    = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;

  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pm  = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

  const thisMonthExp  = transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
  const lastMonthExp  = transactions.filter(t => t.type === 'expense' && t.date.startsWith(pm)).reduce((s, t) => s + t.amount, 0);

  if (transactions.length === 0) {
    grid.innerHTML = '<p class="empty-msg">Add transactions to see AI-powered insights.</p>';
    return;
  }

  // 1. Savings rate insight
  if (rate >= 30) {
    tips.push({ cls: 'good', emoji: '🌟', label: 'Savings Rate', text: `Excellent! You're saving ${rate}% of your income. Keep it up!` });
  } else if (rate >= 10) {
    tips.push({ cls: 'warn', emoji: '💡', label: 'Savings Rate', text: `You're saving ${rate}% of income. Try to reach 30% for financial stability.` });
  } else if (income > 0) {
    tips.push({ cls: 'danger', emoji: '⚠️', label: 'Savings Rate', text: `Only ${rate}% savings rate. Your expenses are too close to your income.` });
  }

  // 2. Spending trend vs last month
  if (lastMonthExp > 0 && thisMonthExp > 0) {
    const diff = Math.round(((thisMonthExp - lastMonthExp) / lastMonthExp) * 100);
    if (diff > 20) {
      tips.push({ cls: 'danger', emoji: '📈', label: 'Spending Trend', text: `This month's spending is ${diff}% higher than last month. Review your expenses.` });
    } else if (diff < -10) {
      tips.push({ cls: 'good', emoji: '📉', label: 'Spending Trend', text: `Great! You spent ${Math.abs(diff)}% less than last month. Excellent control!` });
    } else {
      tips.push({ cls: 'info', emoji: '📊', label: 'Spending Trend', text: `Spending is consistent with last month (${diff > 0 ? '+' : ''}${diff}% change).` });
    }
  }

  // 3. Top expense category this month
  const catMap = {};
  transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym))
    .forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const icon = CATEGORY_ICONS[topCat[0]] || '📦';
    tips.push({ cls: 'info', emoji: icon, label: 'Top Expense', text: `${topCat[0]} is your biggest expense this month — ₹${fmt(topCat[1])}.` });
  }

  // 4. Budget warnings
  const overBudget = Object.entries(customBudgets).filter(([cat, limit]) => {
    const spent = transactions.filter(t => t.type === 'expense' && t.category === cat && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
    return spent >= limit * 0.9;
  });
  if (overBudget.length > 0) {
    tips.push({ cls: 'danger', emoji: '🚨', label: 'Budget Alert', text: `${overBudget.map(([c]) => c).join(', ')} ${overBudget.length === 1 ? 'is' : 'are'} near or over budget this month!` });
  } else if (thisMonthExp > 0) {
    tips.push({ cls: 'good', emoji: '✅', label: 'Budget Status', text: `All categories within budget this month. Great discipline!` });
  }

  // 5. Balance health
  if (balance < 0) {
    tips.push({ cls: 'danger', emoji: '🔴', label: 'Balance Alert', text: `You're ₹${fmt(Math.abs(balance))} in deficit. Cut non-essential spending immediately.` });
  } else if (income === 0) {
    tips.push({ cls: 'warn', emoji: '💰', label: 'No Income', text: `No income recorded yet. Add your income transactions to get full insights.` });
  }

  // 6. Month-end spending prediction
  const dayOfMonth  = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft    = daysInMonth - dayOfMonth;
  if (thisMonthExp > 0 && dayOfMonth >= 3) {
    const dailyAvg    = thisMonthExp / dayOfMonth;
    const projected   = Math.round(dailyAvg * daysInMonth);
    const thisMonthInc = transactions.filter(t => t.type === 'income' && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
    const projCls = projected > thisMonthInc ? 'danger' : projected > thisMonthInc * 0.8 ? 'warn' : 'good';
    const projEmoji = projected > thisMonthInc ? '⚠️' : '🔮';
    tips.push({ cls: projCls, emoji: projEmoji, label: 'Month-end Forecast', text: `At current pace, projected spending is ₹${fmt(projected)} by month-end (${daysLeft}d left). Daily avg: ₹${fmt(Math.round(dailyAvg))}.` });
  }

  // 7. 50/30/20 Rule Analysis
  if (income > 0 && expense > 0) {
    const NEEDS_CATS = ['Rent', 'Food', 'Health', 'Bills & Utilities', 'Education'];
    const WANTS_CATS = ['Entertainment', 'Shopping', 'Transport', 'Other'];
    const needsAmt = transactions.filter(t => t.type === 'expense' && NEEDS_CATS.includes(t.category)).reduce((s, t) => s + t.amount, 0);
    const wantsAmt = transactions.filter(t => t.type === 'expense' && WANTS_CATS.includes(t.category)).reduce((s, t) => s + t.amount, 0);
    const needsPct = Math.round((needsAmt / income) * 100);
    const wantsPct = Math.round((wantsAmt / income) * 100);
    const rule_cls = rate >= 20 && needsPct <= 50 ? 'good' : rate >= 10 ? 'warn' : 'danger';
    tips.push({ cls: rule_cls, emoji: '⚖️', label: 'Smart Budget Analyzer', text: `Needs: ${needsPct}% (ideal ≤50%) · Wants: ${wantsPct}% (ideal ≤30%) · Savings: ${rate}% (ideal ≥20%). ${rate >= 20 && needsPct <= 50 ? 'On track!' : 'Adjust spending mix.'}` });
  }

  // 8. Next Month Spending Prediction (3-month rolling average)
  const last3Exp = [1, 2, 3].map(i => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return transactions.filter(t => t.type === 'expense' && t.date.startsWith(key)).reduce((s, t) => s + t.amount, 0);
  }).filter(v => v > 0);
  if (last3Exp.length >= 2) {
    const predicted = Math.round(last3Exp.reduce((s, v) => s + v, 0) / last3Exp.length);
    const predCls   = predicted > income ? 'danger' : predicted > income * 0.8 ? 'warn' : 'good';
    tips.push({ cls: predCls, emoji: '🤖', label: 'AI Prediction', text: `Based on your last ${last3Exp.length}-month average, predicted next month expense: ₹${fmt(predicted)}. ${predicted > income ? 'Exceeds income — take action.' : 'Looks manageable!'}` });
  }

  if (tips.length === 0) {
    grid.innerHTML = '<p class="empty-msg">Add more transactions to generate insights.</p>';
    return;
  }

  grid.innerHTML = tips.map(t => `
    <div class="insight-card ${t.cls}">
      <span class="insight-emoji">${t.emoji}</span>
      <div class="insight-text"><strong>${t.label}</strong>${t.text}</div>
    </div>`).join('');
}

// ── BUDGET GOALS ───────────────────────────────────────────────
function renderBudget() {
  const grid = document.getElementById('budgetGrid');
  const now  = new Date();
  const ym   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  grid.innerHTML = Object.keys(customBudgets).map(cat => {
    const spent = transactions.filter(t => t.type === 'expense' && t.category === cat && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
    const limit  = customBudgets[cat];
    const pct    = Math.min(Math.round((spent / limit) * 100), 100);
    const cls    = pct >= 90 ? 'progress-danger' : pct >= 70 ? 'progress-warn' : 'progress-safe';
    const icon   = CATEGORY_ICONS[cat] || '📦';
    return `
      <div class="budget-item">
        <div class="budget-label">
          <span>${icon} ${cat}</span>
          <span class="editable-limit" onclick="editBudgetLimit('${cat}')" title="Click to edit">₹${fmt(spent)} / ₹${fmt(limit)} ✏️</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${cls}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

// ── EDITABLE BUDGET LIMIT ──────────────────────────────────────
function editBudgetLimit(cat) {
  const current = customBudgets[cat];
  const newVal  = prompt(`Set monthly budget for "${cat}" (current: ₹${fmt(current)}):`, current);
  if (newVal === null) return;
  const parsed = parseFloat(newVal);
  if (isNaN(parsed) || parsed <= 0) { showToast('❌ Invalid amount'); return; }
  customBudgets[cat] = parsed;
  localStorage.setItem('fin_budget_limits', JSON.stringify(customBudgets));
  renderBudget();
  renderInsights();
  renderHealthScore();
  showToast(`✅ Budget for ${cat} set to ₹${fmt(parsed)}`);
}

// ── DATE PRESET FILTER ────────────────────────────────────────
function setDatePreset(preset, btn) {
  activeDatePreset = preset;
  document.querySelectorAll('.date-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('customDateRow').style.display = preset === 'custom' ? 'flex' : 'none';
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  if (preset === 'all')       { activeDateFrom = null; activeDateTo = null; }
  else if (preset === 'today')     { activeDateFrom = today; activeDateTo = today; }
  else if (preset === 'week')      { const d = new Date(now); d.setDate(d.getDate()-6); activeDateFrom = d.toISOString().slice(0,10); activeDateTo = today; }
  else if (preset === 'month')     { activeDateFrom = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`; activeDateTo = today; }
  else if (preset === 'lastmonth') { const pm = new Date(now.getFullYear(), now.getMonth()-1, 1); const ld = new Date(now.getFullYear(), now.getMonth(), 0); activeDateFrom = pm.toISOString().slice(0,10); activeDateTo = ld.toISOString().slice(0,10); }
  else if (preset === 'custom')    { activeDateFrom = document.getElementById('dateFrom').value || null; activeDateTo = document.getElementById('dateTo').value || null; }
  renderHistory();
}

// ── TRANSACTION HISTORY ────────────────────────────────────────
function renderHistory() {
  const list       = document.getElementById('historyList');
  const search     = document.getElementById('searchInput').value.toLowerCase();
  const filterType = document.getElementById('filterType').value;

  if (activeDatePreset === 'custom') {
    activeDateFrom = document.getElementById('dateFrom').value || null;
    activeDateTo   = document.getElementById('dateTo').value   || null;
  }

  const sortOrder = document.getElementById('sortOrder') ? document.getElementById('sortOrder').value : 'newest';

  let filtered = [...transactions];
  if (filterType !== 'all') filtered = filtered.filter(t => t.type === filterType);
  if (search)        filtered = filtered.filter(t => t.desc.toLowerCase().includes(search) || t.category.toLowerCase().includes(search));
  if (activeDateFrom) filtered = filtered.filter(t => t.date >= activeDateFrom);
  if (activeDateTo)   filtered = filtered.filter(t => t.date <= activeDateTo);

  if (sortOrder === 'oldest')  filtered.sort((a, b) => a.date.localeCompare(b.date));
  else if (sortOrder === 'highest') filtered.sort((a, b) => b.amount - a.amount);
  else if (sortOrder === 'lowest')  filtered.sort((a, b) => a.amount - b.amount);
  else filtered.sort((a, b) => b.date.localeCompare(a.date)); // newest default

  if (filtered.length === 0) {
    list.innerHTML = '<p class="empty-msg">No transactions found.</p>';
    document.querySelector('.history-header h3').textContent = '📋 Transaction History (0)';
    return;
  }

  document.querySelector('.history-header h3').textContent = `📋 Transaction History (${filtered.length})`;

  list.innerHTML = filtered.map(t => {
    const icon       = CATEGORY_ICONS[t.category] || (t.type === 'income' ? '💵' : '💸');
    const sign       = t.type === 'income' ? '+' : '-';
    const dateStr    = new Date(t.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    const recurBadge = t.recurring ? '<span class="recur-badge">🔁</span>' : '';
    const notesTip   = t.notes    ? `<div class="txn-notes">${escapeHtml(t.notes)}</div>` : '';
    return `
      <div class="txn-item">
        <span class="txn-icon">${icon}</span>
        <div class="txn-info">
          <div class="txn-desc">${escapeHtml(t.desc)} ${recurBadge}</div>
          <div class="txn-meta">${t.category} &bull; ${dateStr}</div>
          ${notesTip}
        </div>
        <span class="txn-amount ${t.type}">${sign}₹${fmt(t.amount)}</span>
        <button class="txn-edit"   onclick="editTransaction(${t.id})"   title="Edit">✏️</button>
        <button class="txn-delete" onclick="deleteTransaction(${t.id})" title="Delete">🗑️</button>
      </div>`;
  }).join('');
}

// ── EXPORT CSV ─────────────────────────────────────────────────
function exportCSV() {
  if (transactions.length === 0) { alert('No transactions to export!'); return; }
  const headers = ['Date','Description','Type','Category','Amount (₹)','Notes','Recurring'];
  const rows    = transactions.map(t => [t.date, t.desc, t.type, t.category, t.amount, t.notes || '', t.recurring ? 'yes' : 'no']);
  const csv     = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(csv, `finance_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
}

// ── IMPORT CSV ─────────────────────────────────────────────────
function triggerImport() { document.getElementById('importFile').click(); }

function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines   = e.target.result.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim().toLowerCase());
    const imported = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const obj  = {};
      headers.forEach((h, idx) => { obj[h] = (cols[idx] || '').replace(/^"|"$/g,'').trim(); });
      const amount = parseFloat(obj['amount (₹)'] || obj['amount']);
      if (!obj['date'] || !obj['description'] || !obj['type'] || isNaN(amount)) continue;
      imported.push({
        id:        Date.now() + i,
        date:      obj['date'],
        desc:      obj['description'],
        type:      obj['type'].toLowerCase().includes('income') ? 'income' : 'expense',
        category:  obj['category'] || 'Other',
        amount,
        notes:     obj['notes'] || '',
        recurring: obj['recurring'] === 'yes'
      });
    }
    if (imported.length === 0) { showToast('❌ No valid rows found in CSV'); return; }
    transactions = [...imported, ...transactions];
    saveData();
    renderAll();
    showToast(`📤 Imported ${imported.length} transactions!`);
  };
  reader.readAsText(file);
  event.target.value = '';
}

function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; }
    else if (line[i] === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += line[i]; }
  }
  result.push(cur);
  return result;
}

// ── PRINT REPORT ───────────────────────────────────────────────
function printReport() { window.print(); }

// ── SAVINGS GOALS ──────────────────────────────────────────────
function toggleGoalForm() {
  const f = document.getElementById('goalForm');
  f.style.display = f.style.display === 'none' ? 'flex' : 'none';
}

function addGoal() {
  const name     = document.getElementById('goalName').value.trim();
  const target   = parseFloat(document.getElementById('goalTarget').value);
  const deadline = document.getElementById('goalDeadline').value;
  if (!name || isNaN(target) || target <= 0) { showToast('❌ Fill goal name and target amount'); return; }
  goals.push({ id: Date.now(), name, target, deadline, createdAt: new Date().toISOString().slice(0,10) });
  localStorage.setItem('fin_goals', JSON.stringify(goals));
  document.getElementById('goalName').value    = '';
  document.getElementById('goalTarget').value  = '';
  toggleGoalForm();
  renderGoals();
  showToast('🎯 Goal added!');
}

function deleteGoal(id) {
  goals = goals.filter(g => g.id !== id);
  localStorage.setItem('fin_goals', JSON.stringify(goals));
  renderGoals();
}

function renderGoals() {
  const list = document.getElementById('goalsList');
  if (goals.length === 0) {
    list.innerHTML = '<p class="empty-msg">No goals set. Add a savings goal to track your progress!</p>';
    return;
  }

  // Current net balance = total income - total expenses
  const totalIncome  = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netBalance   = Math.max(0, totalIncome - totalExpense);

  // Distribute balance across goals proportionally by target
  const totalTargets = goals.reduce((s, g) => s + g.target, 0);

  list.innerHTML = goals.map(g => {
    const share    = totalTargets > 0 ? (g.target / totalTargets) : 1 / goals.length;
    const saved    = Math.min(Math.round(netBalance * share), g.target);
    const pct      = Math.min(Math.round((saved / g.target) * 100), 100);
    const isDone   = pct >= 100;

    // Deadline info
    let deadlineTxt = '';
    let badge = '';
    if (g.deadline) {
      const today    = new Date();
      const dline    = new Date(g.deadline);
      const daysLeft = Math.ceil((dline - today) / 86400000);
      if (isDone) {
        badge = '<span class="goal-badge achieved">✅ Achieved!</span>';
      } else if (daysLeft < 0) {
        badge = '<span class="goal-badge behind">⏰ Overdue</span>';
      } else {
        // Are we on track? Need to save (target - saved) in daysLeft days
        const dailySavingsNeeded = (g.target - saved) / daysLeft;
        // Current daily savings rate from net balance growth (rough: netBalance / days since creation)
        const daysSinceCreation = Math.max(1, Math.ceil((today - new Date(g.createdAt)) / 86400000));
        const dailySavingsRate  = netBalance / daysSinceCreation;
        badge = dailySavingsRate >= dailySavingsNeeded
          ? '<span class="goal-badge on-track">🟢 On Track</span>'
          : '<span class="goal-badge behind">🟡 Behind</span>';
        deadlineTxt = `Deadline: ${new Date(g.deadline).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})} · ${daysLeft}d left`;
      }
    } else {
      badge = isDone ? '<span class="goal-badge achieved">✅ Achieved!</span>' : '';
    }

    const remaining = g.target - saved;

    return `
      <div class="goal-item${isDone ? ' completed' : ''}">
        <div class="goal-top">
          <div>
            <div class="goal-name">🎯 ${escapeHtml(g.name)}</div>
            ${deadlineTxt ? `<div class="goal-meta">${deadlineTxt}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            ${badge}
            <div class="goal-amounts">
              <span class="goal-saved">₹${fmt(saved)}</span>
              <span class="goal-target"> / ₹${fmt(g.target)}</span>
            </div>
            <button class="goal-delete" onclick="deleteGoal(${g.id})" title="Delete">🗑️</button>
          </div>
        </div>
        <div class="goal-bar">
          <div class="goal-fill${isDone ? ' complete' : ''}" style="width:${pct}%"></div>
        </div>
        <div class="goal-bottom">
          <span>${isDone ? '🎉 Goal achieved!' : `₹${fmt(remaining)} more to go`}</span>
          <span class="goal-pct">${pct}%</span>
        </div>
      </div>`;
  }).join('');
}

// ── BILL REMINDERS ─────────────────────────────────────────────
function toggleReminderForm() {
  const f = document.getElementById('reminderForm');
  f.style.display = f.style.display === 'none' ? 'flex' : 'none';
}

function handleReminderTitleSelect(sel) {
  const custom = document.getElementById('reminderTitleCustom');
  if (sel.value === '__custom__') {
    custom.style.display = 'block';
    custom.focus();
  } else {
    custom.style.display = 'none';
  }
}

function addReminder() {
  const sel    = document.getElementById('reminderTitle');
  const custom = document.getElementById('reminderTitleCustom');
  const title  = sel.value === '__custom__' ? custom.value.trim() : sel.value.trim();
  const amount = parseFloat(document.getElementById('reminderAmount').value);
  const date   = document.getElementById('reminderDate').value;
  if (!title || title === '' || !date) { showToast('❌ Fill title and date'); return; }
  reminders.push({ id: Date.now(), title, amount: isNaN(amount) ? 0 : amount, date, done: false });
  localStorage.setItem('fin_reminders', JSON.stringify(reminders));
  sel.value = '';
  custom.value = '';
  custom.style.display = 'none';
  document.getElementById('reminderAmount').value = '';
  renderReminders();
  showToast('🔔 Reminder added!');
}

function deleteReminder(id) {
  reminders = reminders.filter(r => r.id !== id);
  localStorage.setItem('fin_reminders', JSON.stringify(reminders));
  renderReminders();
}

function markReminderDone(id) {
  const r = reminders.find(r => r.id === id);
  if (r) { r.done = !r.done; localStorage.setItem('fin_reminders', JSON.stringify(reminders)); renderReminders(); }
}

function renderReminders() {
  const list = document.getElementById('remindersList');
  if (reminders.length === 0) { list.innerHTML = '<p class="empty-msg">No reminders set. Add upcoming bills!</p>'; return; }
  const today  = new Date().toISOString().slice(0, 10);
  const sorted = [...reminders].sort((a, b) => a.date.localeCompare(b.date));
  list.innerHTML = sorted.map(r => {
    const daysLeft = Math.ceil((new Date(r.date) - new Date(today)) / 86400000);
    const urgency  = r.done ? 'done' : daysLeft < 0 ? 'overdue' : daysLeft <= 3 ? 'urgent' : 'upcoming';
    const label    = r.done ? 'Done' : daysLeft < 0 ? 'Overdue' : daysLeft === 0 ? 'Today!' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft}d left`;
    return `
      <div class="reminder-item ${urgency}">
        <input type="checkbox" ${r.done ? 'checked' : ''} onchange="markReminderDone(${r.id})" />
        <div class="reminder-info">
          <div class="reminder-title">${escapeHtml(r.title)}</div>
          <div class="reminder-meta">${r.date}${r.amount ? ' · ₹' + fmt(r.amount) : ''}</div>
        </div>
        <span class="reminder-badge ${urgency}">${label}</span>
        <button class="txn-delete" onclick="deleteReminder(${r.id})">🗑️</button>
      </div>`;
  }).join('');
}

function checkReminders() {
  if (!('Notification' in window)) return;
  const today = new Date().toISOString().slice(0, 10);
  const due   = reminders.filter(r => !r.done && r.date <= today);
  if (due.length === 0) return;
  if (Notification.permission === 'granted') {
    due.forEach(r => new Notification(`💰 Bill Due: ${r.title}`, { body: r.amount ? `₹${fmt(r.amount)} due` : 'Due today!' }));
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') due.forEach(r => new Notification(`💰 Bill Due: ${r.title}`, { body: r.amount ? `₹${fmt(r.amount)} due` : 'Due today!' }));
    });
  }
}

// ── CUSTOM CATEGORIES ──────────────────────────────────────────
function openCategoryModal() {
  renderCategoryModal();
  document.getElementById('categoryModal').classList.add('active');
}

function closeCategoryModal(e) {
  if (e && e.target !== document.getElementById('categoryModal')) return;
  document.getElementById('categoryModal').classList.remove('active');
}

function renderCategoryModal() {
  document.getElementById('incomeCatList').innerHTML = customCats.income.map(c => `
    <div class="cat-tag">${CATEGORY_ICONS[c] || '📦'} ${c}
      ${DEFAULT_CATEGORIES.income.includes(c) ? '' : `<button onclick="removeCategory('income','${escapeHtml(c)}')" class="cat-remove">✕</button>`}
    </div>`).join('');
  document.getElementById('expenseCatList').innerHTML = customCats.expense.map(c => `
    <div class="cat-tag">${CATEGORY_ICONS[c] || '📦'} ${c}
      ${DEFAULT_CATEGORIES.expense.includes(c) ? '' : `<button onclick="removeCategory('expense','${escapeHtml(c)}')" class="cat-remove">✕</button>`}
    </div>`).join('');
}

function addCategory(type) {
  const input = document.getElementById(type === 'income' ? 'newIncomeCat' : 'newExpenseCat');
  const val   = input.value.trim();
  if (!val) return;
  if (customCats[type].includes(val)) { showToast('Category already exists'); return; }
  customCats[type].push(val);
  localStorage.setItem('fin_categories', JSON.stringify(customCats));
  input.value = '';
  renderCategoryModal();
  populateCategories();
  showToast(`✅ "${val}" added`);
}

function removeCategory(type, cat) {
  customCats[type] = customCats[type].filter(c => c !== cat);
  localStorage.setItem('fin_categories', JSON.stringify(customCats));
  renderCategoryModal();
  populateCategories();
  showToast(`🗑️ "${cat}" removed`);
}

// ── LOAD SAMPLE DATA ──────────────────────────────────────────
function loadSampleData() {
  if (transactions.length > 0) {
    if (!confirm('This will replace your current data with sample data. Continue?')) return;
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const pm = now.getMonth() === 0 ? '12' : String(now.getMonth()).padStart(2, '0');
  const py = now.getMonth() === 0 ? y - 1 : y;

  transactions = [
    { id: 1,  desc: 'Monthly Salary',       amount: 55000, type: 'income',  category: 'Salary',            date: `${y}-${m}-01`,  notes: 'Regular monthly salary',  recurring: true  },
    { id: 2,  desc: 'Freelance Project',     amount: 12000, type: 'income',  category: 'Freelance',         date: `${y}-${m}-05`,  notes: 'Website design project',  recurring: false },
    { id: 3,  desc: 'Apartment Rent',        amount: 14000, type: 'expense', category: 'Rent',              date: `${y}-${m}-02`,  notes: 'Monthly rent payment',    recurring: true  },
    { id: 4,  desc: 'Grocery Shopping',      amount: 4500,  type: 'expense', category: 'Food',              date: `${y}-${m}-07`,  notes: 'Big Bazaar weekly shop',  recurring: false },
    { id: 5,  desc: 'Netflix & Spotify',     amount: 1200,  type: 'expense', category: 'Entertainment',     date: `${y}-${m}-03`,  notes: 'Streaming subscriptions', recurring: true  },
    { id: 6,  desc: 'Electricity Bill',      amount: 2800,  type: 'expense', category: 'Bills & Utilities', date: `${y}-${m}-10`,  notes: '',                        recurring: false },
    { id: 7,  desc: 'Uber Rides',            amount: 1800,  type: 'expense', category: 'Transport',         date: `${y}-${m}-12`,  notes: '',                        recurring: false },
    { id: 8,  desc: 'Online Course',         amount: 3500,  type: 'expense', category: 'Education',         date: `${y}-${m}-08`,  notes: 'Udemy React course',      recurring: false },
    { id: 9,  desc: 'Medicines',             amount: 900,   type: 'expense', category: 'Health',            date: `${y}-${m}-09`,  notes: '',                        recurring: false },
    { id: 10, desc: 'Clothes Shopping',      amount: 4200,  type: 'expense', category: 'Shopping',          date: `${y}-${m}-11`,  notes: 'Myntra sale',             recurring: false },
    { id: 11, desc: 'Last Month Salary',     amount: 55000, type: 'income',  category: 'Salary',            date: `${py}-${pm}-01`, notes: '',                       recurring: true  },
    { id: 12, desc: 'Last Month Groceries',  amount: 3800,  type: 'expense', category: 'Food',              date: `${py}-${pm}-08`, notes: '',                       recurring: false },
    { id: 13, desc: 'Last Month Rent',       amount: 14000, type: 'expense', category: 'Rent',              date: `${py}-${pm}-02`, notes: '',                       recurring: true  },
    { id: 14, desc: 'Last Month Transport',  amount: 1200,  type: 'expense', category: 'Transport',         date: `${py}-${pm}-15`, notes: '',                       recurring: false },
  ].reverse();

  // Sample goals
  const futureDate = d => { const x = new Date(); x.setMonth(x.getMonth() + d); return x.toISOString().slice(0,10); };
  const today = new Date().toISOString().slice(0,10);
  goals = [
    { id: Date.now()+1, name: 'Emergency Fund',  target: 100000, deadline: futureDate(6),  createdAt: today },
    { id: Date.now()+2, name: 'New Laptop',       target: 80000,  deadline: futureDate(4),  createdAt: today },
    { id: Date.now()+3, name: 'Goa Trip',         target: 30000,  deadline: futureDate(3),  createdAt: today },
  ];
  localStorage.setItem('fin_goals', JSON.stringify(goals));

  saveData();
  renderAll();
  showToast('✨ Sample data loaded!');
}

// ── THEME TOGGLE ───────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('fin_theme', newTheme);
  document.getElementById('themeBtn').textContent = isDark ? '☀️ Light' : '🌙 Dark';

  // Redraw charts for correct text color in new theme
  setTimeout(renderAll, 100);
}

// ── EMI CALCULATOR ────────────────────────────────────────────
function openEmiModal() {
  document.getElementById('emiModal').classList.add('active');
}

function closeEmiModal(e) {
  if (e && e.target !== document.getElementById('emiModal')) return;
  document.getElementById('emiModal').classList.remove('active');
}

function calcEmi() {
  const P = parseFloat(document.getElementById('emiLoan').value);
  const annualRate = parseFloat(document.getElementById('emiRate').value);
  const n = parseInt(document.getElementById('emiTenure').value);
  const result = document.getElementById('emiResult');
  if (!P || !annualRate || !n || P <= 0 || annualRate <= 0 || n <= 0) {
    result.style.display = 'none'; return;
  }
  const r = annualRate / 12 / 100;
  const emi = Math.round(P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
  const total = emi * n;
  const interest = total - P;
  document.getElementById('emiMonthly').textContent  = '₹' + fmt(emi);
  document.getElementById('emiTotal').textContent    = '₹' + fmt(total);
  document.getElementById('emiInterest').textContent = '₹' + fmt(interest);
  result.style.display = 'block';
}

// ── CLEAR ALL ─────────────────────────────────────────────────
function clearAll() {
  if (transactions.length === 0) return;
  if (!confirm('Delete ALL transactions? This cannot be undone.')) return;
  transactions = [];
  saveData();
  renderAll();
}

// ── TOAST ──────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── HELPERS ────────────────────────────────────────────────────
function fmt(n) {
  return Number(n).toLocaleString('en-IN');
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function getLast6Months() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key:   `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label: d.toLocaleString('en-IN', { month: 'short', year: '2-digit' })
    });
  }
  return months;
}

function sumByMonth(month, type) {
  return transactions
    .filter(t => t.type === type && t.date.startsWith(month.key))
    .reduce((s, t) => s + t.amount, 0);
}

function drawEmptyState(ctx, msg) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#8892a4';
  ctx.font = '13px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(msg, ctx.canvas.width / 2, ctx.canvas.height / 2);
}
