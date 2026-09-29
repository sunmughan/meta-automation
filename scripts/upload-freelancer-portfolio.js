#!/usr/bin/env node
const aiRuntime = require("../src/ai/ai-runtime");
const knowledge = require("../src/knowledge/knowledge-engine");
const jobBrowserManager = require("../src/jobs/browser/job-browser-manager");
const { getEnabledPlatforms } = require("../src/jobs/portfolio/portfolio-platform-registry");
const { listProjects } = require("../src/jobs/portfolio/portfolio-repository");
const { PortfolioPublisher } = require("../src/jobs/portfolio/portfolio-publisher");

async function main() {
  const projects = listProjects();
  const platforms = getEnabledPlatforms();
  if (!platforms.length) throw new Error("No enabled portfolio publishing platform is configured.");

  const reports = {};
  const publisher = new PortfolioPublisher({ browserManager: jobBrowserManager, aiRuntime, knowledgeEngine: knowledge });

  try {
    for (const platform of platforms) {
      reports[platform.id] = [];
      for (const project of projects) {
        try {
          reports[platform.id].push(await publisher.publishProject({ project, platform }));
        } catch (error) {
          reports[platform.id].push({
            projectId: project.id,
            status: "FAILED",
            reason: error.message
          });
        }
      }
    }
  } finally {
    jobBrowserManager.disconnect();
  }

  console.log(JSON.stringify({ status: "DONE", reports }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
