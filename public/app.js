const state = {
  activeTab: "tfsa",
  selectedYear: new Date().getFullYear(),
  availableYears: [],
  summary: null,
  yearData: null,
  filter: "all",
  fundingSummary: null,
  fundingFilter: "all",
};

const elements = {
  addYearButton: document.querySelector("#add-year-button"),
  cancelEditButton: document.querySelector("#cancel-edit-button"),
  dataPath: document.querySelector("#data-path"),
  editingId: document.querySelector("#editing-id"),
  fundingBalanceForm: document.querySelector("#funding-balance-form"),
  fundingCancelEditButton: document.querySelector("#funding-cancel-edit-button"),
  fundingEditingId: document.querySelector("#funding-editing-id"),
  fundingFlowAmount: document.querySelector("#funding-flow-amount"),
  fundingFlowDate: document.querySelector("#funding-flow-date"),
  fundingFlowForm: document.querySelector("#funding-flow-form"),
  fundingFlowNote: document.querySelector("#funding-flow-note"),
  fundingFlowType: document.querySelector("#funding-flow-type"),
  fundingFormTitle: document.querySelector("#funding-form-title"),
  fundingHistoryEmpty: document.querySelector("#funding-history-empty"),
  fundingHistoryItemTemplate: document.querySelector("#funding-history-item-template"),
  fundingHistoryList: document.querySelector("#funding-history-list"),
  fundingPanel: document.querySelector("#funding-panel"),
  fundingPreviewPanel: document.querySelector("#funding-preview-panel"),
  fundingStartingBalance: document.querySelector("#funding-starting-balance"),
  fundingStatusPill: document.querySelector("#funding-status-pill"),
  fundingSubmitButton: document.querySelector("#funding-submit-button"),
  fundingSummaryGrid: document.querySelector("#funding-summary-grid"),
  fundingTypeFilter: document.querySelector("#funding-type-filter"),
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
  tabButtons: document.querySelectorAll(".tab-button"),
  tfsaPanel: document.querySelector("#tfsa-panel"),
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

function switchTab(tab) {
  state.activeTab = tab;
  elements.tfsaPanel.hidden = tab !== "tfsa";
  elements.fundingPanel.hidden = tab !== "funding";

  for (const button of elements.tabButtons) {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }
}

function updateFundingStatus(summary) {
  elements.fundingStatusPill.className = "status-pill";
  elements.fundingStatusPill.textContent = `当前余额 ${currency(summary.currentBalance)}`;

  if (summary.currentBalance < 0) {
    elements.fundingStatusPill.classList.add("danger");
  }
}

function renderFundingSummary(summary) {
  elements.fundingStartingBalance.value = summary.startingBalance || "";
  updateFundingStatus(summary);

  const stats = [
    { label: "初始资金余额", value: currency(summary.startingBalance) },
    { label: "累计流入", value: currency(summary.inflows) },
    { label: "累计流出", value: currency(summary.outflows) },
    { label: "当前资金余额", value: currency(summary.currentBalance) },
  ];

  elements.fundingSummaryGrid.innerHTML = "";
  for (const stat of stats) {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<span>${stat.label}</span><strong>${stat.value}</strong>`;
    elements.fundingSummaryGrid.append(card);
  }
}

function renderFundingHistory(summary) {
  const flows =
    state.fundingFilter === "all"
      ? summary.flows
      : summary.flows.filter((flow) => flow.type === state.fundingFilter);

  elements.fundingHistoryList.innerHTML = "";
  elements.fundingHistoryEmpty.hidden = flows.length > 0;

  for (const flow of flows) {
    const fragment = elements.fundingHistoryItemTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".history-item");
    const type = flow.type === "inflow" ? "流入" : "流出";
    const signedAmount = `${flow.type === "inflow" ? "+" : "-"}${currency(flow.amount)}`;

    fragment.querySelector(".history-type").textContent = type;
    fragment.querySelector(".history-date").textContent = formatDate(flow.date);
    fragment.querySelector(".history-amount").textContent = signedAmount;
    fragment.querySelector(".history-note").textContent = flow.note || "无备注";

    item.dataset.id = flow.id;
    item.classList.toggle("outflow", flow.type === "outflow");
    item.querySelector('[data-action="edit"]').addEventListener("click", () => {
      startFundingEdit(flow);
    });
    item.querySelector('[data-action="delete"]').addEventListener("click", () => {
      deleteFundingFlow(flow.id);
    });

    elements.fundingHistoryList.append(fragment);
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

function refreshFundingPreview() {
  const amount = Number(elements.fundingFlowAmount.value);
  const type = elements.fundingFlowType.value;
  const summary = state.fundingSummary;

  elements.fundingPreviewPanel.className = "preview-panel";

  if (!summary || !Number.isFinite(amount) || amount <= 0) {
    elements.fundingPreviewPanel.textContent = "输入金额后，这里会显示录入后的资金余额预估。";
    return;
  }

  const current = getEditingFundingFlow();
  const simulatedInflows =
    summary.inflows -
    (current?.type === "inflow" ? current.amount : 0) +
    (type === "inflow" ? amount : 0);
  const simulatedOutflows =
    summary.outflows -
    (current?.type === "outflow" ? current.amount : 0) +
    (type === "outflow" ? amount : 0);
  const currentBalance = summary.startingBalance + simulatedInflows - simulatedOutflows;

  elements.fundingPreviewPanel.textContent = `保存后预计资金余额 ${currency(currentBalance)}。`;

  if (currentBalance < 0) {
    elements.fundingPreviewPanel.classList.add("danger");
  }
}

function getEditingTransaction() {
  if (!elements.editingId.value || !state.summary) {
    return null;
  }

  return state.summary.transactions.find(
    (transaction) => transaction.id === elements.editingId.value
  );
}

function getEditingFundingFlow() {
  if (!elements.fundingEditingId.value || !state.fundingSummary) {
    return null;
  }

  return state.fundingSummary.flows.find(
    (flow) => flow.id === elements.fundingEditingId.value
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

function resetFundingForm() {
  elements.fundingFlowForm.reset();
  elements.fundingEditingId.value = "";
  elements.fundingFormTitle.textContent = "新增资金记录";
  elements.fundingSubmitButton.textContent = "保存记录";
  elements.fundingCancelEditButton.hidden = true;
  elements.fundingFlowDate.value = new Date().toISOString().slice(0, 10);
  refreshFundingPreview();
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

function startFundingEdit(flow) {
  elements.fundingEditingId.value = flow.id;
  elements.fundingFormTitle.textContent = "编辑资金记录";
  elements.fundingSubmitButton.textContent = "保存修改";
  elements.fundingCancelEditButton.hidden = false;
  elements.fundingFlowDate.value = flow.date;
  elements.fundingFlowType.value = flow.type;
  elements.fundingFlowAmount.value = flow.amount;
  elements.fundingFlowNote.value = flow.note;
  refreshFundingPreview();
  switchTab("funding");
  elements.fundingFlowForm.scrollIntoView({ behavior: "smooth", block: "start" });
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

async function loadFunding() {
  const payload = await request("/api/funding");
  state.fundingSummary = payload.fundingSummary;

  renderFundingSummary(payload.fundingSummary);
  renderFundingHistory(payload.fundingSummary);
  refreshFundingPreview();
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

async function saveFundingBalance(event) {
  event.preventDefault();
  const amount = Number(elements.fundingStartingBalance.value);

  if (!Number.isFinite(amount) || amount < 0) {
    window.alert("请输入 0 或正数的初始资金余额。");
    return;
  }

  const payload = await request("/api/funding/balance", {
    method: "PUT",
    body: JSON.stringify({
      startingBalance: amount,
    }),
  });

  state.fundingSummary = payload.fundingSummary;
  renderFundingSummary(payload.fundingSummary);
  renderFundingHistory(payload.fundingSummary);
  refreshFundingPreview();
}

async function submitFundingFlow(event) {
  event.preventDefault();

  const body = {
    date: elements.fundingFlowDate.value,
    type: elements.fundingFlowType.value,
    amount: Number(elements.fundingFlowAmount.value),
    note: elements.fundingFlowNote.value.trim(),
  };

  if (!body.date || !Number.isFinite(body.amount) || body.amount <= 0) {
    window.alert("请填写有效的日期和金额。");
    return;
  }

  const flowId = elements.fundingEditingId.value;
  const endpoint = flowId ? `/api/funding/flows/${flowId}` : "/api/funding/flows";
  const method = flowId ? "PUT" : "POST";

  const payload = await request(endpoint, {
    method,
    body: JSON.stringify(body),
  });

  state.fundingSummary = payload.fundingSummary;
  renderFundingSummary(payload.fundingSummary);
  renderFundingHistory(payload.fundingSummary);
  resetFundingForm();
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

async function deleteFundingFlow(flowId) {
  const confirmed = window.confirm("确定删除这条资金记录吗？");
  if (!confirmed) {
    return;
  }

  const payload = await request(`/api/funding/flows/${flowId}`, {
    method: "DELETE",
  });

  state.fundingSummary = payload.fundingSummary;
  renderFundingSummary(payload.fundingSummary);
  renderFundingHistory(payload.fundingSummary);
  resetFundingForm();
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
for (const button of elements.tabButtons) {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
}
elements.typeFilter.addEventListener("change", (event) => {
  state.filter = event.target.value;
  if (state.summary) {
    renderHistory(state.summary);
  }
});
elements.fundingTypeFilter.addEventListener("change", (event) => {
  state.fundingFilter = event.target.value;
  if (state.fundingSummary) {
    renderFundingHistory(state.fundingSummary);
  }
});
elements.roomForm.addEventListener("submit", (event) => {
  saveRoom(event).catch(showError);
});
elements.transactionForm.addEventListener("submit", (event) => {
  submitTransaction(event).catch(showError);
});
elements.fundingBalanceForm.addEventListener("submit", (event) => {
  saveFundingBalance(event).catch(showError);
});
elements.fundingFlowForm.addEventListener("submit", (event) => {
  submitFundingFlow(event).catch(showError);
});
elements.transactionAmount.addEventListener("input", refreshPreview);
elements.transactionType.addEventListener("change", refreshPreview);
elements.fundingFlowAmount.addEventListener("input", refreshFundingPreview);
elements.fundingFlowType.addEventListener("change", refreshFundingPreview);
elements.cancelEditButton.addEventListener("click", resetForm);
elements.fundingCancelEditButton.addEventListener("click", resetFundingForm);
elements.addYearButton.addEventListener("click", addYear);

resetForm();
resetFundingForm();
switchTab("tfsa");
loadYear().catch(showError);
loadFunding().catch(showError);
