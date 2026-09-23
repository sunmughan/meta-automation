const fs = require("fs");
const path = require("path");
const knowledge = require("../../knowledge/knowledge-engine");
const CONFIG = require("../../../config");

function readBaseResume() {
  const resumePath = CONFIG.JOB_BASE_RESUME_PATH;
  if (!resumePath || !fs.existsSync(resumePath)) {
    return { path: resumePath, content: null, present: false };
  }
  return {
    path: resumePath,
    content: fs.readFileSync(resumePath, "base64"),
    present: true
  };
}

function buildCandidateContext() {
  const founder = knowledge.getFounderInfo?.() || {};
  const company = knowledge.getCompanyInfo?.() || {};
  return {
    founder,
    company,
    approvedProfileUrls: knowledge.getOfficialProfiles?.() || {}
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function generateApplicationDocuments({ opportunity, candidateProfile, aiRuntime }) {
  const resume = readBaseResume();
  if (!resume.present) {
    throw new Error(`Base resume not found at ${resume.path || "(not configured)"}`);
  }

  const context = buildCandidateContext();
  const prompt = `
You are the document preparation agent for a job application.
Return JSON only.

SOURCE OF TRUTH:
- Candidate profile: ${JSON.stringify(candidateProfile)}
- Approved founder/company data: ${JSON.stringify(context)}
- Base resume exists as a local attachment and must remain factually authoritative.

OPPORTUNITY:
${JSON.stringify(opportunity)}

RULES:
- Never invent employment, client names, certifications, dates, revenue, results, or skills.
- Tailor emphasis, ordering and wording only using verified source facts.
- Never change a factual claim merely to match the job.
- The cover letter must be specific to this opportunity, concise and professional.
- If a cover letter is not needed, still return one for internal preview only.
- Return:
{
  "resume_strategy": {"use_base": true, "emphasis": [], "changes": []},
  "cover_letter": "...",
  "application_answers": {}
}
`;

  const generated = await aiRuntime.callAi(prompt, {
    taskType: "JOB_DOCUMENT",
    priority: 2
  });

  const outputDir = path.join(CONFIG.JOB_GENERATED_DIR, opportunity.platform, opportunity.externalId);
  ensureDir(outputDir);

  const coverPath = path.join(outputDir, "cover-letter.txt");
  fs.writeFileSync(coverPath, generated.cover_letter || "", "utf8");

  const metadataPath = path.join(outputDir, "document-plan.json");
  fs.writeFileSync(metadataPath, JSON.stringify({
    opportunityKey: opportunity.key,
    resume: resume.path,
    resumeStrategy: generated.resume_strategy || {},
    applicationAnswers: generated.application_answers || {},
    generatedAt: new Date().toISOString()
  }, null, 2), "utf8");

  return {
    baseResumePath: resume.path,
    baseResumeContentBase64: resume.content,
    coverLetterPath: coverPath,
    coverLetter: generated.cover_letter || "",
    resumeStrategy: generated.resume_strategy || {},
    applicationAnswers: generated.application_answers || {}
  };
}

module.exports = { generateApplicationDocuments, readBaseResume };
