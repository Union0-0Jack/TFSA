"use strict";

const DEFAULT_FUNDING_ACCOUNT_ID = "account-1";

function createEmptyYear(year) {
  return {
    year: Number(year),
    startingContributionRoom: 0,
    transactions: [],
  };
}

function createEmptyData() {
  return {
    funding: {
      activeAccountId: DEFAULT_FUNDING_ACCOUNT_ID,
      accounts: [createFundingAccount()],
    },
    years: {},
  };
}

function createFundingAccount(options = {}) {
  return {
    id: String(options.id || DEFAULT_FUNDING_ACCOUNT_ID),
    name: typeof options.name === "string" && options.name.trim() ? options.name.trim() : "账户 1",
    startingBalance: Number(options.startingBalance) || 0,
    flows: Array.isArray(options.flows) ? options.flows.filter(Boolean).map(normalizeFundingFlow) : [],
  };
}

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function roundQuantity(value) {
  return Number((Number(value) || 0).toFixed(6));
}

function isTradeFlow(flow) {
  return flow?.assetType === "stock" || flow?.assetType === "option";
}

function getContractMultiplier(flow) {
  return flow.assetType === "option" ? 100 : 1;
}

function calculateTradeCashAmount(flow) {
  const gross = Number(flow.price) * Number(flow.quantity) * getContractMultiplier(flow);
  const fee = Number(flow.fee) || 0;
  return roundMoney(flow.side === "buy" ? gross + fee : gross - fee);
}

function isWorthlessOptionExpiration(flow) {
  return flow?.assetType === "option" && flow?.side === "sell" && flow?.closeReason === "expired_worthless";
}

function normalizeFundingFlow(flow) {
  const assetType =
    flow.assetType === "option" ? "option" : flow.assetType === "stock" ? "stock" : null;

  if (!assetType) {
    return {
      id: String(flow.id),
      date: String(flow.date),
      type: flow.type === "outflow" ? "outflow" : "inflow",
      amount: Number(flow.amount) || 0,
      note: typeof flow.note === "string" ? flow.note : "",
    };
  }

  const side = flow.side === "sell" ? "sell" : "buy";
  const normalized = {
    id: String(flow.id),
    date: String(flow.date),
    assetType,
    side,
    ticker: typeof flow.ticker === "string" ? flow.ticker.trim().toUpperCase() : "",
    quantity: roundQuantity(flow.quantity),
    price: Number(flow.price) || 0,
    fee: roundMoney(flow.fee),
    closeReason: flow.closeReason === "expired_worthless" ? "expired_worthless" : "",
    note: typeof flow.note === "string" ? flow.note : "",
    matchedTradeId: typeof flow.matchedTradeId === "string" ? flow.matchedTradeId : "",
    strategyId: typeof flow.strategyId === "string" ? flow.strategyId : "",
    strategyType: flow.strategyType === "bull_call_spread" ? "bull_call_spread" : "",
    strategyLeg: flow.strategyLeg === "short_call" ? "short_call" : flow.strategyLeg === "long_call" ? "long_call" : "",
  };

  if (assetType === "option") {
    normalized.expiryDate = typeof flow.expiryDate === "string" ? flow.expiryDate : "";
    normalized.optionType = flow.optionType === "put" ? "put" : "call";
    normalized.strike = Number(flow.strike) || 0;
  }

  normalized.cashAmount = calculateTradeCashAmount(normalized);
  normalized.type = side === "buy" ? "outflow" : "inflow";
  normalized.amount = normalized.cashAmount;
  return normalized;
}

function normalizeFundingAccount(account, index) {
  return createFundingAccount({
    id: account?.id || `account-${index + 1}`,
    name:
      typeof account?.name === "string" && account.name.trim()
        ? account.name.trim()
        : `账户 ${index + 1}`,
    startingBalance: Number(account?.startingBalance) || 0,
    flows: Array.isArray(account?.flows) ? account.flows : [],
  });
}

