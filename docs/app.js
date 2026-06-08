const state = {
  activeTab: "funding",
  selectedYear: new Date().getFullYear(),
  availableYears: [],
  summary: null,
  yearData: null,
  filter: "all",
  fundingAccounts: [],
  selectedFundingAccountId: "",
  fundingSummary: null,
  fundingFilter: "all",
  fundingSearch: "",
  fundingSortMode: "trade",
  fundingStatusFilter: "all",
};

const STATIC_MODE = Boolean(window.TFSA_STATIC_MODE);
let staticDataPromise = null;

const elements = {
  addYearButton: document.querySelector("#add-year-button"),
  cancelEditButton: document.querySelector("#cancel-edit-button"),
  dataPath: document.querySelector("#data-path"),
  editingId: document.querySelector("#editing-id"),
  exitButton: document.querySelector("#exit-button"),
  fundingAccountSelect: document.querySelector("#funding-account-select"),
  fundingAddAccountButton: document.querySelector("#funding-add-account-button"),
  fundingBalanceForm: document.querySelector("#funding-balance-form"),
  fundingCancelEditButton: document.querySelector("#funding-cancel-edit-button"),
  fundingCloseFields: document.querySelector("#funding-close-fields"),
  fundingCloseReason: document.querySelector("#funding-close-reason"),
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
  fundingHistorySearch: document.querySelector("#funding-history-search"),
  fundingMatchEnabled: document.querySelector("#funding-match-enabled"),
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
  fundingRenameAccountButton: document.querySelector("#funding-rename-account-button"),
  fundingSide: document.querySelector("#funding-side"),
  fundingStartingBalance: document.querySelector("#funding-starting-balance"),
  fundingStatusPill: document.querySelector("#funding-status-pill"),
  fundingStrike: document.querySelector("#funding-strike"),
  fundingSubmitButton: document.querySelector("#funding-submit-button"),
  fundingSummaryGrid: document.querySelector("#funding-summary-grid"),
  fundingTicker: document.querySelector("#funding-ticker"),
  fundingSortMode: document.querySelector("#funding-sort-mode"),
  fundingStatusFilter: document.querySelector("#funding-status-filter"),
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

function isWorthlessOptionExpiration(flow) {
  return flow?.assetType === "option" && flow?.side === "sell" && flow?.closeReason === "expired_worthless";
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
    closeReason: elements.fundingCloseReason.value,
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
  if (STATIC_MODE) {
    return staticRequest(url, options);
  }

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

async function getStaticData() {
  if (!staticDataPromise) {
    staticDataPromise = fetch("static-data.json").then(async (response) => {
      if (!response.ok) {
        throw new Error("无法载入 GitHub Pages 静态数据。");
      }
      return response.json();
    });
  }

  return staticDataPromise;
}

async function staticRequest(url, options = {}) {
  const method = options.method || "GET";
  if (method !== "GET") {
    throw new Error("GitHub Pages 共享版为只读，不能保存或删除记录。");
  }

  const staticData = await getStaticData();
  const parsedUrl = new URL(url, window.location.href);

  if (parsedUrl.pathname.endsWith("/api/data")) {
    const requestedYear = Number(parsedUrl.searchParams.get("year"));
    const selectedYear =
      staticData.yearPayloads[String(requestedYear)]
        ? requestedYear
        : staticData.defaultYear;

    return {
      selectedYear,
      dataFile: `静态快照：${staticData.generatedAt}`,
      availableYears: staticData.availableYears,
      ...staticData.yearPayloads[String(selectedYear)],
    };
  }

  if (parsedUrl.pathname.endsWith("/api/funding")) {
    const requestedAccountId = parsedUrl.searchParams.get("accountId") || staticData.defaultFundingAccountId;
    return (
      staticData.fundingPayloads?.[requestedAccountId] ||
      staticData.fundingPayloads?.[staticData.defaultFundingAccountId] ||
      staticData.fundingPayload
    );
  }

  throw new Error("GitHub Pages 共享版没有这个接口。");
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

function renderFundingAccounts(payload) {
  state.fundingAccounts = payload.fundingAccounts || [];
  state.selectedFundingAccountId = payload.activeAccountId || state.fundingAccounts[0]?.id || "";

  elements.fundingAccountSelect.innerHTML = "";
  for (const account of state.fundingAccounts) {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.name;
    option.selected = account.id === state.selectedFundingAccountId;
    elements.fundingAccountSelect.append(option);
  }
}

function getSelectedFundingAccount() {
  return (
    state.fundingAccounts.find((account) => account.id === state.selectedFundingAccountId) ||
    null
  );
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
  const accountName = summary.accountName || getSelectedFundingAccount()?.name || "当前账户";

  const stats = [
    { label: `${accountName} 初始余额`, value: currency(summary.startingBalance) },
    { label: "累计流入", value: currency(summary.inflows) },
    { label: "累计流出", value: currency(summary.outflows) },
    { label: "当前账户余额", value: currency(summary.currentBalance) },
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
  if (isWorthlessOptionExpiration(flow)) {
    return `${getInstrumentLabel(flow)} · ${formatNumber(flow.quantity)}${unit} · 无价值到期`;
  }
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
    if (isWorthlessOptionExpiration(flow)) {
      parts.push("无价值到期");
    }
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

function getFundingHistoryType(flow) {
  if (!isTradeFlow(flow)) {
    return flow.type === "inflow" ? "流入" : "流出";
  }

  if (isWorthlessOptionExpiration(flow)) {
    return "到期";
  }

  return flow.side === "buy" ? "买入" : "卖出";
}

function getSignedFundingAmount(flow) {
  return `${flow.type === "inflow" ? "+" : "-"}${currency(flow.amount)}`;
}

function getEntryFlows(entry) {
  return entry.kind === "group" ? [entry.buy, ...entry.sells] : [entry.flow];
}

function getEntryTradeDate(entry) {
  return getEntryFlows(entry)
    .map((flow) => flow.date)
    .sort((left, right) => right.localeCompare(left))[0] || "";
}

function getEntryExpiryDate(entry) {
  const optionExpiryDates = getEntryFlows(entry)
    .filter((flow) => isTradeFlow(flow) && flow.assetType === "option" && flow.expiryDate)
    .map((flow) => flow.expiryDate)
    .sort();
  return optionExpiryDates[0] || "";
}

function getEntrySortDate(entry) {
  if (state.fundingSortMode === "expiry") {
    return getEntryExpiryDate(entry) || getEntryTradeDate(entry);
  }
  return getEntryTradeDate(entry);
}

function getEntryMonthLabel(entry) {
  const date = getEntrySortDate(entry);
  if (!date) {
    return "未注明时间";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(new Date(`${date}T00:00:00`));
}

function getEntryStatus(entry) {
  if (entry.kind === "group") {
    return entry.buy.openQuantity > 0.000001 ? "open" : "closed";
  }

  const { flow } = entry;
  if (!isTradeFlow(flow)) {
    return "cash";
  }

  if (flow.side === "buy") {
    return flow.openQuantity > 0.000001 ? "open" : "closed";
  }

  return "closed";
}

function getEntryStatusLabel(status) {
  if (status === "open") {
    return "正在进行";
  }
  if (status === "closed") {
    return "已结算";
  }
  return "普通资金";
}

function getEntryStatusOrder(status) {
  if (status === "open") {
    return 0;
  }
  if (status === "closed") {
    return 1;
  }
  return 2;
}

function getFlowSearchText(flow) {
  return [
    getFundingHistoryType(flow),
    getFundingHistoryTitle(flow),
    getFundingHistoryDetail(flow),
    flow.ticker,
    flow.date,
    flow.expiryDate,
    flow.optionType,
    flow.strike,
    flow.note,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getEntrySearchText(entry) {
  return getEntryFlows(entry).map(getFlowSearchText).join(" ");
}

function getMatchedFundingGroups(flows) {
  const byId = new Map(flows.map((flow) => [flow.id, flow]));
  const sellsByBuyId = new Map();
  const groupedSellIds = new Set();

  for (const flow of flows) {
    if (!isTradeFlow(flow) || flow.side !== "sell" || !flow.matchedTradeId) {
      continue;
    }

    const buy = byId.get(flow.matchedTradeId);
    if (!buy || !isTradeFlow(buy) || buy.side !== "buy" || !sameInstrument(buy, flow)) {
      continue;
    }

    if (!sellsByBuyId.has(buy.id)) {
      sellsByBuyId.set(buy.id, []);
    }
    sellsByBuyId.get(buy.id).push(flow);
    groupedSellIds.add(flow.id);
  }

  return { sellsByBuyId, groupedSellIds };
}

function getFundingHistoryEntries(flows) {
  const { sellsByBuyId, groupedSellIds } = getMatchedFundingGroups(flows);
  const entries = [];

  for (const flow of flows) {
    if (groupedSellIds.has(flow.id)) {
      continue;
    }

    const sells = sellsByBuyId.get(flow.id) || [];
    if (isTradeFlow(flow) && flow.side === "buy" && sells.length > 0) {
      entries.push({
        kind: "group",
        buy: flow,
        sells: [...sells].sort((left, right) => left.date.localeCompare(right.date)),
      });
    } else {
      entries.push({ kind: "flow", flow });
    }
  }

  return entries;
}

function fundingEntryMatchesFilter(entry) {
  if (state.fundingFilter !== "all") {
    const hasMatchingCashFlow = getEntryFlows(entry).some((flow) => flow.type === state.fundingFilter);
    if (!hasMatchingCashFlow) {
      return false;
    }
  }

  if (state.fundingStatusFilter !== "all" && getEntryStatus(entry) !== state.fundingStatusFilter) {
    return false;
  }

  if (!state.fundingSearch) {
    return true;
  }

  return getEntrySearchText(entry).includes(state.fundingSearch);
}

function compareFundingEntries(left, right) {
  const statusOrder = getEntryStatusOrder(getEntryStatus(left)) - getEntryStatusOrder(getEntryStatus(right));
  if (statusOrder !== 0) {
    return statusOrder;
  }

  const leftDate = getEntrySortDate(left);
  const rightDate = getEntrySortDate(right);
  if (leftDate !== rightDate) {
    if (state.fundingSortMode === "expiry") {
      return leftDate.localeCompare(rightDate);
    }
    return rightDate.localeCompare(leftDate);
  }

  const leftLabel = getEntrySearchText(left);
  const rightLabel = getEntrySearchText(right);
  return leftLabel.localeCompare(rightLabel);
}

function attachFundingFlowActions(item, flow) {
  const editButton = item.querySelector('[data-action="edit"]');
  editButton.hidden = !isTradeFlow(flow);
  editButton.addEventListener("click", () => {
    startFundingEdit(flow);
  });
  item.querySelector('[data-action="delete"]').addEventListener("click", () => {
    deleteFundingFlow(flow.id);
  });
}

function renderFundingFlowItem(flow, options = {}) {
  const fragment = elements.fundingHistoryItemTemplate.content.cloneNode(true);
  const item = fragment.querySelector(".history-item");
  const detail = fragment.querySelector(".history-detail");
  const status = getEntryStatus({ kind: "flow", flow });
  const meta = fragment.querySelector(".history-meta");
  const badge = document.createElement("span");
  badge.className = `history-status history-status-${status}`;
  badge.textContent = getEntryStatusLabel(status);

  fragment.querySelector(".history-type").textContent = getFundingHistoryType(flow);
  meta.append(badge);
  fragment.querySelector(".history-date").textContent = formatDate(flow.date);
  fragment.querySelector(".history-amount").textContent = getSignedFundingAmount(flow);
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
  item.classList.toggle("history-child", options.child === true);
  attachFundingFlowActions(item, flow);
  return fragment;
}

function renderFundingGroupItem(entry) {
  const { buy, sells } = entry;
  const status = getEntryStatus(entry);
  const details = document.createElement("details");
  details.className = "history-item history-group";
  details.dataset.id = buy.id;

  const summary = document.createElement("summary");
  summary.className = "history-group-summary";

  const main = document.createElement("div");
  main.className = "history-main";

  const meta = document.createElement("div");
  meta.className = "history-meta";

  const type = document.createElement("span");
  type.className = "history-type";
  type.textContent = "匹配组合";

  const badge = document.createElement("span");
  badge.className = `history-status history-status-${status}`;
  badge.textContent = getEntryStatusLabel(status);

  const date = document.createElement("time");
  date.className = "history-date";
  const firstSellDate = sells[0]?.date || buy.date;
  const lastSellDate = sells[sells.length - 1]?.date || buy.date;
  date.textContent = `${formatDate(buy.date)} - ${formatDate(lastSellDate || firstSellDate)}`;

  meta.append(type, badge, date);

  const profit = sells.reduce(
    (total, flow) => total + (Number.isFinite(flow.realizedProfit) ? flow.realizedProfit : 0),
    0
  );
  const netCash = sells.reduce((total, flow) => total + flow.amount, 0) - buy.amount;
  const amount = document.createElement("strong");
  amount.className = "history-amount";
  amount.textContent = `净 ${currency(netCash)}`;

  const note = document.createElement("p");
  note.className = "history-note";
  const expiryText = buy.assetType === "option" ? ` · 到期 ${formatDate(buy.expiryDate)}` : "";
  note.textContent = `${getInstrumentLabel(buy)}${expiryText} · 买入 ${formatNumber(buy.quantity)}，已匹配 ${formatNumber(buy.matchedQuantity)}，剩余 ${formatNumber(buy.openQuantity)}`;

  const detail = document.createElement("p");
  detail.className = "history-detail";
  detail.textContent = `匹配 ${sells.length} 条 · 盈亏 ${currency(profit)}`;

  main.append(meta, amount, note, detail);

  const toggle = document.createElement("span");
  toggle.className = "history-expand";
  toggle.textContent = "详情";

  summary.append(main, toggle);
  details.append(summary);

  const children = document.createElement("div");
  children.className = "history-group-children";
  children.append(renderFundingFlowItem(buy, { child: true }));
  for (const sell of sells) {
    children.append(renderFundingFlowItem(sell, { child: true }));
  }
  details.append(children);

  details.classList.toggle("profit", profit > 0);
  details.classList.toggle("loss", profit < 0);
  details.classList.toggle("outflow", netCash < 0);
  return details;
}

function renderFundingSectionHeader(status, month, entries) {
  const header = document.createElement("div");
  header.className = "history-section-heading";

  const title = document.createElement("strong");
  title.textContent = `${getEntryStatusLabel(status)} · ${month}`;

  const count = document.createElement("span");
  count.textContent = `${entries.length} 条`;

  header.append(title, count);
  return header;
}

function renderFundingHistory(summary) {
  const entries = getFundingHistoryEntries(summary.flows)
    .filter(fundingEntryMatchesFilter)
    .sort(compareFundingEntries);

  elements.fundingHistoryList.innerHTML = "";
  elements.fundingHistoryEmpty.hidden = entries.length > 0;
  elements.fundingHistoryEmpty.textContent =
    summary.flows.length === 0 ? "还没有资金流入或流出记录。" : "没有符合当前筛选条件的记录。";

  let currentSectionKey = "";
  for (const entry of entries) {
    const status = getEntryStatus(entry);
    const month = getEntryMonthLabel(entry);
    const sectionKey = `${status}:${month}`;
    if (sectionKey !== currentSectionKey) {
      const sectionEntries = entries.filter(
        (candidate) => getEntryStatus(candidate) === status && getEntryMonthLabel(candidate) === month
      );
      elements.fundingHistoryList.append(renderFundingSectionHeader(status, month, sectionEntries));
      currentSectionKey = sectionKey;
    }

    elements.fundingHistoryList.append(
      entry.kind === "group" ? renderFundingGroupItem(entry) : renderFundingFlowItem(entry.flow)
    );
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
  const summary = state.fundingSummary;

  elements.fundingPreviewPanel.className = "preview-panel";

  updateFundingFormVisibility();

  const draft = getDraftTrade();
  const isWorthlessExpiration = isWorthlessOptionExpiration(draft);
  const hasValidPrice =
    Number.isFinite(draft.price) && draft.price >= 0 && (isWorthlessExpiration || draft.price > 0);

  if (
    !summary ||
    !Number.isFinite(draft.quantity) ||
    !hasValidPrice ||
    draft.quantity <= 0 ||
    draft.fee < 0
  ) {
    elements.fundingPreviewPanel.textContent = isWorthlessExpiration
      ? "选择买入记录并输入到期份数后，这里会显示归零到期的亏损预估。"
      : "输入数量和成交价后，这里会显示现金流、余额和匹配预估。";
    return;
  }

  const amount = getTradeCashAmount(draft);
  if (amount < 0 || (amount === 0 && !isWorthlessExpiration)) {
    elements.fundingPreviewPanel.textContent = "扣除手续费后的现金金额必须大于 0。";
    elements.fundingPreviewPanel.classList.add("danger");
    return;
  }

  if (isWorthlessExpiration && draft.fee !== 0) {
    elements.fundingPreviewPanel.textContent = "无价值到期没有成交现金流，手续费请填 0。";
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
      elements.fundingPreviewPanel.textContent = isWorthlessExpiration
        ? "无价值到期需要匹配对应买入记录，才能扣减持仓并计算亏损。"
        : `${cashText}，预计资金余额 ${currency(currentBalance)}。未匹配买入记录，本次不会计算盈亏。`;
      elements.fundingPreviewPanel.classList.add("warn");
      return;
    }

    const allocatedCost = (match.cashAmount * draft.quantity) / match.quantity;
    const profit = amount - allocatedCost;
    elements.fundingPreviewPanel.textContent = isWorthlessExpiration
      ? `无现金流，预计资金余额 ${currency(currentBalance)}，本次亏损 ${currency(Math.abs(profit))}。`
      : `${cashText}，预计资金余额 ${currency(currentBalance)}，本次盈亏 ${currency(profit)}。`;
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

  const assetType = elements.fundingAssetType.value;
  if (elements.fundingSide.value !== "sell" || elements.fundingMatchEnabled.value !== "yes") {
    return [];
  }

  const current = getEditingFundingFlow();
  return state.fundingSummary.flows
    .filter((flow) => {
      if (!isTradeFlow(flow) || flow.side !== "buy" || flow.assetType !== assetType) {
        return false;
      }

      if (flow.id === current?.id) {
        return false;
      }

      const editingQuantity =
        current?.side === "sell" && current.matchedTradeId === flow.id ? current.quantity : 0;
      return flow.openQuantity + editingQuantity > 0;
    })
    .sort(compareCandidateMatches);
}

function compareCandidateMatches(left, right) {
  if (left.assetType === "option" && right.assetType === "option") {
    const expiryOrder = left.expiryDate.localeCompare(right.expiryDate);
    if (expiryOrder !== 0) {
      return expiryOrder;
    }
  }

  const tickerOrder = left.ticker.localeCompare(right.ticker);
  if (tickerOrder !== 0) {
    return tickerOrder;
  }

  if (left.assetType === "option" && right.assetType === "option") {
    const strikeOrder = Number(left.strike) - Number(right.strike);
    if (strikeOrder !== 0) {
      return strikeOrder;
    }

    const typeOrder = left.optionType.localeCompare(right.optionType);
    if (typeOrder !== 0) {
      return typeOrder;
    }
  }

  return left.date.localeCompare(right.date);
}

function getSelectedMatch() {
  if (!state.fundingSummary || !elements.fundingMatchTrade.value) {
    return null;
  }

  return state.fundingSummary.flows.find((flow) => flow.id === elements.fundingMatchTrade.value) || null;
}

function applySelectedMatchToForm() {
  const match = getSelectedMatch();
  if (!match) {
    return;
  }

  elements.fundingAssetType.value = match.assetType;
  elements.fundingTicker.value = match.ticker;
  elements.fundingExpiryDate.value = match.expiryDate || "";
  elements.fundingOptionType.value = match.optionType || "call";
  elements.fundingStrike.value = match.strike || "";
  updateFundingFormVisibility();
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
    elements.fundingMatchHelp.textContent = `已填入 ${getInstrumentLabel(selected)}，可匹配数量 ${formatNumber(selected.openQuantity + editingQuantity)}，买入总成本 ${currency(selected.cashAmount)}。标的信息仍可手动修改。`;
  } else if (matches.length === 0) {
    elements.fundingMatchHelp.textContent = "当前标的类型没有可匹配买入；可改为不匹配后保存卖出，但不会计算本次盈亏。";
  } else {
    elements.fundingMatchHelp.textContent = "选择买入记录后会自动填入标的信息并计算本次盈亏，字段仍可手动修改。";
  }
}

function updateFundingFormVisibility() {
  const isOption = elements.fundingAssetType.value === "option";
  const isSell = elements.fundingSide.value === "sell";
  const canExpireWorthless = isOption && isSell;

  if (!canExpireWorthless) {
    elements.fundingCloseReason.value = "";
  }

  if (elements.fundingCloseReason.value === "expired_worthless") {
    elements.fundingMatchEnabled.value = "yes";
    elements.fundingPrice.value = "0";
    elements.fundingFee.value = "0";
  }

  const isMatching = isSell && elements.fundingMatchEnabled.value === "yes";

  elements.fundingOptionFields.hidden = !isOption;
  elements.fundingMatchFields.hidden = !isMatching;
  elements.fundingCloseFields.hidden = !canExpireWorthless;
  elements.fundingQuantityLabel.textContent = isOption ? "份数" : "股数";
  elements.fundingQuantity.placeholder = isOption ? "例如 1" : "例如 100";

  if (isMatching) {
    updateFundingMatchOptions();
  } else {
    elements.fundingMatchTrade.value = "";
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
  elements.fundingCloseReason.value = "";
  elements.fundingMatchEnabled.value = "no";
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
    elements.fundingCloseReason.value = flow.closeReason || "";
    elements.fundingExpiryDate.value = flow.expiryDate || "";
    elements.fundingOptionType.value = flow.optionType || "call";
    elements.fundingStrike.value = flow.strike || "";
    elements.fundingMatchEnabled.value = flow.matchedTradeId ? "yes" : "no";
    updateFundingFormVisibility();
    elements.fundingMatchTrade.value = flow.matchedTradeId || "";
  } else {
    elements.fundingAssetType.value = "stock";
    elements.fundingSide.value = flow.type === "inflow" ? "sell" : "buy";
    elements.fundingTicker.value = "";
    elements.fundingQuantity.value = "";
    elements.fundingPrice.value = "";
    elements.fundingFee.value = "0";
    elements.fundingCloseReason.value = "";
    elements.fundingExpiryDate.value = "";
    elements.fundingOptionType.value = "call";
    elements.fundingStrike.value = "";
    elements.fundingMatchEnabled.value = "no";
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

async function loadFunding(accountId = state.selectedFundingAccountId) {
  const query = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
  const payload = await request(`/api/funding${query}`);
  renderFundingAccounts(payload);
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
      accountId: state.selectedFundingAccountId,
      startingBalance: amount,
    }),
  });

  renderFundingAccounts(payload);
  state.fundingSummary = payload.fundingSummary;
  renderFundingSummary(payload.fundingSummary);
  renderFundingHistory(payload.fundingSummary);
  refreshFundingPreview();
}

async function submitFundingFlow(event) {
  event.preventDefault();
  const draft = getDraftTrade();

  const body = {
    accountId: state.selectedFundingAccountId,
    date: elements.fundingFlowDate.value,
    assetType: draft.assetType,
    side: draft.side,
    ticker: draft.ticker,
    quantity: draft.quantity,
    price: draft.price,
    fee: draft.fee,
    closeReason: draft.closeReason,
    note: elements.fundingFlowNote.value.trim(),
  };

  if (body.assetType === "option") {
    body.expiryDate = draft.expiryDate;
    body.optionType = draft.optionType;
    body.strike = draft.strike;
  }

  if (body.side === "sell" && elements.fundingMatchEnabled.value === "yes") {
    body.matchedTradeId = elements.fundingMatchTrade.value;
  }

  const isWorthlessExpiration = isWorthlessOptionExpiration(body);
  if (!body.date || !body.ticker || !Number.isFinite(body.quantity) || body.quantity <= 0 || !Number.isFinite(body.price) || body.price < 0 || (!isWorthlessExpiration && body.price <= 0) || body.fee < 0) {
    window.alert("请填写有效的日期、Ticker、数量、成交价和手续费。");
    return;
  }

  if (isWorthlessExpiration && (!body.matchedTradeId || body.price !== 0 || body.fee !== 0)) {
    window.alert("无价值到期需要匹配买入记录，成交价和手续费都应为 0。");
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

  renderFundingAccounts(payload);
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

  const accountQuery = state.selectedFundingAccountId
    ? `?accountId=${encodeURIComponent(state.selectedFundingAccountId)}`
    : "";
  const payload = await request(`/api/funding/flows/${flowId}${accountQuery}`, {
    method: "DELETE",
  });

  renderFundingAccounts(payload);
  state.fundingSummary = payload.fundingSummary;
  renderFundingSummary(payload.fundingSummary);
  renderFundingHistory(payload.fundingSummary);
  resetFundingForm();
}

async function addFundingAccount() {
  const input = window.prompt("输入新账户名称");
  const name = input?.trim();

  if (!name) {
    window.alert("账户名称不能为空。");
    return;
  }

  const payload = await request("/api/funding/accounts", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  renderFundingAccounts(payload);
  state.fundingSummary = payload.fundingSummary;
  renderFundingSummary(payload.fundingSummary);
  renderFundingHistory(payload.fundingSummary);
  resetFundingForm();
}

async function renameFundingAccount() {
  const account = getSelectedFundingAccount();
  if (!account) {
    return;
  }

  const input = window.prompt("输入账户新名称", account.name);
  const name = input?.trim();

  if (!name) {
    window.alert("账户名称不能为空。");
    return;
  }

  const payload = await request(`/api/funding/accounts/${encodeURIComponent(account.id)}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });

  renderFundingAccounts(payload);
  state.fundingSummary = payload.fundingSummary;
  renderFundingSummary(payload.fundingSummary);
  renderFundingHistory(payload.fundingSummary);
}

async function exitApp() {
  const confirmed = window.confirm("确定退出 TFSA 并关闭本地服务吗？");
  if (!confirmed) {
    return;
  }

  elements.exitButton.disabled = true;
  elements.exitButton.textContent = "Exiting";

  await request("/api/exit", {
    method: "POST",
    body: JSON.stringify({}),
  });

  document.body.innerHTML = '<main class="exit-screen"><h1>TFSA 已退出</h1><p>可以关闭这个浏览器标签页。</p></main>';
  window.close();
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

if (STATIC_MODE) {
  document.body.classList.add("static-readonly");
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
elements.fundingAccountSelect.addEventListener("change", (event) => {
  state.selectedFundingAccountId = event.target.value;
  resetFundingForm();
  loadFunding(state.selectedFundingAccountId).catch(showError);
});
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
elements.fundingStatusFilter.addEventListener("change", (event) => {
  state.fundingStatusFilter = event.target.value;
  if (state.fundingSummary) {
    renderFundingHistory(state.fundingSummary);
  }
});
elements.fundingSortMode.addEventListener("change", (event) => {
  state.fundingSortMode = event.target.value;
  if (state.fundingSummary) {
    renderFundingHistory(state.fundingSummary);
  }
});
elements.fundingHistorySearch.addEventListener("input", (event) => {
  state.fundingSearch = event.target.value.trim().toLowerCase();
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
elements.fundingAddAccountButton.addEventListener("click", () => {
  addFundingAccount().catch(showError);
});
elements.fundingRenameAccountButton.addEventListener("click", () => {
  renameFundingAccount().catch(showError);
});
elements.fundingFlowForm.addEventListener("submit", (event) => {
  submitFundingFlow(event).catch(showError);
});
elements.transactionAmount.addEventListener("input", refreshPreview);
elements.transactionType.addEventListener("change", refreshPreview);
elements.fundingAssetType.addEventListener("change", refreshFundingPreview);
elements.fundingMatchEnabled.addEventListener("change", () => {
  if (elements.fundingMatchEnabled.value === "yes") {
    elements.fundingSide.value = "sell";
  }
  refreshFundingPreview();
});
elements.fundingSide.addEventListener("change", () => {
  if (elements.fundingSide.value !== "sell") {
    elements.fundingMatchEnabled.value = "no";
  }
  refreshFundingPreview();
});
elements.fundingCloseReason.addEventListener("change", () => {
  if (elements.fundingCloseReason.value === "expired_worthless") {
    elements.fundingSide.value = "sell";
    elements.fundingMatchEnabled.value = "yes";
    elements.fundingPrice.value = "0";
    elements.fundingFee.value = "0";
  }
  refreshFundingPreview();
});
elements.fundingTicker.addEventListener("input", refreshFundingPreview);
elements.fundingExpiryDate.addEventListener("input", refreshFundingPreview);
elements.fundingOptionType.addEventListener("change", refreshFundingPreview);
elements.fundingStrike.addEventListener("input", refreshFundingPreview);
elements.fundingQuantity.addEventListener("input", refreshFundingPreview);
elements.fundingPrice.addEventListener("input", refreshFundingPreview);
elements.fundingFee.addEventListener("input", refreshFundingPreview);
elements.fundingMatchTrade.addEventListener("change", () => {
  applySelectedMatchToForm();
  refreshFundingPreview();
});
elements.cancelEditButton.addEventListener("click", resetForm);
elements.fundingCancelEditButton.addEventListener("click", resetFundingForm);
elements.addYearButton.addEventListener("click", addYear);
elements.exitButton.addEventListener("click", () => {
  exitApp().catch(showError);
});

resetForm();
resetFundingForm();
disableNumberInputWheel();
switchTab("funding");
loadYear().catch(showError);
loadFunding().catch(showError);
