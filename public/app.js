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
  fundingAssetType: document.querySelector("#funding-asset-type"),
  fundingExpiryDate: document.querySelector("#funding-expiry-date"),
  fundingFee: document.querySelector("#funding-fee"),
  fundingFlowDate: document.querySelector("#funding-flow-date"),
  fundingFlowForm: document.querySelector("#funding-flow-form"),
  fundingFlowNote: document.querySelector("#funding-flow-note"),
  fundingFormTitle: document.querySelector("#funding-form-title"),
  fundingHistoryEmpty: document.querySelector("#funding-history-empty"),
  fundingHistoryItemTemplate: document.querySelector("#funding-history-item-template"),
  fundingHistoryList: document.querySelector("#funding-history-list"),
  fundingMatchFields: document.querySelector("#funding-match-fields"),
  fundingMatchHelp: document.querySelector("#funding-match-help"),
  fundingMatchTrade: document.querySelector("#funding-match-trade"),
  fundingOptionFields: document.querySelector("#funding-option-fields"),
  fundingOptionType: document.querySelector("#funding-option-type"),
  fundingPanel: document.querySelector("#funding-panel"),
  fundingPrice: document.querySelector("#funding-price"),
  fundingPreviewPanel: document.querySelector("#funding-preview-panel"),
  fundingQuantity: document.querySelector("#funding-quantity"),
  fundingQuantityLabel: document.querySelector("#funding-quantity-label"),
  fundingSide: document.querySelector("#funding-side"),
  fundingStartingBalance: document.querySelector("#funding-starting-balance"),
  fundingStatusPill: document.querySelector("#funding-status-pill"),
  fundingStrike: document.querySelector("#funding-strike"),
  fundingSubmitButton: document.querySelector("#funding-submit-button"),
  fundingSummaryGrid: document.querySelector("#funding-summary-grid"),
  fundingTicker: document.querySelector("#funding-ticker"),
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

function disableNumberInputWheel() {
  for (const input of document.querySelectorAll('input[type="number"]')) {
    input.addEventListener("wheel", (event) => {
      if (document.activeElement === event.currentTarget) {
        event.currentTarget.blur();
      }
    });
  }
}

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

function formatNumber(value) {
  return new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 6,
  }).format(value || 0);
}

function isTradeFlow(flow) {
  return flow?.assetType === "stock" || flow?.assetType === "option";
}

function getTradeMultiplier(assetType) {
  return assetType === "option" ? 100 : 1;
}

function getTradeCashAmount({ assetType, side, quantity, price, fee }) {
  const gross = Number(quantity) * Number(price) * getTradeMultiplier(assetType);
  return Number((side === "buy" ? gross + Number(fee || 0) : gross - Number(fee || 0)).toFixed(2));
}

function sameInstrument(left, right) {
  if (!isTradeFlow(left) || !isTradeFlow(right)) {
    return false;
  }

  if (left.assetType !== right.assetType || left.ticker !== right.ticker) {
    return false;
  }

  if (left.assetType === "stock") {
    return true;
  }

  return (
    left.expiryDate === right.expiryDate &&
    left.optionType === right.optionType &&
    Number(left.strike) === Number(right.strike)
  );
}

function getDraftTrade() {
  const assetType = elements.fundingAssetType.value;
  return {
    assetType,
    side: elements.fundingSide.value,
    ticker: elements.fundingTicker.value.trim().toUpperCase(),
    quantity: Number(elements.fundingQuantity.value),
    price: Number(elements.fundingPrice.value),
    fee: Number(elements.fundingFee.value || 0),
    expiryDate: elements.fundingExpiryDate.value,
    optionType: elements.fundingOptionType.value,
    strike: Number(elements.fundingStrike.value),
  };
}