function normalizeFunding(rawFunding) {
  const funding = rawFunding && typeof rawFunding === "object" ? rawFunding : {};
  const rawAccounts = Array.isArray(funding.accounts)
    ? funding.accounts
    : [
        {
          id: DEFAULT_FUNDING_ACCOUNT_ID,
          name: "账户 1",
          startingBalance: Number(funding.startingBalance) || 0,
          flows: Array.isArray(funding.flows) ? funding.flows : [],
        },
      ];
  const usedIds = new Set();
  const accounts = rawAccounts.filter(Boolean).map((account, index) => {
    const normalized = normalizeFundingAccount(account, index);
    let nextId = normalized.id;
    let suffix = index + 1;

    while (!nextId || usedIds.has(nextId)) {
      suffix += 1;
      nextId = `account-${suffix}`;
    }

    normalized.id = nextId;
    usedIds.add(nextId);
    return normalized;
  });

  if (accounts.length === 0) {
    accounts.push(createFundingAccount());
  }

  const requestedActiveId = typeof funding.activeAccountId === "string" ? funding.activeAccountId : "";
  const activeAccountId = accounts.some((account) => account.id === requestedActiveId)
    ? requestedActiveId
    : accounts[0].id;

  return {
    activeAccountId,
    accounts,
  };
}

function ensureDataShape(input) {
  const base = input && typeof input === "object" ? input : {};
  const years = base.years && typeof base.years === "object" ? base.years : {};
  const normalizedYears = {};

  for (const [yearKey, rawYear] of Object.entries(years)) {
    const year = Number(yearKey);
    const transactions = Array.isArray(rawYear?.transactions)
      ? rawYear.transactions
          .filter(Boolean)
          .map((transaction) => ({
            id: String(transaction.id),
            date: String(transaction.date),
            type: transaction.type === "withdrawal" ? "withdrawal" : "contribution",
            amount: Number(transaction.amount) || 0,
            note: typeof transaction.note === "string" ? transaction.note : "",
          }))
      : [];

    normalizedYears[yearKey] = {
      year,
      startingContributionRoom: Number(rawYear?.startingContributionRoom) || 0,
      transactions,
    };
  }

  return {
    funding: normalizeFunding(base.funding),
    years: normalizedYears,
  };
}

function getOrCreateYear(data, year) {
  const key = String(year);
  if (!data.years[key]) {
    data.years[key] = createEmptyYear(year);
  }
  return data.years[key];
}

function sortTransactionsDesc(transactions) {
  return [...transactions].sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }
    return right.id.localeCompare(left.id);
  });
}

function calculateYearSummary(yearData) {
  const transactions = sortTransactionsDesc(yearData.transactions);
  const totals = transactions.reduce(
    (accumulator, transaction) => {
      if (transaction.type === "withdrawal") {
        accumulator.withdrawals += transaction.amount;
      } else {
        accumulator.contributions += transaction.amount;
      }
      return accumulator;
    },
    { contributions: 0, withdrawals: 0 }
  );

  const remainingRoom = yearData.startingContributionRoom - totals.contributions;
  const overContribution = Math.max(0, -remainingRoom);
  const warningThreshold = yearData.startingContributionRoom * 0.1;
  const isNearLimit =
    yearData.startingContributionRoom > 0 &&
    remainingRoom >= 0 &&
    remainingRoom <= warningThreshold;

  return {
    year: yearData.year,
    startingContributionRoom: yearData.startingContributionRoom,
    contributions: totals.contributions,
    withdrawals: totals.withdrawals,
    remainingRoom,
    overContribution,
    nextYearRestoration: totals.withdrawals,
    isOverLimit: overContribution > 0,
    isNearLimit,
    transactions,
  };
}

function setStartingContributionRoom(data, year, amount) {
  const yearData = getOrCreateYear(data, year);
  yearData.startingContributionRoom = amount;
  return yearData;
}

function addTransaction(data, year, transaction) {
  const yearData = getOrCreateYear(data, year);
  yearData.transactions.push(transaction);
  return yearData;
}

