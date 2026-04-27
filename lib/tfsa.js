"use strict";

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
      startingBalance: 0,
      flows: [],
    },
    years: {},
  };
}

function ensureDataShape(input) {
  const base = input && typeof input === "object" ? input : {};
  const rawFunding = base.funding && typeof base.funding === "object" ? base.funding : {};
  const fundingFlows = Array.isArray(rawFunding.flows)
    ? rawFunding.flows
        .filter(Boolean)
        .map((flow) => ({
          id: String(flow.id),
          date: String(flow.date),
          type: flow.type === "outflow" ? "outflow" : "inflow",
          amount: Number(flow.amount) || 0,
          note: typeof flow.note === "string" ? flow.note : "",
        }))
    : [];
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
    funding: {
      startingBalance: Number(rawFunding.startingBalance) || 0,
      flows: fundingFlows,
    },
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

function calculateFundingSummary(funding) {
  const flows = sortFlowsDesc(funding.flows);
  const totals = flows.reduce(
    (accumulator, flow) => {
      if (flow.type === "outflow") {
        accumulator.outflows += flow.amount;
      } else {
        accumulator.inflows += flow.amount;
      }
      return accumulator;
    },
    { inflows: 0, outflows: 0 }
  );

  return {
    startingBalance: funding.startingBalance,
    inflows: totals.inflows,
    outflows: totals.outflows,
    currentBalance: funding.startingBalance + totals.inflows - totals.outflows,
    flows,
  };
}

function setFundingStartingBalance(data, amount) {
  data.funding.startingBalance = amount;
  return data.funding;
}

function addFundingFlow(data, flow) {
  data.funding.flows.push(flow);
  return data.funding;
}

function updateFundingFlow(data, flowId, updates) {
  const index = data.funding.flows.findIndex((flow) => flow.id === flowId);

  if (index === -1) {
    return null;
  }

  data.funding.flows[index] = {
    ...data.funding.flows[index],
    ...updates,
  };

  return data.funding.flows[index];
}

function deleteFundingFlow(data, flowId) {
  const nextFlows = data.funding.flows.filter((flow) => flow.id !== flowId);

  if (nextFlows.length === data.funding.flows.length) {
    return false;
  }

  data.funding.flows = nextFlows;
  return true;
}

module.exports = {
  addFundingFlow,
  addTransaction,
  calculateFundingSummary,
  calculateYearSummary,
  createEmptyData,
  deleteFundingFlow,
  deleteTransaction,
  ensureDataShape,
  getOrCreateYear,
  setFundingStartingBalance,
  setStartingContributionRoom,
  sortFlowsDesc,
  sortTransactionsDesc,
  updateFundingFlow,
  updateTransaction,
};
