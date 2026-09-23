/**
 * tests/multi-brand-customization.test.js
 * Comprehensive automated verification for Multi-Brand Customization & Zero-Bleed Isolation.
 *
 * Verifies that any business or founder can onboard into the MiniMax M3 AI system,
 * and all prompt builders, identity resolvers, and knowledge queries dynamically
 * adapt with 100% brand isolation and zero hardcoded brand bleed.
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const knowledge = require("../src/knowledge/knowledge-engine");
const aiDecisionEngine = require("../src/ai/ai-decision-engine");
const identityResolver = require("../src/conversations/identity-resolver");
const { commandOnboard } = require("../threads-agent");

async function runMultiBrandTest() {
  console.log("\n==================================================");
  console.log("  MULTI-BRAND CUSTOMIZATION & ISOLATION TEST");
  console.log("==================================================\n");

  const knowledgeDir = path.resolve(__dirname, "../knowledge");
  const backupFiles = {};
  const targetFiles = ["founder.md", "company.md", "profiles.md", "services.md", "pillars.md"];

  // Backup original knowledge files and .env
  for (const f of targetFiles) {
    const p = path.join(knowledgeDir, f);
    if (fs.existsSync(p)) {
      backupFiles[f] = fs.readFileSync(p, "utf8");
    }
  }
  const envPath = path.resolve(__dirname, "../.env");
  const envBackup = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : null;

  try {
    // 1. Verify default knowledge engine state (CodeAir / Sunmughan)
    console.log("1. Verifying default knowledge engine initialization...");
    const defaultFounder = knowledge.getFounderInfo();
    const defaultCompany = knowledge.getCompanyInfo();
    assert(defaultFounder.name.includes("Sunmughan"), "Default founder must be Sunmughan");
    assert(defaultCompany.name.includes("CodeAir"), "Default company must be CodeAir");
    const pillars = knowledge.getContentPillars();
    assert(Array.isArray(pillars) && pillars.length >= 5, "Must parse at least 5 content pillars");
    console.log(`   ✓ Default founder & company successfully verified (${pillars.length} pillars active)`);

    // 2. Simulate Onboarding an External Client Brand: "Apex AI Studio"
    console.log("2. Simulating onboarding for 'Apex AI Studio' by Elena Rostova...");
    const mockBrand = {
      nonInteractive: true,
      founderName: "Elena Rostova",
      founderRole: "Chief AI Architect & Founder",
      founderProfile: "https://linkedin.com/in/elena-rostova-ai",
      founderWhatsApp: "https://wa.me/15550199283",
      threadsUsername: "elena_apex_ai",
      companyName: "Apex AI Studio",
      companyWebsite: "https://apexai.io",
      companyProduct: "https://apexai.io/neural-flow",
      companySummary: "Autonomous enterprise agent systems and neural workflow automation",
      approvedServices: [
        "Autonomous Multi-Agent Systems",
        "Neural Workflow Automation",
        "Vector Search Engines",
        "Custom Enterprise LLM Integrations"
      ],
      excludedServices: [
        "B2B Lead Generation Databases",
        "Graphic Design & Logos",
        "Cold Calling Outreach",
        "Corporate Salaried Recruitment"
      ]
    };

    await commandOnboard(mockBrand);

    // 3. Inspect updated knowledge state in-memory
    console.log("3. Inspecting dynamically reloaded knowledge state...");
    const newFounder = knowledge.getFounderInfo();
    const newCompany = knowledge.getCompanyInfo();
    const newProfiles = knowledge.getOfficialProfiles();
    const newApproved = knowledge.getApprovedServices();
    const newExcluded = knowledge.getExcludedServices();
    const newWhatsApp = knowledge.getWhatsAppUrl();

    assert.strictEqual(newFounder.name, "Elena Rostova", "Founder name must be Elena Rostova");
    assert.strictEqual(newFounder.role, "Chief AI Architect & Founder", "Founder role must match");
    assert.strictEqual(newFounder.threadsUsername, "elena_apex_ai", "Threads username must match");
    assert.strictEqual(newCompany.name, "Apex AI Studio", "Company name must be Apex AI Studio");
    assert.strictEqual(newCompany.website, "https://apexai.io", "Company website must match");
    assert.strictEqual(newProfiles.founder.linkedin, "https://linkedin.com/in/elena-rostova-ai", "Founder LinkedIn must match");
    assert.strictEqual(newWhatsApp, "https://wa.me/15550199283", "WhatsApp URL must match Apex AI Studio direct link");
    assert.strictEqual(newApproved.length, 4, "Approved services count must be 4");
    assert(newApproved.includes("Autonomous Multi-Agent Systems"), "Approved services must include Multi-Agent Systems");
    assert.strictEqual(newExcluded.length, 4, "Excluded services count must be 4");
    console.log("   ✓ In-memory knowledge state matches Apex AI Studio with 100% precision");

    // 4. Verify Zero Brand Bleed in AI Decision Engine Prompts
    console.log("4. Verifying prompt isolation (Zero CodeAir / Sunmughan bleed)...");
    const testPost = {
      postId: "test_apex_1",
      username: "enterprise_buyer",
      text: "We need an autonomous multi-agent system to automate our financial report reconciliation."
    };

    const semanticPrompt = aiDecisionEngine.buildFullSemanticPrompt(testPost);
    assert(semanticPrompt.includes("Apex AI Studio"), "Semantic prompt must contain Apex AI Studio");
    assert(semanticPrompt.includes("Elena Rostova"), "Semantic prompt must contain Elena Rostova");
    assert(semanticPrompt.includes("https://apexai.io"), "Semantic prompt must contain https://apexai.io");
    assert(!semanticPrompt.includes("CodeAir"), "Semantic prompt must NOT contain CodeAir (zero bleed)");
    assert(!semanticPrompt.includes("Sunmughan"), "Semantic prompt must NOT contain Sunmughan (zero bleed)");
    console.log("   ✓ Semantic Lead Qualification prompt achieves 100% brand isolation");

    // 5. Verify Multi-Turn Conversation Prompt Isolation
    console.log("5. Verifying multi-turn conversation turn prompt isolation...");
    const conversationPrompt = aiDecisionEngine.buildConversationTurnPrompt({
      incomingMessage: "Who is behind Apex AI Studio?",
      username: "enterprise_buyer"
    });
    assert(conversationPrompt.includes("Apex AI Studio"), "Conversation prompt must contain Apex AI Studio");
    assert(conversationPrompt.includes("Elena Rostova"), "Conversation prompt must contain Elena Rostova");
    assert(conversationPrompt.includes("https://wa.me/15550199283"), "Conversation prompt must contain Apex AI Studio WhatsApp");
    assert(!conversationPrompt.includes("wa.me/codeair") && !conversationPrompt.includes("wa.me/919584215603"), "Conversation prompt must NOT contain production WhatsApp");
    assert(!conversationPrompt.includes("CodeAir"), "Conversation prompt must NOT contain CodeAir");
    assert(!conversationPrompt.includes("Sunmughan"), "Conversation prompt must NOT contain Sunmughan");
    console.log("   ✓ Multi-turn conversation prompt achieves 100% brand isolation");

    // 6. Verify Identity Resolver with Custom Brand
    console.log("6. Verifying identity resolver dynamic resolution...");
    const idResult1 = identityResolver.resolveIdentity({
      message: "What does Apex AI Studio do?"
    });
    assert.strictEqual(idResult1.identity, "COMPANY", "Must resolve to COMPANY when asked what company does");
    assert(idResult1.reason.includes("Apex AI Studio"), "Reason must mention Apex AI Studio");

    const idResult2 = identityResolver.resolveIdentity({
      message: "Who is the founder of Apex AI Studio?"
    });
    assert.strictEqual(idResult2.identity, "FOUNDER", "Must resolve to FOUNDER when asked who founded company");
    console.log("   ✓ Identity resolver accurately adapts to new brand entity");

    console.log("\n  \x1b[32m✓ ALL MULTI-BRAND ISOLATION TESTS PASSED CLEANLY!\x1b[0m\n");
  } finally {
    // Restore original knowledge files so production state remains intact
    console.log("Restoring original production knowledge base (CodeAir / Sunmughan)...");
    for (const [f, content] of Object.entries(backupFiles)) {
      fs.writeFileSync(path.join(knowledgeDir, f), content, "utf8");
    }
    if (envBackup !== null) {
      fs.writeFileSync(envPath, envBackup, "utf8");
    }
    knowledge.loadKnowledge();
    console.log("✓ Production knowledge base restored cleanly.");
  }
}

if (require.main === module) {
  runMultiBrandTest().catch(err => {
    console.error("Multi-brand test failed:", err);
    process.exit(1);
  });
}

module.exports = { runMultiBrandTest };