function getInstrumentLabel(flow) {
  if (!isTradeFlow(flow)) {
    return "";
  }

  if (flow.assetType === "stock") {
    return flow.ticker;
  }

  return `${flow.ticker} ${flow.expiryDate} ${flow.strike}${flow.optionType === "put" ? "Put" : "Call"}`;
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
    { label: "已实现盈亏", value: currency(summary.realizedProfit) },
  ];

  elements.fundingSummaryGrid.innerHTML = "";
  for (const stat of stats) {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<span>${stat.label}</span><strong>${stat.value}</strong>`;
    elements.fundingSummaryGrid.append(card);
  }
}

function getFundingHistoryTitle(flow) {
  if (!isTradeFlow(flow)) {
    return flow.note || "普通资金记录";
  }

  const unit = flow.assetType === "option" ? "份" : "股";
  return `${getInstrumentLabel(flow)} · ${formatNumber(flow.quantity)}${unit} @ ${currency(flow.price)}`;
}

function getFundingHistoryDetail(flow) {
  const parts = [];

  if (flow.fee) {
    parts.push(`手续费 ${currency(flow.fee)}`);
  }

  if (flow.side === "buy") {
    parts.push(`已匹配 ${formatNumber(flow.matchedQuantity)}，剩余 ${formatNumber(flow.openQuantity)}`);
  } else if (flow.matchedTradeId) {
    parts.push(`匹配 ${flow.matchedTradeLabel || "买入记录"}`);
    if (Number.isFinite(flow.realizedProfit)) {
      parts.push(`盈亏 ${currency(flow.realizedProfit)}`);
    }
  }

  if (flow.note) {
    parts.push(flow.note);
  }

  return parts.join(" · ") || "无备注";
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
    const type = isTradeFlow(flow) ? (flow.side === "buy" ? "买入" : "卖出") : flow.type === "inflow" ? "流入" : "流出";
    const signedAmount = `${flow.type === "inflow" ? "+" : "-"}${currency(flow.amount)}`;
    const detail = fragment.querySelector(".history-detail");

    fragment.querySelector(".history-type").textContent = type;
    fragment.querySelector(".history-date").textContent = formatDate(flow.date);
    fragment.querySelector(".history-amount").textContent = signedAmount;
    fragment.querySelector(".history-note").textContent = getFundingHistoryTitle(flow);

    if (isTradeFlow(flow)) {
      detail.textContent = getFundingHistoryDetail(flow);
      detail.hidden = false;
    } else {
      detail.textContent = "";
      detail.hidden = true;
      fragment.querySelector(".history-note").textContent = flow.note || "普通资金记录";
    }

    item.dataset.id = flow.id;
    item.classList.toggle("outflow", flow.type === "outflow");
    item.classList.toggle("profit", Number(flow.realizedProfit) > 0);
    item.classList.toggle("loss", Number(flow.realizedProfit) < 0);
    const editButton = item.querySelector('[data-action="edit"]');
    editButton.hidden = !isTradeFlow(flow);
    editButton.addEventListener("click", () => {
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
  const draft = getDraftTrade();
  const summary = state.fundingSummary;

  elements.fundingPreviewPanel.className = "preview-panel";

  updateFundingFormVisibility();

  if (
    !summary ||
    !Number.isFinite(draft.quantity) ||
    !Number.isFinite(draft.price) ||
    draft.quantity <= 0 ||
    draft.price <= 0 ||
    draft.fee < 0
  ) {
    elements.fundingPreviewPanel.textContent = "输入数量和成交价后，这里会显示现金流、余额和匹配预估。";
    return;
  }

  const amount = getTradeCashAmount(draft);
  if (amount <= 0) {
    elements.fundingPreviewPanel.textContent = "扣除手续费后的现金金额必须大于 0。";
    elements.fundingPreviewPanel.classList.add("danger");
    return;
  }

  const type = draft.side === "buy" ? "outflow" : "inflow";
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
  const cashText = `${draft.side === "buy" ? "流出" : "流入"} ${currency(amount)}`;

  if (draft.side === "sell") {
    const match = getSelectedMatch();
    if (!match) {
      elements.fundingPreviewPanel.textContent = `${cashText}，预计资金余额 ${currency(currentBalance)}。未匹配买入记录，本次不会计算盈亏。`;
      elements.fundingPreviewPanel.classList.add("warn");
      return;
    }

    const allocatedCost = (match.cashAmount * draft.quantity) / match.quantity;
    const profit = amount - allocatedCost;
    elements.fundingPreviewPanel.textContent = `${cashText}，预计资金余额 ${currency(currentBalance)}，本次盈亏 ${currency(profit)}。`;
  } else {
    elements.fundingPreviewPanel.textContent = `${cashText}，保存后预计资金余额 ${currency(currentBalance)}。`;
  }

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

function getCandidateMatches() {
  if (!state.fundingSummary) {
    return [];
  }

  const draft = getDraftTrade();
  if (draft.side !== "sell" || !draft.ticker) {
    return [];
  }

  const current = getEditingFundingFlow();
  return state.fundingSummary.flows
    .filter((flow) => {
      if (!isTradeFlow(flow) || flow.side !== "buy" || !sameInstrument(flow, draft)) {
        return false;
      }

      const editingQuantity =
        current?.side === "sell" && current.matchedTradeId === flow.id ? current.quantity : 0;
      return flow.openQuantity + editingQuantity > 0;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function getSelectedMatch() {
  if (!state.fundingSummary || !elements.fundingMatchTrade.value) {
    return null;
  }

  return state.fundingSummary.flows.find((flow) => flow.id === elements.fundingMatchTrade.value) || null;
}

function updateFundingMatchOptions() {
  const previousValue = elements.fundingMatchTrade.value;
  const current = getEditingFundingFlow();
  const matches = getCandidateMatches();

  elements.fundingMatchTrade.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = matches.length > 0 ? "选择买入记录" : "没有可匹配买入";
  elements.fundingMatchTrade.append(placeholder);

  for (const match of matches) {
    const option = document.createElement("option");
    const editingQuantity =
      current?.side === "sell" && current.matchedTradeId === match.id ? current.quantity : 0;
    const availableQuantity = match.openQuantity + editingQuantity;
    option.value = match.id;
    option.textContent = `${formatDate(match.date)} · ${getInstrumentLabel(match)} · 剩余 ${formatNumber(availableQuantity)} · 成本 ${currency(match.cashAmount)}`;
    elements.fundingMatchTrade.append(option);
  }

  if (matches.some((match) => match.id === previousValue)) {
    elements.fundingMatchTrade.value = previousValue;
  } else if (current?.side === "sell" && matches.some((match) => match.id === current.matchedTradeId)) {
    elements.fundingMatchTrade.value = current.matchedTradeId;
  }

  const selected = getSelectedMatch();
  if (selected) {
    const editingQuantity =
      current?.side === "sell" && current.matchedTradeId === selected.id ? current.quantity : 0;
    elements.fundingMatchHelp.textContent = `可匹配数量 ${formatNumber(selected.openQuantity + editingQuantity)}，买入总成本 ${currency(selected.cashAmount)}。`;
  } else if (matches.length === 0) {
    elements.fundingMatchHelp.textContent = "没有可匹配买入时仍可保存卖出，但不会计算本次盈亏。";
  } else {
    elements.fundingMatchHelp.textContent = "可不匹配直接保存；选择买入记录后会计算本次盈亏。";
  }
}

function updateFundingFormVisibility() {
  const isOption = elements.fundingAssetType.value === "option";
  const isSell = elements.fundingSide.value === "sell";

  elements.fundingOptionFields.hidden = !isOption;
  elements.fundingMatchFields.hidden = !isSell;
  elements.fundingQuantityLabel.textContent = isOption ? "份数" : "股数";
  elements.fundingQuantity.placeholder = isOption ? "例如 1" : "例如 100";

  if (isSell) {
    updateFundingMatchOptions();
  }
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
  elements.fundingFormTitle.textContent = "新增证券交易";
  elements.fundingSubmitButton.textContent = "保存记录";
  elements.fundingCancelEditButton.hidden = true;
  elements.fundingFlowDate.value = new Date().toISOString().slice(0, 10);
  elements.fundingFee.value = "0";
  updateFundingFormVisibility();
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
  elements.fundingFormTitle.textContent = isTradeFlow(flow) ? "编辑证券交易" : "编辑资金记录";
  elements.fundingSubmitButton.textContent = "保存修改";
  elements.fundingCancelEditButton.hidden = false;
  elements.fundingFlowDate.value = flow.date;
  elements.fundingFlowNote.value = flow.note;
  if (isTradeFlow(flow)) {
    elements.fundingAssetType.value = flow.assetType;
    elements.fundingSide.value = flow.side;
    elements.fundingTicker.value = flow.ticker;
    elements.fundingQuantity.value = flow.quantity;
    elements.fundingPrice.value = flow.price;
    elements.fundingFee.value = flow.fee;
    elements.fundingExpiryDate.value = flow.expiryDate || "";
    elements.fundingOptionType.value = flow.optionType || "call";
    elements.fundingStrike.value = flow.strike || "";
    updateFundingFormVisibility();
    elements.fundingMatchTrade.value = flow.matchedTradeId || "";
  } else {
    elements.fundingAssetType.value = "stock";
    elements.fundingSide.value = flow.type === "inflow" ? "sell" : "buy";
    elements.fundingTicker.value = "";
    elements.fundingQuantity.value = "";
    elements.fundingPrice.value = "";
    elements.fundingFee.value = "0";
    elements.fundingExpiryDate.value = "";
    elements.fundingOptionType.value = "call";
    elements.fundingStrike.value = "";
    updateFundingFormVisibility();
  }
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
  const draft = getDraftTrade();

  const body = {
    date: elements.fundingFlowDate.value,
    assetType: draft.assetType,
    side: draft.side,
    ticker: draft.ticker,
    quantity: draft.quantity,
    price: draft.price,
    fee: draft.fee,
    note: elements.fundingFlowNote.value.trim(),
  };

  if (body.assetType === "option") {
    body.expiryDate = draft.expiryDate;
    body.optionType = draft.optionType;
    body.strike = draft.strike;
  }

  if (body.side === "sell") {
    body.matchedTradeId = elements.fundingMatchTrade.value;
  }

  if (!body.date || !body.ticker || !Number.isFinite(body.quantity) || body.quantity <= 0 || !Number.isFinite(body.price) || body.price <= 0 || body.fee < 0) {
    window.alert("请填写有效的日期、Ticker、数量、成交价和手续费。");
    return;
  }

  if (body.assetType === "option" && (!body.expiryDate || !body.optionType || !Number.isFinite(body.strike) || body.strike <= 0)) {
    window.alert("请填写有效的期权到期日、类型和行权价。");
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
elements.fundingAssetType.addEventListener("change", refreshFundingPreview);
elements.fundingSide.addEventListener("change", refreshFundingPreview);
elements.fundingTicker.addEventListener("input", refreshFundingPreview);
elements.fundingExpiryDate.addEventListener("input", refreshFundingPreview);
elements.fundingOptionType.addEventListener("change", refreshFundingPreview);
elements.fundingStrike.addEventListener("input", refreshFundingPreview);
elements.fundingQuantity.addEventListener("input", refreshFundingPreview);
elements.fundingPrice.addEventListener("input", refreshFundingPreview);
elements.fundingFee.addEventListener("input", refreshFundingPreview);
elements.fundingMatchTrade.addEventListener("change", refreshFundingPreview);
elements.cancelEditButton.addEventListener("click", resetForm);
elements.fundingCancelEditButton.addEventListener("click", resetFundingForm);
elements.addYearButton.addEventListener("click", addYear);

resetForm();
resetFundingForm();
disableNumberInputWheel();
switchTab("tfsa");
loadYear().catch(showError);
loadFunding().catch(showError);
