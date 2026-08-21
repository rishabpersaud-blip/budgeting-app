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
  expenses: [
    { id: 1, description: 'Rent', category: 'housing', amount: 1200, date: todayISO() },
    { id: 2, description: 'Groceries', category: 'food', amount: 180, date: todayISO() },
    { id: 3, description: 'Fuel', category: 'transport', amount: 65, date: todayISO() }
  ],
  categories: defaultCategories
};

const supabaseConfig = window.BUDGET_SUPABASE_CONFIG || {};
const supabase =
  supabaseConfig.url &&
  supabaseConfig.anonKey &&
  supabaseConfig.url !== 'https://YOUR-PROJECT-ID.supabase.co' &&
  supabaseConfig.anonKey !== 'YOUR_SUPABASE_ANON_KEY'
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;

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
  resetDataBtn: document.querySelector('#resetDataBtn')
};

initialize();

async function initialize() {
  const defaultDate = todayISO();
  state = await loadState();
  elements.expenseDateInput.value = defaultDate;
  elements.monthlyIncomeInput.value = state.income;
  elements.expenseForm.addEventListener('submit', handleExpenseSubmit);
  elements.saveIncomeBtn.addEventListener('click', saveIncome);
  elements.resetDataBtn.addEventListener('click', resetAll);
  render();
}

async function loadState() {
  if (supabase) {
    try {
      const { data, error } = await supabase
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
    categories: Array.isArray(source.categories) && source.categories.length ? source.categories : defaultCategories,
    expenses: Array.isArray(source.expenses) ? source.expenses : []
  };
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
  if (!supabase) {
    return;
  }

  try {
    await supabase.from('budget_data').upsert({
      id: 'default',
      income: Number(data.income) || 0,
      categories: data.categories,
      expenses: data.expenses,
      updated_at: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Supabase save failed.', error);
  }
}

function render() {
  elements.monthlyIncomeInput.value = state.income;
  populateCategoryOptions();
  renderSummary();
  renderCategories();
  renderExpenses();
}

function populateCategoryOptions() {
  const selected = elements.categorySelect.value || state.categories[0]?.id || '';
  elements.categorySelect.innerHTML = state.categories
    .map(
      (category) =>
        `<option value="${category.id}">${category.name}</option>`
    )
    .join('');

  if (selected && state.categories.some((category) => category.id === selected)) {
    elements.categorySelect.value = selected;
  }
}

function renderSummary() {
  const totalBudget = state.categories.reduce((sum, category) => sum + Number(category.budget || 0), 0);
  const totalSpent = state.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const remaining = state.income - totalSpent;

  elements.budgetedValue.textContent = formatMoney(totalBudget);
  elements.spentValue.textContent = formatMoney(totalSpent);
  elements.leftValue.textContent = formatMoney(remaining);
}

function renderCategories() {
  elements.categoryList.innerHTML = state.categories
    .map((category) => {
      const spent = getCategorySpent(category.id);
      const ratio = Math.min((spent / Math.max(category.budget || 1, 1)) * 100, 100);
      const statusClass = spent > category.budget ? 'danger' : spent > category.budget * 0.8 ? 'warning' : '';

      return `
        <div class="category-item">
          <div class="category-head">
            <div>
              <div class="category-name">${category.name}</div>
              <div class="category-meta">${formatMoney(spent)} spent</div>
            </div>
            <div class="category-meta">${formatMoney(Number(category.budget || 0))} budget</div>
          </div>

          <div class="progress-wrap">
            <div class="progress-bar ${statusClass}" style="width: ${Math.min(ratio, 100)}%"></div>
          </div>

          <div class="category-budget-row">
            <span>Budget:</span>
            <input type="number" min="0" step="0.01" value="${Number(category.budget || 0)}" data-category-id="${category.id}" aria-label="${category.name} budget" />
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
            <div class="expense-info">
              <span>${getCategoryName(expense.category)}</span>
              <span>${formatDate(expense.date)}</span>
            </div>
          </div>
          <div class="expense-amount">${formatMoney(expense.amount)}</div>
          <button class="delete-button" type="button" data-delete-id="${expense.id}">Delete</button>
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

function resetAll() {
  const shouldReset = window.confirm('Reset your monthly budget data?');

  if (!shouldReset) {
    return;
  }

  const freshState = cloneData(defaultState);
  Object.assign(state, freshState);
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
}
