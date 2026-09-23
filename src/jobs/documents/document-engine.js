
const fs = require("fs");
const path = require("path");
const knowledge = require("../../knowledge/knowledge-engine");
const CONFIG = require("../../../config");

let pdfParse = null;
try {
  pdfParse = require("pdf-parse");
} catch (_) {}

async function readBaseResume() {
  const resumePath = CONFIG.JOB_BASE_RESUME_PATH;
  if (!resumePath || !fs.existsSync(resumePath)) {
    return { path: resumePath, content: null, text: "", present: false };
  }

  const buffer = fs.readFileSync(resumePath);
  const ext = path.extname(resumePath).toLowerCase();
  let text = "";

  if ([".txt", ".md", ".markdown", ".json"].includes(ext)) {
    text = buffer.toString("utf8");
  } else if (ext === ".pdf") {
    if (typeof pdfParse !== "function") {
      throw new Error("PDF resume support requires the installed pdf-parse dependency.");
    }
    const parsed = await pdfParse(buffer);
    text = String(parsed.text || "");
  }

  return {
    path: resumePath,
    content: buffer.toString("base64"),
    text,
    present: true
  };
}

function buildCandidateContext(candidateProfile, resumeText = "") {
  return {
    candidateProfile,
    founder: knowledge.getFounderInfo?.() || {},
    company: knowledge.getCompanyInfo?.() || {},
    approvedProfileUrls: knowledge.getOfficialProfiles?.() || {},
    baseResumeText: resumeText
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function generateApplicationDocuments({ opportunity, candidateProfile, aiRuntime }) {
  const resume = await readBaseResume();
  if (!resume.present) {
    throw new Error(`Base resume not found at ${resume.path || "(not configured)"}. Run npm run jobs:setup and provide a base resume.`);
  }

  const context = buildCandidateContext(candidateProfile, resume.text);
  const prompt = `
Return JSON only.

TASK: Prepare application documents for the exact opportunity.

CANDIDATE SOURCE OF TRUTH:
${JSON.stringify(context)}

OPPORTUNITY:
${JSON.stringify(opportunity)}

RULES:
- The base resume is the factual source of truth.
- Use only facts explicitly present in the candidate profile, knowledge base or extracted base resume text.
- Do not invent employment, client names, dates, certifications, technologies, metrics, salary history or outcomes.
- Tailor emphasis and wording without changing factual claims.
- Generate a concise project-specific cover letter.
- Generate application answers only when their answers are explicitly supported by source facts.
- For each generated answer provide its source basis.
- Unknown mandatory fields must remain unanswered so the browser agent can stop for USER_ACTION_REQUIRED.

OUTPUT:
{
  "resumeStrategy":{"useBase":true,"emphasis":[]},
  "coverLetter":"",
  "applicationAnswers":{},
  "answerSources":{}
}
`;

  const generated = await aiRuntime.callAi(prompt, {
    taskType: "JOB_DOCUMENT",
    priority: 2
  });

  const outputDir = path.join(
    CONFIG.JOB_GENERATED_DIR,
    opportunity.platform,
    String(opportunity.externalId)
  );
  ensureDir(outputDir);

  const coverLetter = generated.coverLetter || generated.cover_letter || "";
  const coverPath = path.join(outputDir, "cover-letter.txt");
  fs.writeFileSync(coverPath, coverLetter, "utf8");

  const metadata = {
    opportunityKey: opportunity.key,
    baseResumePath: resume.path,
    resumeStrategy: generated.resumeStrategy || generated.resume_strategy || {},
    applicationAnswers: generated.applicationAnswers || generated.application_answers || {},
    answerSources: generated.answerSources || generated.answer_sources || {},
    generatedAt: new Date().toISOString()
  };

  const metadataPath = path.join(outputDir, "document-plan.json");
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  return {
    baseResumePath: resume.path,
    baseResumeContentBase64: resume.content,
    baseResumeText: resume.text,
    coverLetterPath: coverPath,
    coverLetter,
    resumeStrategy: metadata.resumeStrategy,
    applicationAnswers: metadata.applicationAnswers,
    answerSources: metadata.answerSources
  };
}

module.exports = { generateApplicationDocuments, readBaseResume };
