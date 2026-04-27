"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  addTransaction,
  calculateYearSummary,
  createEmptyData,
  deleteTransaction,
  getOrCreateYear,
  setStartingContributionRoom,
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
