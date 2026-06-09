"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  addFundingAccount,
  addFundingFlow,
  addTransaction,
  calculateFundingSummary,
  calculateTradeCashAmount,
  calculateYearSummary,
  createEmptyData,
  deleteFundingFlow,
  deleteTransaction,
  ensureDataShape,
  getFundingAccount,
  getFundingAccounts,
  getOrCreateYear,
  isTradeFlow,
  renameFundingAccount,
  sameInstrument,
  setFundingStartingBalance,
  setStartingContributionRoom,
  updateFundingFlow,
  updateTransaction,
} = require("./lib/tfsa");

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "tfsa-data.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(createEmptyData(), null, 2));
  }
}

async function readData() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return ensureDataShape(JSON.parse(raw));
}

async function writeData(data) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validateYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2009 || year > 2100) {
    return null;
  }
  return year;
}

function validateAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }
  return Number(amount.toFixed(2));
}

function validateAccountName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    return null;
  }
  return name.slice(0, 40);
}

function validatePositiveNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return number;
}

function validateNonNegativeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }
  return number;
}

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function validateTransactionPayload(body) {
  const year = validateYear(body.year);
  const amount = validateAmount(body.amount);
  const type = body.type === "withdrawal" ? "withdrawal" : body.type === "contribution" ? "contribution" : null;
  const date = typeof body.date === "string" ? body.date : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!year) {
    return { error: "年份无效。" };
  }

  if (!date || Number.isNaN(Date.parse(date))) {
    return { error: "日期无效。" };
  }

  if (!type) {
    return { error: "交易类型无效。" };
  }

  if (amount === null || amount === 0) {
    return { error: "金额必须大于 0。" };
  }

  return {
    value: {
      year,
      date,
      type,
      amount,
      note,
    },
  };
}

function validateBullCallSpreadPayload(body) {
  const date = typeof body.date === "string" ? body.date : "";
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const expiryDate = typeof body.expiryDate === "string" ? body.expiryDate : "";
  const quantity = validatePositiveNumber(body.quantity);
  const longStrike = validatePositiveNumber(body.longStrike);
  const shortStrike = validatePositiveNumber(body.shortStrike);
  const longPrice = validatePositiveNumber(body.longPrice);
  const shortPrice = validatePositiveNumber(body.shortPrice);
  const fee = validateAmount(body.fee || 0);
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const matchedStrategyId = typeof body.matchedStrategyId === "string" ? body.matchedStrategyId : "";
  const closeReason = body.closeReason === "expired_worthless" ? "expired_worthless" : "";
  const isWorthlessExpiration = Boolean(matchedStrategyId) && closeReason === "expired_worthless";
  const normalizedLongPrice = isWorthlessExpiration ? validateNonNegativeNumber(body.longPrice) : longPrice;
  const normalizedShortPrice = isWorthlessExpiration ? validateNonNegativeNumber(body.shortPrice) : shortPrice;

  if (!date || Number.isNaN(Date.parse(date))) {
    return { error: "日期无效。" };
  }

  if (!ticker) {
    return { error: "Ticker 必填。" };
  }

  if (!expiryDate || Number.isNaN(Date.parse(expiryDate))) {
    return { error: "期权到期日无效。" };
  }

  if (quantity === null) {
    return { error: "合约份数必须大于 0。" };
  }

  if (longStrike === null || shortStrike === null || shortStrike <= longStrike) {
    return { error: "Bull Call 需要卖出 Call 行权价高于买入 Call 行权价。" };
  }

  if (normalizedLongPrice === null || normalizedShortPrice === null) {
    return { error: "两条腿的成交价都必须大于 0。" };
  }

  if (fee === null) {
    return { error: "手续费必须为 0 或正数。" };
  }

  if (isWorthlessExpiration && (normalizedLongPrice !== 0 || normalizedShortPrice !== 0 || fee !== 0)) {
    return { error: "无价值到期的两条成交价和手续费都必须为 0。" };
  }

  const grossLong = normalizedLongPrice * quantity * 100;
  const grossShort = normalizedShortPrice * quantity * 100;
  const netDebit = roundMoney(grossLong - grossShort + fee);
  const maxProfit = roundMoney((shortStrike - longStrike) * quantity * 100 - netDebit);

  if (!matchedStrategyId && netDebit <= 0) {
    return { error: "Bull Call 价差的净成本必须大于 0。" };
  }

  if (!matchedStrategyId && maxProfit <= 0) {
    return { error: "这个价差的最大收益不大于 0，请检查行权价、成交价或手续费。" };
  }

  return {
    value: {
      matchedStrategyId,
      closeReason: isWorthlessExpiration ? closeReason : "",
      date,
      ticker,
      expiryDate,
      quantity,
      longStrike,
      shortStrike,
      longPrice: normalizedLongPrice,
      shortPrice: normalizedShortPrice,
      fee,
      note,
    },
  };
}

