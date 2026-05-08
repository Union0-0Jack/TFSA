"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  addFundingFlow,
  addTransaction,
  calculateFundingSummary,
  calculateTradeCashAmount,
  calculateYearSummary,
  createEmptyData,
  deleteFundingFlow,
  deleteTransaction,
  ensureDataShape,
  getOrCreateYear,
  setFundingStartingBalance,
  setStartingContributionRoom,
  updateFundingFlow,
  updateTransaction,
} = require("../lib/tfsa");

test("empty year initializes cleanly", () => {
  const data = createEmptyData();
  const yearData = getOrCreateYear(data, 2026);
  const summary = calculateYearSummary(yearData);

  assert.equal(summary.remainingRoom, 0);
  assert.equal(summary.transactions.length, 0);
  assert.equal(summary.isOverLimit, false);
});

test("contributions reduce remaining room and trigger near limit", () => {
  const data = createEmptyData();
  setStartingContributionRoom(data, 2026, 7000);
  addTransaction(data, 2026, {
    id: "a",
    date: "2026-01-01",
    type: "contribution",
    amount: 6500,
    note: "",
  });

  const summary = calculateYearSummary(getOrCreateYear(data, 2026));
  assert.equal(summary.contributions, 6500);
  assert.equal(summary.remainingRoom, 500);
  assert.equal(summary.isNearLimit, true);
});

test("withdrawals do not restore same-year room", () => {
  const data = createEmptyData();
  setStartingContributionRoom(data, 2026, 7000);
  addTransaction(data, 2026, {
    id: "a",
    date: "2026-01-01",
    type: "contribution",
    amount: 7000,
    note: "",
  });
  addTransaction(data, 2026, {
    id: "b",
    date: "2026-02-01",
    type: "withdrawal",
    amount: 1200,
    note: "",
  });

  const summary = calculateYearSummary(getOrCreateYear(data, 2026));
  assert.equal(summary.remainingRoom, 0);
  assert.equal(summary.nextYearRestoration, 1200);
});

test("over-contribution is surfaced", () => {
  const data = createEmptyData();
  setStartingContributionRoom(data, 2026, 7000);
  addTransaction(data, 2026, {
    id: "a",
    date: "2026-03-01",
    type: "contribution",
    amount: 7200,
    note: "",
  });

  const summary = calculateYearSummary(getOrCreateYear(data, 2026));
  assert.equal(summary.isOverLimit, true);
  assert.equal(summary.overContribution, 200);
});

test("edit and delete recompute correctly", () => {
  const data = createEmptyData();
  setStartingContributionRoom(data, 2026, 7000);
  addTransaction(data, 2026, {
    id: "a",
    date: "2026-01-10",
    type: "contribution",
    amount: 3000,
    note: "",
  });
  addTransaction(data, 2026, {
    id: "b",
    date: "2026-02-10",
    type: "contribution",
    amount: 1000,
    note: "",
  });

  updateTransaction(data, 2026, "a", {
    date: "2026-01-10",
    type: "contribution",
    amount: 2500,
    note: "updated",
  });
  deleteTransaction(data, 2026, "b");

  const summary = calculateYearSummary(getOrCreateYear(data, 2026));
  assert.equal(summary.contributions, 2500);
  assert.equal(summary.remainingRoom, 4500);
  assert.equal(summary.transactions.length, 1);
});

test("funding balance tracks initial balance, inflows, and outflows", () => {
  const data = createEmptyData();
  setFundingStartingBalance(data, 10000);
  addFundingFlow(data, {
    id: "a",
    date: "2026-01-01",
    type: "inflow",
    amount: 2500,
    note: "",
  });
  addFundingFlow(data, {
    id: "b",
    date: "2026-02-01",
    type: "outflow",
    amount: 1200,
    note: "",
  });

  const summary = calculateFundingSummary(data.funding);
  assert.equal(summary.inflows, 2500);
  assert.equal(summary.outflows, 1200);
  assert.equal(summary.currentBalance, 11300);
});

test("funding edit and delete recompute correctly", () => {
  const data = createEmptyData();
  setFundingStartingBalance(data, 5000);
  addFundingFlow(data, {
    id: "a",
    date: "2026-01-01",
    type: "inflow",
    amount: 1000,
    note: "",
  });
  addFundingFlow(data, {
    id: "b",
    date: "2026-01-02",
    type: "outflow",
    amount: 500,
    note: "",
  });

  updateFundingFlow(data, "a", {
    date: "2026-01-01",
    type: "inflow",
    amount: 1500,
    note: "updated",
  });
  deleteFundingFlow(data, "b");

  const summary = calculateFundingSummary(data.funding);
  assert.equal(summary.currentBalance, 6500);
  assert.equal(summary.flows.length, 1);
});

test("old data without funding is normalized", () => {
  const data = ensureDataShape({ years: {} });
  const summary = calculateFundingSummary(data.funding);

  assert.equal(summary.startingBalance, 0);
  assert.equal(summary.currentBalance, 0);
  assert.equal(summary.flows.length, 0);
});

test("funding and yearly contribution data are independent", () => {
  const data = createEmptyData();
  setStartingContributionRoom(data, 2026, 7000);
  setFundingStartingBalance(data, 10000);
  addFundingFlow(data, {
    id: "a",
    date: "2026-01-01",
    type: "outflow",
    amount: 3000,
    note: "invested",
  });

  const yearSummary = calculateYearSummary(getOrCreateYear(data, 2026));
  const fundingSummary = calculateFundingSummary(data.funding);

  assert.equal(yearSummary.remainingRoom, 7000);
  assert.equal(yearSummary.contributions, 0);
  assert.equal(fundingSummary.currentBalance, 7000);
});

