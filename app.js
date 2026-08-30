const STORAGE_KEY = 'monthly-budget-app-v1';
const defaultCategories = [
  { id: 'housing', name: 'Housing', budget: 1200 },
  { id: 'food', name: 'Food', budget: 500 },
  { id: 'transport', name: 'Transport', budget: 220 },
  { id: 'car-payment', name: 'Car Payment', budget: 420 },
  { id: 'car-insurance', name: 'Car Insurance', budget: 140 },
  { id: 'utilities', name: 'Utilities', budget: 260 },
  { id: 'health', name: 'Health', budget: 180 },
  { id: 'entertainment', name: 'Entertainment', budget: 180 },
  { id: 'savings', name: 'Savings', budget: 400 },
  { id: 'misc', name: 'Miscellaneous', budget: 200 }
];

const defaultState = {
  income: 3500,
  balance: 0,
  expenses: [
    { id: 1, description: 'Rent', category: 'housing', amount: 1200, date: todayISO() },
    { id: 2, description: 'Groceries', category: 'food', amount: 180, date: todayISO() },
    { id: 3, description: 'Fuel', category: 'transport', amount: 65, date: todayISO() }
  ],
  categories: defaultCategories,
  bills: []
};

const supabaseConfig = window.BUDGET_SUPABASE_CONFIG || {};
let supabaseClient = null;
try {
  if (
    supabaseConfig.url &&
    supabaseConfig.anonKey &&
    supabaseConfig.url !== 'https://YOUR-PROJECT-ID.supabase.co' &&
    supabaseConfig.anonKey !== 'YOUR_SUPABASE_ANON_KEY' &&
    window.supabase
  ) {
    supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  }
} catch (error) {
  console.warn('Supabase client failed to initialize, continuing without sync.', error);
  supabaseClient = null;
}

let state = cloneData(defaultState);

const elements = {
  monthlyIncomeInput: document.querySelector('#monthlyIncomeInput'),
  saveIncomeBtn: document.querySelector('#saveIncomeBtn'),
  budgetedValue: document.querySelector('#budgetedValue'),
  spentValue: document.querySelector('#spentValue'),
  leftValue: document.querySelector('#leftValue'),
  categorySelect: document.querySelector('#categorySelect'),
  expenseForm: document.querySelector('#expenseForm'),
  expenseNameInput: document.querySelector('#expenseNameInput'),
  expenseAmountInput: document.querySelector('#expenseAmountInput'),
  expenseDateInput: document.querySelector('#expenseDateInput'),
  categoryList: document.querySelector('#categoryList'),
  expenseList: document.querySelector('#expenseList'),
  resetDataBtn: document.querySelector('#resetDataBtn'),
  statusStamp: document.querySelector('#statusStamp'),
  balanceInput: document.querySelector('#balanceInput'),
  saveBalanceBtn: document.querySelector('#saveBalanceBtn'),
  freeToSpendValue: document.querySelector('#freeToSpendValue'),
  billForm: document.querySelector('#billForm'),
  billNameInput: document.querySelector('#billNameInput'),
  billAmountInput: document.querySelector('#billAmountInput'),
  billDueDateInput: document.querySelector('#billDueDateInput'),
  billRecurringInput: document.querySelector('#billRecurringInput'),
  billList: document.querySelector('#billList'),
  affordForm: document.querySelector('#affordForm'),
  affordDescriptionInput: document.querySelector('#affordDescriptionInput'),
  affordAmountInput: document.querySelector('#affordAmountInput'),
  affordCategorySelect: document.querySelector('#affordCategorySelect'),
  affordResult: document.querySelector('#affordResult')
};

initialize();

async function initialize() {
  const defaultDate = todayISO();

  try {
    state = await loadState();
  } catch (error) {
    console.warn('State load failed entirely, using defaults.', error);
    state = cloneData(defaultState);
  }

  state = normalizeState(state);

  elements.expenseDateInput.value = defaultDate;
  elements.billDueDateInput.value = defaultDate;
  elements.monthlyIncomeInput.value = state.income;
  elements.expenseForm.addEventListener('submit', handleExpenseSubmit);
  elements.saveIncomeBtn.addEventListener('click', saveIncome);
  elements.resetDataBtn.addEventListener('click', resetAll);
  elements.saveBalanceBtn.addEventListener('click', saveBalance);
  elements.billForm.addEventListener('submit', handleAddBill);
  elements.affordForm.addEventListener('submit', handleAffordabilityCheck);
  render();
}

