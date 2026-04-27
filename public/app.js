const state = {
  selectedYear: new Date().getFullYear(),
  availableYears: [],
  summary: null,
  yearData: null,
  filter: "all",
};

const elements = {
  addYearButton: document.querySelector("#add-year-button"),
  cancelEditButton: document.querySelector("#cancel-edit-button"),
  dataPath: document.querySelector("#data-path"),
  editingId: document.querySelector("#editing-id"),
  formTitle: document.querySelector("#form-title"),
  historyEmpty: document.querySelector("#history-empty"),
  historyList: document.querySelector("#history-list"),
  historyItemTemplate: document.querySelector("#history-item-template"),
  previewPanel: document.querySelector("#preview-panel"),
  roomForm: document.querySelector("#room-form"),
  startingRoom: document.querySelector("#starting-room"),
  statusPill: document.querySelector("#status-pill"),
  submitButton: document.querySelector("#submit-button"),
  summaryGrid: document.querySelector("#summary-grid"),
  summaryTitle: document.querySelector("#summary-title"),
  transactionAmount: document.querySelector("#transaction-amount"),
  transactionDate: document.querySelector("#transaction-date"),
  transactionForm: document.querySelector("#transaction-form"),
  transactionNote: document.querySelector("#transaction-note"),
  transactionType: document.querySelector("#transaction-type"),
  typeFilter: document.querySelector("#type-filter"),
  yearSelect: document.querySelector("#year-select"),
};

function currency(value) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "请求失败。");
  }

  return payload;
}

function renderYearSelect() {
  const years = new Set([...state.availableYears, state.selectedYear]);
  const orderedYears = [...years].sort((left, right) => right - left);

  elements.yearSelect.innerHTML = "";
  for (const year of orderedYears) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = `${year}`;
    option.selected = year === state.selectedYear;
    elements.yearSelect.append(option);
  }
}

function updateStatus(summary) {
  elements.statusPill.className = "status-pill";

  if (summary.isOverLimit) {
    elements.statusPill.textContent = `已超额 ${currency(summary.overContribution)}`;
    elements.statusPill.classList.add("danger");
    return;
  }

  if (summary.isNearLimit) {
    elements.statusPill.textContent = `接近上限，剩余 ${currency(summary.remainingRoom)}`;
    elements.statusPill.classList.add("warn");
    return;
  }

  elements.statusPill.textContent = `安全，剩余 ${currency(summary.remainingRoom)}`;
}

