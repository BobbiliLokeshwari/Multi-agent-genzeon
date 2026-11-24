Validate the LinkedIn post for quality, accuracy, and authenticity.

POST CONTENT:
$post_content

ORIGINAL RESEARCH:
$research_insights

EXPECTED TONE: $tone

VALIDATION CHECKLIST:
1. Accuracy: Do claims match research data?
2. Authenticity: Does it sound genuine, not robotic?
3. Engagement: Is the hook compelling enough to stop scrolling?
4. LinkedIn clichés: Flag overused phrases
5. Tone consistency: Matches requested tone?
6. Structure: Proper formatting and flow?

CRINGE FLAGS TO AVOID:
- "I'm humbled to announce..."
- "Excited to share..."
- Generic motivational quotes
- Excessive self-promotion
- "Game changer", "disruptive", "synergy"

Return JSON:
{
    "validation_passed": true,
    "score": "1-10 rating",
    "accuracy_issues": ["any factual problems"],
    "quality_issues": ["areas for improvement"],
    "cringe_flags": ["cliché phrases found"],
    "suggestions": ["specific improvements"],
    "final_verdict": "ready to post / needs revision"
}