function getBullCallSpreadOpeningLegs(account, strategyId) {
  const legs = account.flows.filter(
    (flow) =>
      isTradeFlow(flow) &&
      flow.strategyType === "bull_call_spread" &&
      flow.strategyId === strategyId &&
      !flow.matchedTradeId
  );
  const longCall = legs.find((flow) => flow.strategyLeg === "long_call");
  const shortCall = legs.find((flow) => flow.strategyLeg === "short_call");

  if (!longCall || !shortCall) {
    return null;
  }

  return { longCall, shortCall };
}

function getMatchedQuantity(flows, opener, ignoredFlowId = "") {
  return flows.reduce((total, flow) => {
    if (
      flow.id !== ignoredFlowId &&
      isTradeFlow(flow) &&
      flow.side !== opener.side &&
      flow.matchedTradeId === opener.id &&
      sameInstrument(opener, flow)
    ) {
      return total + flow.quantity;
    }
    return total;
  }, 0);
}

function validateLegacyFundingFlowPayload(body) {
  const amount = validateAmount(body.amount);
  const type = body.type === "outflow" ? "outflow" : body.type === "inflow" ? "inflow" : null;
  const date = typeof body.date === "string" ? body.date : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!date || Number.isNaN(Date.parse(date))) {
    return { error: "日期无效。" };
  }

  if (!type) {
    return { error: "资金类型无效。" };
  }

  if (amount === null || amount === 0) {
    return { error: "金额必须大于 0。" };
  }

  return {
    value: {
      date,
      type,
      amount,
      note,
    },
  };
}