async function loadState() {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('budget_data')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (!error && data) {
        return normalizeState(data);
      }

      if (error && error.code !== 'PGRST116') {
        console.warn('Supabase query failed.', error);
      }

      const localSaved = localStorage.getItem(STORAGE_KEY);
      if (localSaved) {
        try {
          const localState = normalizeState(JSON.parse(localSaved));
          await saveStateFromData(localState);
          return localState;
        } catch (localError) {
          console.warn('Unable to mirror local state to Supabase.', localError);
        }
      }

      const seededState = cloneData(defaultState);
      await saveStateToSupabase(seededState);
      return seededState;
    } catch (error) {
      console.warn('Supabase load failed, falling back to local storage.', error);
    }
  }

  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return cloneData(defaultState);
  }

  try {
    const parsed = JSON.parse(saved);
    return normalizeState(parsed);
  } catch (error) {
    return cloneData(defaultState);
  }
}

function normalizeState(payload) {
  const source = payload || {};
  return {
    income: Number(source.income) || defaultState.income,
    balance: Number.isFinite(Number(source.balance)) ? Number(source.balance) : defaultState.balance,
    categories: mergeCategories(source.categories),
    expenses: Array.isArray(source.expenses) ? source.expenses : [],
    bills: Array.isArray(source.bills) ? source.bills : []
  };
}

function mergeCategories(savedCategories) {
  const saved = Array.isArray(savedCategories) ? savedCategories : [];
  const savedById = new Map(saved.filter((category) => category && category.id).map((category) => [category.id, category]));

  const merged = defaultCategories.map((defaultCategory) => savedById.get(defaultCategory.id) || defaultCategory);

  saved.forEach((category) => {
    if (category && category.id && !defaultCategories.some((defaultCategory) => defaultCategory.id === category.id)) {
      merged.push(category);
    }
  });

  return merged;
}

async function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  await saveStateToSupabase(state);
}

async function saveStateFromData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  await saveStateToSupabase(data);
}

async function saveStateToSupabase(data) {
  if (!supabaseClient) {
    return;
  }

  try {
    await supabaseClient.from('budget_data').upsert({
      id: 'default',
      income: Number(data.income) || 0,
      balance: Number(data.balance) || 0,
      categories: data.categories,
      expenses: data.expenses,
      bills: data.bills,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Supabase save failed.', error);
  }
}

function render() {
  elements.monthlyIncomeInput.value = state.income;
  elements.balanceInput.value = state.balance;
  populateCategoryOptions();
  renderSummary();
  renderCategories();
  renderExpenses();
  renderBills();
  renderFreeToSpend();
}

function populateCategoryOptions() {
  populateSelect(elements.categorySelect);
  populateSelect(elements.affordCategorySelect, true);
}

function populateSelect(selectEl, includeBlank) {
  if (!selectEl) {
    return;
  }

  const selected = selectEl.value || (includeBlank ? '' : state.categories[0]?.id || '');
  const blankOption = includeBlank ? '<option value="">No category</option>' : '';

  selectEl.innerHTML =
    blankOption +
    state.categories.map((category) => `<option value="${category.id}">${category.name}</option>`).join('');

  if (selected && state.categories.some((category) => category.id === selected)) {
    selectEl.value = selected;
  }
}

function renderSummary() {
  const totalBudget = state.categories.reduce((sum, category) => sum + Number(category.budget || 0), 0);
  const totalSpent = state.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const remaining = state.income - totalSpent;

  elements.budgetedValue.textContent = formatMoney(totalBudget);
  elements.spentValue.textContent = formatMoney(totalSpent);
  elements.leftValue.textContent = formatMoney(remaining);

  renderStamp(remaining, totalSpent);
}

function renderStamp(remaining, totalSpent) {
  if (!elements.statusStamp) {
    return;
  }

  const spentRatio = state.income > 0 ? totalSpent / state.income : 0;
  let label = 'On track';
  let statusClass = 'good';

  if (remaining < 0) {
    label = 'Over budget';
    statusClass = 'danger';
  } else if (spentRatio >= 0.85) {
    label = 'Cutting it close';
    statusClass = 'warning';
  }

  elements.statusStamp.className = `stamp ${statusClass}`;
  elements.statusStamp.querySelector('span').textContent = label;
}

function renderCategories() {
  elements.categoryList.innerHTML = state.categories
    .map((category) => {
      const spent = getCategorySpent(category.id);
      const budget = Number(category.budget || 0);
      const ratio = Math.min((spent / Math.max(budget || 1, 1)) * 100, 100);
      const statusClass = spent > budget ? 'danger' : spent > budget * 0.8 ? 'warning' : '';

      return `
        <div class="category-item">
          <div class="cat-info">
            <span class="category-name">${category.name}</span>
            <span class="category-meta">${formatMoney(spent)} of ${formatMoney(budget)}</span>
          </div>

          <div class="cat-progress">
            <div class="progress-wrap">
              <div class="progress-bar ${statusClass}" style="width: ${Math.min(ratio, 100)}%"></div>
            </div>
          </div>

          <div class="cat-budget">
            <span class="cat-budget-label">Budget</span>
            <span class="cat-budget-currency">$</span>
            <input type="number" min="0" step="0.01" value="${budget}" data-category-id="${category.id}" aria-label="${category.name} budget" />
          </div>
        </div>
      `;
    })
    .join('');

  elements.categoryList.querySelectorAll('input[data-category-id]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const categoryId = event.target.dataset.categoryId;
      const nextBudget = Number(event.target.value) || 0;
      const category = state.categories.find((item) => item.id === categoryId);

      if (!category) {
        return;
      }

      category.budget = nextBudget;
      saveState();
      render();
    });
  });
}