function renderSummary(summary) {
  elements.summaryTitle.textContent = `${summary.year} 年额度总览`;
  elements.startingRoom.value = summary.startingContributionRoom || "";
  updateStatus(summary);

  const stats = [
    { label: "起始可用额度", value: currency(summary.startingContributionRoom) },
    { label: "已存入", value: currency(summary.contributions) },
    { label: "已取出", value: currency(summary.withdrawals) },
    { label: "当前剩余额度", value: currency(summary.remainingRoom) },
    { label: "超额金额", value: currency(summary.overContribution) },
    { label: "明年预计返还额度", value: currency(summary.nextYearRestoration) },
  ];

  elements.summaryGrid.innerHTML = "";
  for (const stat of stats) {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<span>${stat.label}</span><strong>${stat.value}</strong>`;
    elements.summaryGrid.append(card);
  }
}

function renderHistory(summary) {
  const transactions =
    state.filter === "all"
      ? summary.transactions
      : summary.transactions.filter((transaction) => transaction.type === state.filter);

  elements.historyList.innerHTML = "";
  elements.historyEmpty.hidden = transactions.length > 0;

  for (const transaction of transactions) {
    const fragment = elements.historyItemTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".history-item");
    const type = transaction.type === "contribution" ? "存款" : "取款";

    fragment.querySelector(".history-type").textContent = type;
    fragment.querySelector(".history-date").textContent = formatDate(transaction.date);
    fragment.querySelector(".history-amount").textContent = currency(transaction.amount);
    fragment.querySelector(".history-note").textContent = transaction.note || "无备注";

    item.dataset.id = transaction.id;
    item.querySelector('[data-action="edit"]').addEventListener("click", () => {
      startEdit(transaction);
    });
    item.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deleteTransaction(transaction.id);
    });

    elements.historyList.append(fragment);
  }
}

function refreshPreview() {
  const amount = Number(elements.transactionAmount.value);
  const type = elements.transactionType.value;
  const summary = state.summary;

  elements.previewPanel.className = "preview-panel";

  if (!summary || !Number.isFinite(amount) || amount <= 0) {
    elements.previewPanel.textContent = "输入金额后，这里会显示录入后的额度预估。";
    return;
  }

  const current = getEditingTransaction();
  const simulatedContributions =
    summary.contributions -
    (current?.type === "contribution" ? current.amount : 0) +
    (type === "contribution" ? amount : 0);
  const simulatedWithdrawals =
    summary.withdrawals -
    (current?.type === "withdrawal" ? current.amount : 0) +
    (type === "withdrawal" ? amount : 0);
  const remainingRoom = summary.startingContributionRoom - simulatedContributions;

  if (type === "withdrawal") {
    elements.previewPanel.textContent = `保存后本年预计剩余额度 ${currency(remainingRoom)}。取款不会恢复 ${state.selectedYear} 年额度，明年预计返还额度会是 ${currency(simulatedWithdrawals)}。`;
    return;
  }

  if (remainingRoom < 0) {
    elements.previewPanel.textContent = `录入后会超额 ${currency(Math.abs(remainingRoom))}。`;
    elements.previewPanel.classList.add("danger");
    return;
  }

  if (summary.startingContributionRoom > 0 && remainingRoom <= summary.startingContributionRoom * 0.1) {
    elements.previewPanel.textContent = `录入后仅剩 ${currency(remainingRoom)}，已接近年度上限。`;
    elements.previewPanel.classList.add("warn");
    return;
  }

  elements.previewPanel.textContent = `录入后预计剩余额度 ${currency(remainingRoom)}。`;
}

function getEditingTransaction() {
  if (!elements.editingId.value || !state.summary) {
    return null;
  }

  return state.summary.transactions.find(
    (transaction) => transaction.id === elements.editingId.value
  );
}

function resetForm() {
  elements.transactionForm.reset();
  elements.editingId.value = "";
  elements.formTitle.textContent = "新增记录";
  elements.submitButton.textContent = "保存记录";
  elements.cancelEditButton.hidden = true;
  elements.transactionDate.value = new Date().toISOString().slice(0, 10);
  refreshPreview();
}

function startEdit(transaction) {
  elements.editingId.value = transaction.id;
  elements.formTitle.textContent = "编辑记录";
  elements.submitButton.textContent = "保存修改";
  elements.cancelEditButton.hidden = false;
  elements.transactionDate.value = transaction.date;
  elements.transactionType.value = transaction.type;
  elements.transactionAmount.value = transaction.amount;
  elements.transactionNote.value = transaction.note;
  refreshPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadYear(year = state.selectedYear) {
  const payload = await request(`/api/data?year=${year}`);
  state.selectedYear = payload.selectedYear;
  state.availableYears = payload.availableYears;
  state.summary = payload.summary;
  state.yearData = payload.yearData;

  renderYearSelect();
  renderSummary(payload.summary);
  renderHistory(payload.summary);
  elements.dataPath.textContent = `数据文件：${payload.dataFile}`;
  refreshPreview();
}

async function saveRoom(event) {
  event.preventDefault();
  const amount = Number(elements.startingRoom.value);

  if (!Number.isFinite(amount) || amount < 0) {
    window.alert("请输入 0 或正数的年度额度。");
    return;
  }

  const payload = await request("/api/room", {
    method: "PUT",
    body: JSON.stringify({
      year: state.selectedYear,
      startingContributionRoom: amount,
    }),
  });

  state.summary = payload.summary;
  state.yearData = payload.yearData;
  renderSummary(payload.summary);
  renderHistory(payload.summary);
  refreshPreview();
}

async function submitTransaction(event) {
  event.preventDefault();

  const body = {
    year: state.selectedYear,
    date: elements.transactionDate.value,
    type: elements.transactionType.value,
    amount: Number(elements.transactionAmount.value),
    note: elements.transactionNote.value.trim(),
  };

  if (!body.date || !Number.isFinite(body.amount) || body.amount <= 0) {
    window.alert("请填写有效的日期和金额。");
    return;
  }

  const transactionId = elements.editingId.value;
  const endpoint = transactionId ? `/api/transactions/${transactionId}` : "/api/transactions";
  const method = transactionId ? "PUT" : "POST";

  const payload = await request(endpoint, {
    method,
    body: JSON.stringify(body),
  });

  state.summary = payload.summary;
  state.yearData = payload.yearData;
  renderSummary(payload.summary);
  renderHistory(payload.summary);
  resetForm();
}

async function deleteTransaction(transactionId) {
  const confirmed = window.confirm("确定删除这条记录吗？");
  if (!confirmed) {
    return;
  }

  const payload = await request(`/api/transactions/${transactionId}?year=${state.selectedYear}`, {
    method: "DELETE",
  });

  state.summary = payload.summary;
  state.yearData = payload.yearData;
  renderSummary(payload.summary);
  renderHistory(payload.summary);
  resetForm();
}

function addYear() {
  const input = window.prompt("输入要新增/查看的年份，例如 2027");
  if (!input) {
    return;
  }

  const year = Number(input);
  if (!Number.isInteger(year) || year < 2009 || year > 2100) {
    window.alert("请输入有效年份。");
    return;
  }

  state.selectedYear = year;
  loadYear(year).catch(showError);
}

function showError(error) {
  console.error(error);
  window.alert(error.message || "发生未知错误。");
}

elements.yearSelect.addEventListener("change", (event) => {
  state.selectedYear = Number(event.target.value);
  resetForm();
  loadYear(state.selectedYear).catch(showError);
});
elements.typeFilter.addEventListener("change", (event) => {
  state.filter = event.target.value;
  if (state.summary) {
    renderHistory(state.summary);
  }
});
elements.roomForm.addEventListener("submit", (event) => {
  saveRoom(event).catch(showError);
});
elements.transactionForm.addEventListener("submit", (event) => {
  submitTransaction(event).catch(showError);
});
elements.transactionAmount.addEventListener("input", refreshPreview);
elements.transactionType.addEventListener("change", refreshPreview);
elements.cancelEditButton.addEventListener("click", resetForm);
elements.addYearButton.addEventListener("click", addYear);

resetForm();
loadYear().catch(showError);