function validateFundingFlowPayload(body, data, currentFlowId = "", accountId = "") {
  if (body.assetType !== "stock" && body.assetType !== "option") {
    return validateLegacyFundingFlowPayload(body);
  }

  const date = typeof body.date === "string" ? body.date : "";
  const assetType = body.assetType;
  const side = body.side === "sell" ? "sell" : body.side === "buy" ? "buy" : null;
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const quantity = validatePositiveNumber(body.quantity);
  const closeReason = body.closeReason === "expired_worthless" ? "expired_worthless" : "";
  const isWorthlessExpiration = assetType === "option" && side === "sell" && closeReason === "expired_worthless";
  const price = isWorthlessExpiration
    ? validateNonNegativeNumber(body.price)
    : validatePositiveNumber(body.price);
  const fee = validateAmount(body.fee || 0);
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const value = {
    date,
    assetType,
    side,
    ticker,
    quantity,
    price,
    fee,
    closeReason: isWorthlessExpiration ? closeReason : "",
    note,
    matchedTradeId: typeof body.matchedTradeId === "string" ? body.matchedTradeId : "",
  };

  if (!date || Number.isNaN(Date.parse(date))) {
    return { error: "日期无效。" };
  }

  if (!side) {
    return { error: "买卖方向无效。" };
  }

  if (!ticker) {
    return { error: "Ticker 必填。" };
  }

  if (quantity === null) {
    return { error: assetType === "option" ? "期权份数必须大于 0。" : "股票股数必须大于 0。" };
  }

  if (price === null) {
    return { error: isWorthlessExpiration ? "成交价必须为 0 或正数。" : "成交价必须大于 0。" };
  }

  if (fee === null) {
    return { error: "手续费必须为 0 或正数。" };
  }

  if (assetType === "option") {
    value.expiryDate = typeof body.expiryDate === "string" ? body.expiryDate : "";
    value.optionType = body.optionType === "put" ? "put" : body.optionType === "call" ? "call" : null;
    value.strike = validatePositiveNumber(body.strike);

    if (!value.expiryDate || Number.isNaN(Date.parse(value.expiryDate))) {
      return { error: "期权到期日无效。" };
    }

    if (!value.optionType) {
      return { error: "期权类型无效。" };
    }

    if (value.strike === null) {
      return { error: "行权价必须大于 0。" };
    }
  }

  value.cashAmount = calculateTradeCashAmount(value);
  value.type = side === "buy" ? "outflow" : "inflow";
  value.amount = value.cashAmount;

  if (isWorthlessExpiration && (!value.matchedTradeId || value.price !== 0 || value.fee !== 0 || value.amount !== 0)) {
    return { error: "无价值到期需要匹配买入记录，成交价和手续费都必须为 0。" };
  }

  if (value.amount < 0 || (value.amount === 0 && !isWorthlessExpiration)) {
    return { error: "扣除手续费后的现金金额必须大于 0。" };
  }

  const account = getFundingAccount(data, accountId);
  const flows = account.flows;

  if (value.matchedTradeId) {
    if (side !== "sell") {
      return { error: "单笔交易只能用卖出记录匹配买入记录。" };
    }

    const buy = flows.find((flow) => flow.id === value.matchedTradeId);
    if (!buy || !isTradeFlow(buy) || buy.side !== "buy") {
      return { error: "找不到可匹配的买入记录。" };
    }

    if (!sameInstrument(buy, value)) {
      return { error: "卖出交易必须匹配同一标的的买入记录。" };
    }

    const openQuantity = buy.quantity - getMatchedQuantity(flows, buy, currentFlowId);
    if (value.quantity > openQuantity + 0.000001) {
      return { error: `卖出数量超过可匹配数量，当前最多可卖 ${openQuantity}。` };
    }
  }

  if (side === "buy" && currentFlowId) {
    const matchedSells = flows.filter(
      (flow) => flow.id !== currentFlowId && isTradeFlow(flow) && flow.matchedTradeId === currentFlowId
    );
    const mismatchedSell = matchedSells.find((flow) => !sameInstrument(value, flow));

    if (mismatchedSell) {
      return { error: "这笔买入已被卖出记录匹配，不能改成不同标的。" };
    }

    const matchedQuantity = matchedSells.reduce((total, flow) => total + flow.quantity, 0);
    if (value.quantity < matchedQuantity - 0.000001) {
      return { error: `这笔买入已匹配 ${matchedQuantity}，数量不能小于已匹配数量。` };
    }
  }

  return { value };
}

function canDeleteFundingFlow(data, flowId, accountId = "") {
  const account = getFundingAccount(data, accountId);
  const flow = account.flows.find((candidate) => candidate.id === flowId);

  if (!flow || !isTradeFlow(flow)) {
    return { ok: true };
  }

  const hasMatchedSell = account.flows.some(
    (candidate) => isTradeFlow(candidate) && candidate.side !== flow.side && candidate.matchedTradeId === flowId
  );

  if (hasMatchedSell) {
    return { ok: false, error: "这笔开仓已有匹配平仓记录，请先删除或改掉平仓记录。" };
  }

  return { ok: true };
}

function buildYearPayload(data, year) {
  const yearData = getOrCreateYear(data, year);
  return {
    yearData,
    summary: calculateYearSummary(yearData),
  };
}

function buildFundingPayload(data) {
  return buildFundingAccountPayload(data);
}

function buildFundingAccountPayload(data, accountId = "") {
  const account = getFundingAccount(data, accountId);
  return {
    fundingAccounts: getFundingAccounts(data).map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
    })),
    activeAccountId: account.id,
    fundingAccount: {
      id: account.id,
      name: account.name,
      startingBalance: account.startingBalance,
    },
    fundingSummary: calculateFundingSummary(account),
  };
}

function validateFundingAccountSelection(data, accountId) {
  const account = getFundingAccount(data, accountId);
  if (accountId && account.id !== accountId) {
    return null;
  }
  return account;
}