function renderExpenses() {
  const sortedExpenses = [...state.expenses].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!sortedExpenses.length) {
    elements.expenseList.innerHTML = '<li class="empty-state">No expenses yet. Add your first one.</li>';
    return;
  }

  elements.expenseList.innerHTML = sortedExpenses
    .map(
      (expense) => `
        <li class="expense-item">
          <div class="expense-main">
            <span class="expense-title">${escapeHtml(expense.description)}</span>
            <span class="expense-leader" aria-hidden="true"></span>
            <span class="expense-amount">${formatMoney(expense.amount)}</span>
          </div>
          <div class="expense-info">
            <span>${getCategoryName(expense.category)}</span>
            <span>${formatDate(expense.date)}</span>
            <button class="delete-button" type="button" data-delete-id="${expense.id}">Remove</button>
          </div>
        </li>
      `
    )
    .join('');

  elements.expenseList.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const id = Number(event.target.dataset.deleteId);
      state.expenses = state.expenses.filter((expense) => expense.id !== id);
      saveState();
      render();
    });
  });
}

function handleExpenseSubmit(event) {
  event.preventDefault();

  const description = elements.expenseNameInput.value.trim();
  const amount = Number(elements.expenseAmountInput.value);
  const category = elements.categorySelect.value;
  const date = elements.expenseDateInput.value || todayISO();

  if (!description || !amount || amount <= 0 || !category) {
    return;
  }

  state.expenses.push({
    id: Date.now(),
    description,
    category,
    amount,
    date
  });

  saveState();
  elements.expenseForm.reset();
  elements.expenseDateInput.value = todayISO();
  render();
}

function saveIncome() {
  const nextIncome = Number(elements.monthlyIncomeInput.value);
  state.income = Number.isFinite(nextIncome) && nextIncome >= 0 ? nextIncome : state.income;
  saveState();
  render();
}

function saveBalance() {
  const nextBalance = Number(elements.balanceInput.value);
  state.balance = Number.isFinite(nextBalance) ? nextBalance : state.balance;
  saveState();
  render();
}

function getUnpaidBillsTotal() {
  return state.bills
    .filter((bill) => !bill.paid)
    .reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
}

function getFreeToSpend() {
  return state.balance - getUnpaidBillsTotal();
}

function renderFreeToSpend() {
  if (!elements.freeToSpendValue) {
    return;
  }
  elements.freeToSpendValue.textContent = formatMoney(getFreeToSpend());
}