function updateTransaction(data, year, transactionId, updates) {
  const yearData = getOrCreateYear(data, year);
  const index = yearData.transactions.findIndex((transaction) => transaction.id === transactionId);

  if (index === -1) {
    return null;
  }

  yearData.transactions[index] = {
    ...yearData.transactions[index],
    ...updates,
  };

  return yearData.transactions[index];
}

function deleteTransaction(data, year, transactionId) {
  const yearData = getOrCreateYear(data, year);
  const nextTransactions = yearData.transactions.filter(
    (transaction) => transaction.id !== transactionId
  );

  if (nextTransactions.length === yearData.transactions.length) {
    return false;
  }

  yearData.transactions = nextTransactions;
  return true;
}

function sortFlowsDesc(flows) {
  return [...flows].sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }
    return right.id.localeCompare(left.id);
  });
}

function sameInstrument(left, right) {
  if (!isTradeFlow(left) || !isTradeFlow(right)) {
    return false;
  }

  if (
    left.assetType !== right.assetType ||
    left.ticker !== right.ticker
  ) {
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

function isOppositeSide(left, right) {
  return isTradeFlow(left) && isTradeFlow(right) && left.side !== right.side;
}

function getInstrumentLabel(flow) {
  if (!isTradeFlow(flow)) {
    return "";
  }

  if (flow.assetType === "stock") {
    return flow.ticker;
  }

  const optionType = flow.optionType === "put" ? "Put" : "Call";
  return `${flow.ticker} ${flow.expiryDate} ${flow.strike}${optionType}`;
}

function enrichFundingFlows(flows) {
  const byId = new Map(flows.map((flow) => [flow.id, flow]));
  const matchedQuantities = new Map();

  for (const flow of flows) {
    if (!isTradeFlow(flow) || !flow.matchedTradeId) {
      continue;
    }

    const opener = byId.get(flow.matchedTradeId);
    if (!opener || !isOppositeSide(opener, flow) || !sameInstrument(opener, flow)) {
      continue;
    }

    matchedQuantities.set(
      opener.id,
      roundQuantity((matchedQuantities.get(opener.id) || 0) + flow.quantity)
    );
  }

  return flows.map((flow) => {
    if (!isTradeFlow(flow)) {
      return flow;
    }

    const enriched = {
      ...flow,
      instrumentLabel: getInstrumentLabel(flow),
      grossAmount: roundMoney(flow.price * flow.quantity * getContractMultiplier(flow)),
    };

    const matchedQuantity = matchedQuantities.get(flow.id) || 0;
    enriched.matchedQuantity = matchedQuantity;
    enriched.openQuantity = flow.matchedTradeId
      ? 0
      : roundQuantity(Math.max(0, flow.quantity - matchedQuantity));

    if (flow.matchedTradeId) {
      const opener = byId.get(flow.matchedTradeId);
      if (opener && isOppositeSide(opener, flow) && sameInstrument(opener, flow) && opener.quantity > 0) {
        const allocatedOpeningCash = roundMoney((opener.cashAmount * flow.quantity) / opener.quantity);
        enriched.matchedTradeLabel = getInstrumentLabel(opener);
        enriched.allocatedCost = allocatedOpeningCash;
        enriched.realizedProfit =
          opener.side === "buy"
            ? roundMoney(flow.cashAmount - allocatedOpeningCash)
            : roundMoney(allocatedOpeningCash - flow.cashAmount);
      }
    }

    return enriched;
  });
}

function calculateFundingSummary(funding) {
  const account = getFundingAccount(funding);
  const enrichedFlows = enrichFundingFlows(account.flows);
  const flows = sortFlowsDesc(enrichedFlows);
  const totals = flows.reduce(
    (accumulator, flow) => {
      if (flow.type === "outflow") {
        accumulator.outflows += flow.amount;
      } else {
        accumulator.inflows += flow.amount;
      }
      if (isTradeFlow(flow) && Number.isFinite(flow.realizedProfit)) {
        accumulator.realizedProfit += flow.realizedProfit;
        accumulator.closedTrades += 1;
        if (flow.realizedProfit > 0) {
          accumulator.winningTrades += 1;
        }
      }
      return accumulator;
    },
    { inflows: 0, outflows: 0, realizedProfit: 0, closedTrades: 0, winningTrades: 0 }
  );

  return {
    accountId: account.id,
    accountName: account.name,
    startingBalance: account.startingBalance,
    inflows: roundMoney(totals.inflows),
    outflows: roundMoney(totals.outflows),
    realizedProfit: roundMoney(totals.realizedProfit),
    realizedReturnRate:
      account.startingBalance > 0
        ? roundMoney((totals.realizedProfit / account.startingBalance) * 100)
        : 0,
    winRate:
      totals.closedTrades > 0
        ? roundMoney((totals.winningTrades / totals.closedTrades) * 100)
        : 0,
    closedTrades: totals.closedTrades,
    winningTrades: totals.winningTrades,
    currentBalance: roundMoney(account.startingBalance + totals.inflows - totals.outflows),
    flows,
  };
}

function getFundingAccounts(target) {
  const funding = target?.funding || target;
  if (!Array.isArray(funding?.accounts)) {
    return [];
  }
  return funding.accounts;
}

function getFundingAccount(target, accountId = "") {
  const funding = target?.funding || target;

  if (!Array.isArray(funding?.accounts)) {
    return funding || createFundingAccount();
  }

  if (accountId) {
    const selected = funding.accounts.find((account) => account.id === accountId);
    if (selected) {
      return selected;
    }
  }

  return (
    funding.accounts.find((account) => account.id === funding.activeAccountId) ||
    funding.accounts[0] ||
    createFundingAccount()
  );
}

function addFundingAccount(data, account) {
  const nextAccount = createFundingAccount({
    ...account,
    id: account.id,
    name: account.name,
    startingBalance: 0,
    flows: [],
  });
  data.funding.accounts.push(nextAccount);
  data.funding.activeAccountId = nextAccount.id;
  return nextAccount;
}

function renameFundingAccount(data, accountId, name) {
  const account = getFundingAccount(data, accountId);
  if (!account || account.id !== accountId) {
    return null;
  }
  account.name = name;
  data.funding.activeAccountId = account.id;
  return account;
}

function setFundingStartingBalance(data, amount, accountId = "") {
  const account = getFundingAccount(data, accountId);
  account.startingBalance = amount;
  data.funding.activeAccountId = account.id;
  return account;
}

function addFundingFlow(data, flow, accountId = "") {
  const account = getFundingAccount(data, accountId);
  account.flows.push(flow);
  data.funding.activeAccountId = account.id;
  return account;
}

function updateFundingFlow(data, flowId, updates, accountId = "") {
  const account = getFundingAccount(data, accountId);
  const index = account.flows.findIndex((flow) => flow.id === flowId);

  if (index === -1) {
    return null;
  }

  account.flows[index] = {
    ...account.flows[index],
    ...updates,
  };
  data.funding.activeAccountId = account.id;

  return account.flows[index];
}

function deleteFundingFlow(data, flowId, accountId = "") {
  const account = getFundingAccount(data, accountId);
  const nextFlows = account.flows.filter((flow) => flow.id !== flowId);

  if (nextFlows.length === account.flows.length) {
    return false;
  }

  account.flows = nextFlows;
  data.funding.activeAccountId = account.id;
  return true;
}

module.exports = {
  addFundingAccount,
  addFundingFlow,
  addTransaction,
  calculateFundingSummary,
  calculateTradeCashAmount,
  calculateYearSummary,
  createFundingAccount,
  createEmptyData,
  deleteFundingFlow,
  deleteTransaction,
  ensureDataShape,
  getFundingAccount,
  getFundingAccounts,
  getOrCreateYear,
  isTradeFlow,
  isWorthlessOptionExpiration,
  normalizeFundingFlow,
  renameFundingAccount,
  sameInstrument,
  setFundingStartingBalance,
  setStartingContributionRoom,
  sortFlowsDesc,
  sortTransactionsDesc,
  updateFundingFlow,
  updateTransaction,
};