function buildBullCallSpreadFlows(strategyId, value, matchedLegs = null) {
  const longFee = roundMoney(value.fee / 2);
  const shortFee = roundMoney(value.fee - longFee);
  const isClosingSpread = Boolean(matchedLegs);
  const isWorthlessExpiration = isClosingSpread && value.closeReason === "expired_worthless";
  const base = {
    date: value.date,
    assetType: "option",
    ticker: value.ticker,
    quantity: value.quantity,
    expiryDate: value.expiryDate,
    optionType: "call",
    closeReason: "",
    note: value.note,
    matchedTradeId: "",
    strategyId,
    strategyType: "bull_call_spread",
  };
  const longCall = {
    id: randomUUID(),
    ...base,
    side: isClosingSpread ? "sell" : "buy",
    strike: value.longStrike,
    price: value.longPrice,
    fee: longFee,
    closeReason: isWorthlessExpiration ? "expired_worthless" : "",
    strategyLeg: "long_call",
    matchedTradeId: matchedLegs?.longCall?.id || "",
  };
  const shortCall = {
    id: randomUUID(),
    ...base,
    side: isClosingSpread ? "buy" : "sell",
    strike: value.shortStrike,
    price: value.shortPrice,
    fee: shortFee,
    closeReason: "",
    strategyLeg: "short_call",
    matchedTradeId: matchedLegs?.shortCall?.id || "",
  };

  for (const flow of [longCall, shortCall]) {
    flow.cashAmount = calculateTradeCashAmount(flow);
    flow.type = flow.side === "buy" ? "outflow" : "inflow";
    flow.amount = flow.cashAmount;
  }

  return [longCall, shortCall];
}