function renderBills() {
  if (!elements.billList) {
    return;
  }

  const sortedBills = [...state.bills].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  if (!sortedBills.length) {
    elements.billList.innerHTML = '<li class="empty-state">No upcoming bills tracked. Add one below.</li>';
    return;
  }

  elements.billList.innerHTML = sortedBills
    .map(
      (bill) => `
        <li class="bill-item ${bill.paid ? 'paid' : ''}">
          <div class="bill-info">
            <span class="bill-name">${escapeHtml(bill.name)}${bill.recurring ? ' <span class="bill-recurring">(monthly)</span>' : ''}</span>
            <span class="bill-meta">${formatMoney(bill.amount)} &middot; due ${formatDate(bill.dueDate)}</span>
          </div>
          <button type="button" class="bill-toggle" data-toggle-id="${bill.id}">${bill.paid ? 'Mark unpaid' : 'Mark paid'}</button>
          <button type="button" class="delete-button" data-delete-bill-id="${bill.id}">Remove</button>
        </li>
      `
    )
    .join('');

  elements.billList.querySelectorAll('[data-toggle-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      toggleBillPaid(Number(event.target.dataset.toggleId));
    });
  });

  elements.billList.querySelectorAll('[data-delete-bill-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const id = Number(event.target.dataset.deleteBillId);
      state.bills = state.bills.filter((bill) => bill.id !== id);
      saveState();
      render();
    });
  });
}

function handleAddBill(event) {
  event.preventDefault();

  const name = elements.billNameInput.value.trim();
  const amount = Number(elements.billAmountInput.value);
  const dueDate = elements.billDueDateInput.value || todayISO();
  const recurring = elements.billRecurringInput.checked;

  if (!name || !amount || amount <= 0) {
    return;
  }

  state.bills.push({
    id: Date.now(),
    name,
    amount,
    dueDate,
    recurring,
    paid: false
  });

  saveState();
  elements.billForm.reset();
  elements.billDueDateInput.value = todayISO();
  render();
}

function toggleBillPaid(id) {
  const bill = state.bills.find((item) => item.id === id);
  if (!bill) {
    return;
  }

  if (!bill.paid && bill.recurring) {
    bill.dueDate = addOneMonth(bill.dueDate);
    bill.paid = false;
  } else {
    bill.paid = !bill.paid;
  }

  saveState();
  render();
}

function handleAffordabilityCheck(event) {
  event.preventDefault();

  const description = elements.affordDescriptionInput.value.trim() || 'This purchase';
  const amount = Number(elements.affordAmountInput.value);
  const categoryId = elements.affordCategorySelect.value;

  if (!amount || amount <= 0) {
    return;
  }

  const freeToSpend = getFreeToSpend();
  const afterPurchase = freeToSpend - amount;
  const canAfford = afterPurchase >= 0;

  let categoryNote = '';
  if (categoryId) {
    const category = state.categories.find((item) => item.id === categoryId);
    if (category) {
      const spent = getCategorySpent(categoryId);
      const budget = Number(category.budget || 0);
      const remainingBudget = budget - spent;
      const afterCategorySpend = remainingBudget - amount;
      categoryNote = `
        <div class="afford-note ${afterCategorySpend < 0 ? 'warning' : ''}">
          This would use ${formatMoney(amount)} of your ${formatMoney(remainingBudget)} remaining ${escapeHtml(category.name)} budget,
          leaving ${formatMoney(afterCategorySpend)}${afterCategorySpend < 0 ? ' (over budget for this category)' : ''}.
        </div>
      `;
    }
  }

  elements.affordResult.innerHTML = `
    <div class="afford-headline ${canAfford ? 'good' : 'danger'}">${canAfford ? 'Yes, you can afford it' : 'Not right now'}</div>
    <div class="afford-breakdown">
      <div><span>Cash on hand</span><span>${formatMoney(state.balance)}</span></div>
      <div><span>Upcoming unpaid bills</span><span>&minus; ${formatMoney(getUnpaidBillsTotal())}</span></div>
      <div class="subtotal"><span>Free to spend</span><span>${formatMoney(freeToSpend)}</span></div>
      <div><span>${escapeHtml(description)}</span><span>&minus; ${formatMoney(amount)}</span></div>
      <div class="total"><span>Left after</span><span>${formatMoney(afterPurchase)}</span></div>
    </div>
    ${categoryNote}
  `;
}

function addOneMonth(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function resetAll() {
  const shouldReset = window.confirm('Clear all logged expenses for this month? Your income and category budgets will stay the same.');

  if (!shouldReset) {
    return;
  }

  state.expenses = [];
  saveState();
  render();
}

function getCategorySpent(categoryId) {
  return state.expenses
    .filter((expense) => expense.category === categoryId)
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

function getCategoryName(categoryId) {
  const category = state.categories.find((item) => item.id === categoryId);
  return category ? category.name : 'Other';
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatDate(dateString) {
  if (!dateString) {
    return 'Today';
  }

  return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}
