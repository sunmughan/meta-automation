#!/usr/bin/env node
const { generatePortfolioCards } = require("../src/jobs/portfolio/portfolio-generator");

generatePortfolioCards()
  .then(result => console.log(JSON.stringify({ status: "DONE", generated: result }, null, 2)))
  .catch(error => { console.error(error); process.exitCode = 1; });