async function serveStatic(request, response, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, path.normalize(requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const extension = path.extname(filePath);
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function handleApi(request, response, pathname) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (pathname === "/api/exit" && request.method === "POST") {
    sendJson(response, 200, { ok: true });
    setTimeout(() => {
      server.close(() => {
        process.exit(0);
      });
    }, 100);
    return;
  }

  if (pathname === "/api/data" && request.method === "GET") {
    const data = await readData();
    const selectedYear = validateYear(url.searchParams.get("year")) || new Date().getFullYear();
    sendJson(response, 200, {
      selectedYear,
      dataFile: DATA_FILE,
      availableYears: Object.keys(data.years)
        .map(Number)
        .sort((left, right) => right - left),
      ...buildYearPayload(data, selectedYear),
    });
    return;
  }

  if (pathname === "/api/funding" && request.method === "GET") {
    const data = await readData();
    sendJson(response, 200, buildFundingAccountPayload(data, url.searchParams.get("accountId") || ""));
    return;
  }

  if (pathname === "/api/funding/accounts" && request.method === "POST") {
    const body = await readRequestBody(request);
    const name = validateAccountName(body.name);

    if (!name) {
      sendJson(response, 400, { error: "账户名称不能为空。" });
      return;
    }

    const data = await readData();
    const account = addFundingAccount(data, {
      id: randomUUID(),
      name,
    });
    await writeData(data);
    sendJson(response, 201, buildFundingAccountPayload(data, account.id));
    return;
  }

  if (pathname.startsWith("/api/funding/accounts/") && request.method === "PUT") {
    const accountId = pathname.split("/").pop();
    const body = await readRequestBody(request);
    const name = validateAccountName(body.name);

    if (!name) {
      sendJson(response, 400, { error: "账户名称不能为空。" });
      return;
    }

    const data = await readData();
    const updated = renameFundingAccount(data, accountId, name);

    if (!updated) {
      sendJson(response, 404, { error: "找不到要重命名的账户。" });
      return;
    }

    await writeData(data);
    sendJson(response, 200, buildFundingAccountPayload(data, accountId));
    return;
  }

  if (pathname === "/api/funding/strategies/bull-call" && request.method === "POST") {
    const body = await readRequestBody(request);
    const data = await readData();
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    const account = validateFundingAccountSelection(data, accountId);
    if (!account) {
      sendJson(response, 404, { error: "找不到指定账户。" });
      return;
    }

    const validation = validateBullCallSpreadPayload(body);
    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    let strategyId = randomUUID();
    let matchedLegs = null;

    if (validation.value.matchedStrategyId) {
      matchedLegs = getBullCallSpreadOpeningLegs(account, validation.value.matchedStrategyId);

      if (!matchedLegs) {
        sendJson(response, 404, { error: "找不到要匹配的 Bull Call 价差。" });
        return;
      }

      if (
        matchedLegs.longCall.ticker !== validation.value.ticker ||
        matchedLegs.shortCall.ticker !== validation.value.ticker ||
        matchedLegs.longCall.expiryDate !== validation.value.expiryDate ||
        matchedLegs.shortCall.expiryDate !== validation.value.expiryDate ||
        Number(matchedLegs.longCall.strike) !== Number(validation.value.longStrike) ||
        Number(matchedLegs.shortCall.strike) !== Number(validation.value.shortStrike)
      ) {
        sendJson(response, 400, { error: "平仓价差必须匹配同一标的、到期日和行权价。" });
        return;
      }

      const longOpenQuantity = matchedLegs.longCall.quantity - getMatchedQuantity(account.flows, matchedLegs.longCall);
      const shortOpenQuantity = matchedLegs.shortCall.quantity - getMatchedQuantity(account.flows, matchedLegs.shortCall);
      const maxCloseQuantity = Math.min(longOpenQuantity, shortOpenQuantity);

      if (validation.value.quantity > maxCloseQuantity + 0.000001) {
        sendJson(response, 400, { error: `平仓份数超过可匹配数量，当前最多可平 ${maxCloseQuantity}。` });
        return;
      }

      strategyId = validation.value.matchedStrategyId;
    }

    const flows = buildBullCallSpreadFlows(strategyId, validation.value, matchedLegs);
    for (const flow of flows) {
      addFundingFlow(data, flow, accountId);
    }
    await writeData(data);
    sendJson(response, 201, buildFundingAccountPayload(data, accountId));
    return;
  }

  if (pathname.startsWith("/api/funding/strategies/") && request.method === "DELETE") {
    const strategyId = pathname.split("/").pop();
    const data = await readData();
    const accountId = url.searchParams.get("accountId") || "";
    const account = validateFundingAccountSelection(data, accountId);
    if (!account) {
      sendJson(response, 404, { error: "找不到指定账户。" });
      return;
    }

    const strategyFlowIds = new Set(
      account.flows.filter((flow) => flow.strategyId === strategyId).map((flow) => flow.id)
    );
    const hasMatchedCloser = account.flows.some(
      (flow) => isTradeFlow(flow) && strategyFlowIds.has(flow.matchedTradeId)
    );

    if (hasMatchedCloser) {
      sendJson(response, 400, { error: "这组策略已有匹配平仓记录，请先删除或改掉平仓记录。" });
      return;
    }

    const nextFlows = account.flows.filter((flow) => flow.strategyId !== strategyId);
    if (nextFlows.length === account.flows.length) {
      sendJson(response, 404, { error: "找不到要删除的策略记录。" });
      return;
    }

    account.flows = nextFlows;
    data.funding.activeAccountId = account.id;
    await writeData(data);
    sendJson(response, 200, buildFundingAccountPayload(data, account.id));
    return;
  }

  if (pathname === "/api/funding/balance" && request.method === "PUT") {
    const body = await readRequestBody(request);
    const amount = validateAmount(body.startingBalance);

    if (amount === null) {
      sendJson(response, 400, { error: "初始资金余额必须为 0 或正数。" });
      return;
    }

    const data = await readData();
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    if (!validateFundingAccountSelection(data, accountId)) {
      sendJson(response, 404, { error: "找不到指定账户。" });
      return;
    }
    setFundingStartingBalance(data, amount, accountId);
    await writeData(data);
    sendJson(response, 200, buildFundingAccountPayload(data, accountId));
    return;
  }

  if (pathname === "/api/funding/flows" && request.method === "POST") {
    const body = await readRequestBody(request);
    const data = await readData();
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    if (!validateFundingAccountSelection(data, accountId)) {
      sendJson(response, 404, { error: "找不到指定账户。" });
      return;
    }
    const validation = validateFundingFlowPayload(body, data, "", accountId);

    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    addFundingFlow(data, {
      id: randomUUID(),
      ...validation.value,
    }, accountId);
    await writeData(data);
    sendJson(response, 201, buildFundingAccountPayload(data, accountId));
    return;
  }

  if (pathname.startsWith("/api/funding/flows/") && request.method === "PUT") {
    const flowId = pathname.split("/").pop();
    const body = await readRequestBody(request);
    const data = await readData();
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    if (!validateFundingAccountSelection(data, accountId)) {
      sendJson(response, 404, { error: "找不到指定账户。" });
      return;
    }
    const validation = validateFundingFlowPayload(body, data, flowId, accountId);

    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    const updated = updateFundingFlow(data, flowId, validation.value, accountId);

    if (!updated) {
      sendJson(response, 404, { error: "找不到要更新的资金记录。" });
      return;
    }

    await writeData(data);
    sendJson(response, 200, buildFundingAccountPayload(data, accountId));
    return;
  }

  if (pathname.startsWith("/api/funding/flows/") && request.method === "DELETE") {
    const flowId = pathname.split("/").pop();
    const data = await readData();
    const accountId = url.searchParams.get("accountId") || "";
    if (!validateFundingAccountSelection(data, accountId)) {
      sendJson(response, 404, { error: "找不到指定账户。" });
      return;
    }
    const deletionValidation = canDeleteFundingFlow(data, flowId, accountId);

    if (!deletionValidation.ok) {
      sendJson(response, 400, { error: deletionValidation.error });
      return;
    }

    const deleted = deleteFundingFlow(data, flowId, accountId);

    if (!deleted) {
      sendJson(response, 404, { error: "找不到要删除的资金记录。" });
      return;
    }

    await writeData(data);
    sendJson(response, 200, buildFundingAccountPayload(data, accountId));
    return;
  }

  if (pathname === "/api/room" && request.method === "PUT") {
    const body = await readRequestBody(request);
    const year = validateYear(body.year);
    const amount = validateAmount(body.startingContributionRoom);

    if (!year) {
      sendJson(response, 400, { error: "年份无效。" });
      return;
    }

    if (amount === null) {
      sendJson(response, 400, { error: "年度额度必须为 0 或正数。" });
      return;
    }

    const data = await readData();
    setStartingContributionRoom(data, year, amount);
    await writeData(data);
    sendJson(response, 200, buildYearPayload(data, year));
    return;
  }

  if (pathname === "/api/transactions" && request.method === "POST") {
    const body = await readRequestBody(request);
    const validation = validateTransactionPayload(body);

    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    const data = await readData();
    addTransaction(data, validation.value.year, {
      id: randomUUID(),
      ...validation.value,
    });
    await writeData(data);
    sendJson(response, 201, buildYearPayload(data, validation.value.year));
    return;
  }

  if (pathname.startsWith("/api/transactions/") && request.method === "PUT") {
    const transactionId = pathname.split("/").pop();
    const body = await readRequestBody(request);
    const validation = validateTransactionPayload(body);

    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    const data = await readData();
    const updated = updateTransaction(data, validation.value.year, transactionId, validation.value);

    if (!updated) {
      sendJson(response, 404, { error: "找不到要更新的记录。" });
      return;
    }

    await writeData(data);
    sendJson(response, 200, buildYearPayload(data, validation.value.year));
    return;
  }

  if (pathname.startsWith("/api/transactions/") && request.method === "DELETE") {
    const transactionId = pathname.split("/").pop();
    const year = validateYear(url.searchParams.get("year"));

    if (!year) {
      sendJson(response, 400, { error: "年份无效。" });
      return;
    }

    const data = await readData();
    const deleted = deleteTransaction(data, year, transactionId);

    if (!deleted) {
      sendJson(response, 404, { error: "找不到要删除的记录。" });
      return;
    }

    await writeData(data);
    sendJson(response, 200, buildYearPayload(data, year));
    return;
  }

  sendJson(response, 404, { error: "接口不存在。" });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
      return;
    }

    await serveStatic(request, response, url.pathname);
  } catch (error) {
    sendJson(response, 500, {
      error: "服务器内部错误。",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, async () => {
  await ensureDataFile();
  console.log(`TFSA tracker running at http://localhost:${PORT}`);
});