test("stock trades compute cash flow and realized profit with fees", () => {
  const data = createEmptyData();
  setFundingStartingBalance(data, 10000);
  addFundingFlow(data, {
    id: "buy",
    date: "2026-04-01",
    assetType: "stock",
    side: "buy",
    ticker: "DXYZ",
    quantity: 30,
    price: 10,
    fee: 1,
    type: "outflow",
    amount: 301,
    cashAmount: 301,
    note: "",
    matchedTradeId: "",
  });
  addFundingFlow(data, {
    id: "sell",
    date: "2026-04-02",
    assetType: "stock",
    side: "sell",
    ticker: "DXYZ",
    quantity: 10,
    price: 12,
    fee: 1,
    type: "inflow",
    amount: 119,
    cashAmount: 119,
    note: "",
    matchedTradeId: "buy",
  });

  const summary = calculateFundingSummary(data.funding);
  const buy = summary.flows.find((flow) => flow.id === "buy");
  const sell = summary.flows.find((flow) => flow.id === "sell");

  assert.equal(summary.outflows, 301);
  assert.equal(summary.inflows, 119);
  assert.equal(summary.currentBalance, 9818);
  assert.equal(buy.openQuantity, 20);
  assert.equal(sell.allocatedCost, 100.33);
  assert.equal(sell.realizedProfit, 18.67);
  assert.equal(summary.realizedProfit, 18.67);
});

test("option trades use a 100 multiplier for cash flow", () => {
  const buy = {
    assetType: "option",
    side: "buy",
    ticker: "QCOM",
    expiryDate: "2026-05-15",
    optionType: "call",
    strike: 300,
    quantity: 2,
    price: 1.25,
    fee: 1.5,
  };
  const sell = {
    ...buy,
    side: "sell",
    quantity: 1,
    price: 1.6,
    fee: 1,
  };

  assert.equal(calculateTradeCashAmount(buy), 251.5);
  assert.equal(calculateTradeCashAmount(sell), 159);
});

test("one buy can be partially matched by multiple sells", () => {
  const data = createEmptyData();
  addFundingFlow(data, {
    id: "buy",
    date: "2026-04-01",
    assetType: "option",
    side: "buy",
    ticker: "QCOM",
    expiryDate: "2026-05-15",
    optionType: "call",
    strike: 300,
    quantity: 3,
    price: 1,
    fee: 0,
    type: "outflow",
    amount: 300,
    cashAmount: 300,
    note: "",
    matchedTradeId: "",
  });
  addFundingFlow(data, {
    id: "sell-a",
    date: "2026-04-02",
    assetType: "option",
    side: "sell",
    ticker: "QCOM",
    expiryDate: "2026-05-15",
    optionType: "call",
    strike: 300,
    quantity: 1,
    price: 1.5,
    fee: 0,
    type: "inflow",
    amount: 150,
    cashAmount: 150,
    note: "",
    matchedTradeId: "buy",
  });
  addFundingFlow(data, {
    id: "sell-b",
    date: "2026-04-03",
    assetType: "option",
    side: "sell",
    ticker: "QCOM",
    expiryDate: "2026-05-15",
    optionType: "call",
    strike: 300,
    quantity: 1,
    price: 0.8,
    fee: 0,
    type: "inflow",
    amount: 80,
    cashAmount: 80,
    note: "",
    matchedTradeId: "buy",
  });

  const summary = calculateFundingSummary(data.funding);
  const buy = summary.flows.find((flow) => flow.id === "buy");
  const firstSell = summary.flows.find((flow) => flow.id === "sell-a");
  const secondSell = summary.flows.find((flow) => flow.id === "sell-b");

  assert.equal(buy.matchedQuantity, 2);
  assert.equal(buy.openQuantity, 1);
  assert.equal(firstSell.realizedProfit, 50);
  assert.equal(secondSell.realizedProfit, -20);
  assert.equal(summary.realizedProfit, 30);
});

test("unmatched sells count as inflows without realized profit", () => {
  const data = createEmptyData();
  addFundingFlow(data, {
    id: "sell",
    date: "2026-04-02",
    assetType: "stock",
    side: "sell",
    ticker: "DXYZ",
    quantity: 10,
    price: 12,
    fee: 1,
    type: "inflow",
    amount: 119,
    cashAmount: 119,
    note: "",
    matchedTradeId: "",
  });

  const summary = calculateFundingSummary(data.funding);
  const sell = summary.flows.find((flow) => flow.id === "sell");

  assert.equal(summary.inflows, 119);
  assert.equal(summary.realizedProfit, 0);
  assert.equal(sell.realizedProfit, undefined);
});

test("old funding flows remain compatible with trade flows", () => {
  const data = ensureDataShape({
    funding: {
      startingBalance: 1000,
      flows: [
        {
          id: "legacy",
          date: "2026-04-01",
          type: "outflow",
          amount: 100,
          note: "old format",
        },
        {
          id: "trade",
          date: "2026-04-02",
          assetType: "stock",
          side: "buy",
          ticker: "amkr",
          quantity: 10,
          price: 2,
          fee: 1,
          note: "",
        },
      ],
    },
    years: {},
  });

  const summary = calculateFundingSummary(data.funding);
  const trade = summary.flows.find((flow) => flow.id === "trade");

  assert.equal(summary.outflows, 121);
  assert.equal(summary.currentBalance, 879);
  assert.equal(trade.ticker, "AMKR");
  assert.equal(trade.cashAmount, 21);
});
