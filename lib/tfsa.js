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
    years: {},
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

  return { years: normalizedYears };
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

module.exports = {
  addTransaction,
  calculateYearSummary,
  createEmptyData,
  deleteTransaction,
  ensureDataShape,
  getOrCreateYear,
  setStartingContributionRoom,
  sortTransactionsDesc,
  updateTransaction,
};
