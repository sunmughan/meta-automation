const fs = require("fs");
const path = require("path");
const CONFIG = require("../../../config");

const CATALOG_PATH = path.join(CONFIG.KNOWLEDGE_DIR, "portfolio", "projects.json");

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) throw new Error("Portfolio catalog is missing: " + CATALOG_PATH);
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  validateCatalog(catalog);
  return catalog;
}

function validateCatalog(catalog) {
  if (!catalog || !Array.isArray(catalog.projects)) throw new Error("Portfolio catalog must contain projects[]");
  const ids = new Set();
  for (const project of catalog.projects) {
    if (!project.id || ids.has(project.id)) throw new Error("Portfolio project IDs must be unique");
    ids.add(project.id);
    if (!project.name || !project.title || !project.description) {
      throw new Error("Portfolio project is missing required identity fields: " + project.id);
    }
    for (const field of ["technologies", "metrics", "skills", "industries"]) {
      if (!Array.isArray(project[field])) throw new Error("Portfolio project field must be an array: " + project.id + "." + field);
    }
  }
}

function listProjects({ enabledOnly = true } = {}) {
  const projects = loadCatalog().projects;
  return enabledOnly ? projects.filter(project => project.enabled !== false) : projects;
}

function getProject(id) {
  const normalized = String(id || "").trim().toLowerCase();
  return listProjects({ enabledOnly: false }).find(project =>
    project.id === normalized || (project.legacyIds || []).includes(normalized)
  ) || null;
}

function resolveAssetPath(project, rootDir = CONFIG.ROOT_DIR) {
  const generatedDir = process.env.PORTFOLIO_GENERATED_DIR || path.join(rootDir, "portfolio_generated");
  return path.join(generatedDir, project.id + ".png");
}

function buildEvidence(project) {
  return {
    projectId: project.id,
    verifiedFields: ["name", "title", "description", "technologies", "metrics", "skills", "industries"],
    claims: [...project.metrics],
    source: "knowledge/portfolio/projects.json"
  };
}

module.exports = {
  CATALOG_PATH,
  loadCatalog,
  validateCatalog,
  listProjects,
  getProject,
  resolveAssetPath,
  buildEvidence
};
