"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
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
  isTradeFlow,
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

function validatePositiveNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return number;
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

function getMatchedQuantity(flows, buy, ignoredFlowId = "") {
  return flows.reduce((total, flow) => {
    if (
      flow.id !== ignoredFlowId &&
      isTradeFlow(flow) &&
      flow.side === "sell" &&
      flow.matchedTradeId === buy.id &&
      sameInstrument(buy, flow)
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

function validateFundingFlowPayload(body, data, currentFlowId = "") {
  if (body.assetType !== "stock" && body.assetType !== "option") {
    return validateLegacyFundingFlowPayload(body);
  }

  const date = typeof body.date === "string" ? body.date : "";
  const assetType = body.assetType;
  const side = body.side === "sell" ? "sell" : body.side === "buy" ? "buy" : null;
  const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
  const quantity = validatePositiveNumber(body.quantity);
  const price = validatePositiveNumber(body.price);
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
    return { error: "成交价必须大于 0。" };
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

  if (value.amount <= 0) {
    return { error: "扣除手续费后的现金金额必须大于 0。" };
  }

  const flows = data.funding.flows;

  if (side === "sell" && value.matchedTradeId) {
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

function canDeleteFundingFlow(data, flowId) {
  const flow = data.funding.flows.find((candidate) => candidate.id === flowId);

  if (!flow || !isTradeFlow(flow) || flow.side !== "buy") {
    return { ok: true };
  }

  const hasMatchedSell = data.funding.flows.some(
    (candidate) => isTradeFlow(candidate) && candidate.side === "sell" && candidate.matchedTradeId === flowId
  );

  if (hasMatchedSell) {
    return { ok: false, error: "这笔买入已有匹配卖出记录，请先删除或改掉卖出记录。" };
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
  return {
    funding: data.funding,
    fundingSummary: calculateFundingSummary(data.funding),
  };
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
    sendJson(response, 200, buildFundingPayload(data));
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
    setFundingStartingBalance(data, amount);
    await writeData(data);
    sendJson(response, 200, buildFundingPayload(data));
    return;
  }

  if (pathname === "/api/funding/flows" && request.method === "POST") {
    const body = await readRequestBody(request);
    const data = await readData();
    const validation = validateFundingFlowPayload(body, data);

    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    addFundingFlow(data, {
      id: randomUUID(),
      ...validation.value,
    });
    await writeData(data);
    sendJson(response, 201, buildFundingPayload(data));
    return;
  }

  if (pathname.startsWith("/api/funding/flows/") && request.method === "PUT") {
    const flowId = pathname.split("/").pop();
    const body = await readRequestBody(request);
    const data = await readData();
    const validation = validateFundingFlowPayload(body, data, flowId);

    if (validation.error) {
      sendJson(response, 400, { error: validation.error });
      return;
    }

    const updated = updateFundingFlow(data, flowId, validation.value);

    if (!updated) {
      sendJson(response, 404, { error: "找不到要更新的资金记录。" });
      return;
    }

    await writeData(data);
    sendJson(response, 200, buildFundingPayload(data));
    return;
  }

  if (pathname.startsWith("/api/funding/flows/") && request.method === "DELETE") {
    const flowId = pathname.split("/").pop();
    const data = await readData();
    const deletionValidation = canDeleteFundingFlow(data, flowId);

    if (!deletionValidation.ok) {
      sendJson(response, 400, { error: deletionValidation.error });
      return;
    }

    const deleted = deleteFundingFlow(data, flowId);

    if (!deleted) {
      sendJson(response, 404, { error: "找不到要删除的资金记录。" });
      return;
    }

    await writeData(data);
    sendJson(response, 200, buildFundingPayload(data));
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
