"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  calculateFundingSummary,
  calculateYearSummary,
  ensureDataShape,
  getOrCreateYear,
} = require("../lib/tfsa");

const rootDir = path.join(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const dataFile = path.join(rootDir, "data", "tfsa-data.json");
const docsDir = path.join(rootDir, "docs");

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function buildYearPayload(data, year) {
  const yearData = getOrCreateYear(data, year);
  return {
    yearData,
    summary: calculateYearSummary(yearData),
  };
}

async function main() {
  const data = ensureDataShape(await readJson(dataFile));
  const availableYears = Object.keys(data.years)
    .map(Number)
    .sort((left, right) => right - left);
  const currentYear = new Date().getFullYear();
  const defaultYear = availableYears.includes(currentYear)
    ? currentYear
    : availableYears[0] || currentYear;
  const years = new Set([...availableYears, defaultYear]);
  const yearPayloads = {};

  for (const year of years) {
    yearPayloads[String(year)] = buildYearPayload(data, year);
  }

  await fs.rm(docsDir, { recursive: true, force: true });
  await fs.mkdir(docsDir, { recursive: true });
  await fs.copyFile(path.join(publicDir, "favicon.svg"), path.join(docsDir, "favicon.svg"));
  await fs.copyFile(path.join(publicDir, "styles.css"), path.join(docsDir, "styles.css"));
  await fs.copyFile(path.join(publicDir, "app.js"), path.join(docsDir, "app.js"));

  const html = await fs.readFile(path.join(publicDir, "index.html"), "utf8");
  const pagesHtml = html
    .replace('href="/favicon.svg"', 'href="favicon.svg"')
    .replace('href="/styles.css"', 'href="styles.css"')
    .replace(
      '<script src="/app.js" defer></script>',
      '<script>window.TFSA_STATIC_MODE = true;</script>\n    <script src="app.js" defer></script>'
    );
  await fs.writeFile(path.join(docsDir, "index.html"), pagesHtml);

  await fs.writeFile(
    path.join(docsDir, "static-data.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        defaultYear,
        availableYears,
        yearPayloads,
        fundingPayload: {
          funding: data.funding,
          fundingSummary: calculateFundingSummary(data.funding),
        },
      },
      null,
      2
    )
  );

  console.log(`GitHub Pages files generated in ${docsDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
