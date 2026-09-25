/**
 * AI-assisted cross-platform identity resolver.
 * Exact platform identity is accepted immediately; uncertain cross-platform matches require AI evidence.
 */
const identityGraph = require("./identity-graph");

class IntelligentIdentityResolver {
  constructor({ aiRuntime }) {
    this.aiRuntime = aiRuntime;
  }

  async resolve(signals) {
    const exact = identityGraph.getPersonByPlatform(signals.platform, signals.username);
    if (exact) return { person: exact, matched: true, method: "exact" };

    const person = identityGraph.findOrCreate(signals);
    const candidates = identityGraph.getAllPersons()
      .filter(item => item.id !== person.id)
      .slice(0, 20)
      .map(item => ({
        id: item.id,
        displayName: item.displayName,
        identities: item.identities,
        emails: item.emails
      }));

    if (!candidates.length) return { person, matched: false, method: "new" };

    let result;
    try {
      result = await this.aiRuntime.callAi([
        "You are a cross-platform identity resolution specialist.",
        "Determine whether the newly observed profile is the same real person as one candidate.",
        "Use only explicit evidence in the supplied records.",
        "Do not infer from sensitive attributes.",
        "Prefer false negatives to false positives.",
        "Return JSON with match, personId, confidence, evidence.",
        "",
        "NEW IDENTITY:",
        JSON.stringify(signals),
        "CANDIDATES:",
        JSON.stringify(candidates)
      ].join("\n"), {
        taskType: "IDENTITY_RESOLUTION",
        priority: 2,
        retries: 1
      });
    } catch (_) {
      return { person, matched: false, method: "new" };
    }

    if (result?.match === true && Number(result.confidence || 0) >= 0.9 && candidates.some(item => item.id === result.personId)) {
      const merged = identityGraph.mergePerson(person.id, result.personId);
      return {
        person: merged || identityGraph.getPerson(result.personId),
        matched: true,
        method: "ai",
        confidence: Number(result.confidence || 0),
        evidence: result.evidence
      };
    }

    return { person, matched: false, method: "new" };
  }
}

module.exports = IntelligentIdentityResolver;
