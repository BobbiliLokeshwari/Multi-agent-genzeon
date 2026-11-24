Write a compelling LinkedIn post using the research insights provided.

TOPIC: $topic
TONE: $tone
POST TYPE: $post_type

RESEARCH INSIGHTS:
$research_insights

MEMORY CONTEXT (past posts on similar topics — use for style reference, avoid repetition):
$memory_context

POST STRUCTURE GUIDELINES:
- Story: Hook → Personal anecdote → Lesson → CTA
- Hot take: Contrarian hook → Reasoning → Invite discussion
- Announcement: News → Why it matters → Next steps
- Lesson learned: Challenge → What happened → Takeaway

LINKEDIN BEST PRACTICES:
- Strong first line (hook) — make it impossible to scroll past
- Short paragraphs (1-2 sentences)
- Line breaks for readability
- Include relevant statistics naturally
- End with engagement driver (question or CTA)
- 150-300 words optimal

Return JSON:
{
    "post_content": "the complete LinkedIn post",
    "hook": "first line extracted",
    "word_count": "number",
    "facts_used": ["research points incorporated"]
}
