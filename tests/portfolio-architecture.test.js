const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { listProjects, getProject, validateCatalog } = require("../src/jobs/portfolio/portfolio-repository");

const root = path.resolve(__dirname, "..");

function test(name, fn) {
  try { fn(); console.log("✓ " + name); }
  catch (e) { console.error("✗ " + name + ": " + e.message); process.exitCode = 1; }
}

test("portfolio catalog is the only project data source", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "knowledge/portfolio/projects.json"), "utf8"));
  validateCatalog(catalog);
  assert(listProjects().length > 0);
  assert(getProject(listProjects()[0].id));
});

test("portfolio scripts contain no hardcoded project arrays or project names", () => {
  for (const file of ["scripts/generate-portfolio-cards.js", "scripts/upload-freelancer-portfolio.js"]) {
    const code = fs.readFileSync(path.join(root, file), "utf8");
    assert(!code.includes("const PROJECTS = ["), file + " still owns a PROJECTS array");
    assert(!code.includes("const ITEMS = ["), file + " still owns an ITEMS array");
    for (const project of listProjects()) {
      assert(!code.includes(project.name), file + " hardcodes project " + project.name);
    }
  }
});

test("legacy portfolio image source directory is not used by runtime code", () => {
  for (const file of [
    "src/jobs/portfolio/portfolio-repository.js",
    "src/jobs/portfolio/portfolio-generator.js",
    "src/jobs/portfolio/portfolio-publisher.js",
    "scripts/generate-portfolio-cards.js",
    "scripts/upload-freelancer-portfolio.js"
  ]) {
    const code = fs.readFileSync(path.join(root, file), "utf8");
    assert(!code.includes("portfolio_images"), file + " still references portfolio_images");
  }
});

test("portfolio publishing plans are semantic-only", () => {
  const code = fs.readFileSync(path.join(root, "src/jobs/portfolio/portfolio-publisher.js"), "utf8");
  assert(code.includes("semantic"));
  assert(code.includes("selector"));
});
