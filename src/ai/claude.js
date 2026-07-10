import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

export async function suggestTaskDescription(shortPrompt) {
  const message = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content:
          'Write a short, clear task description for a contributor, including the required output format, ' +
          `based on the following request:\n${shortPrompt}`,
      },
    ],
  });
  return message.content[0].text;
}

export async function summarizeSubmission(submissionText) {
  const message = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content:
          'Briefly summarize the following submission for a reviewer, and note whether it looks complete or is missing something:\n' +
          submissionText,
      },
    ],
  });
  return message.content[0].text;
}

const SIGNAL_EVAL_PROMPT = `You are the signal-detection layer for a contributor coordination bot. Given a chat message, decide whether it represents an opportunity worth turning into a task for contributors (e.g. an event, a request, a content opportunity, a community ask). Score it 0-10 combining importance, timeliness, and relevance. Only set shouldDraft to true if the score is 6 or higher AND there is enough information to draft a concrete task.

Respond with ONLY valid JSON, no prose, no markdown fences, in exactly this shape:
{"score": number, "reasoning": string, "shouldDraft": boolean, "title": string|null, "description": string|null, "category": string|null, "skillTags": string[]}

Message:
`;

// Returns null if the model's response isn't parseable JSON, so callers can
// fail safe (treat as "not a signal") instead of crashing on a bad response.
export async function evaluateSignal(messageText) {
  const message = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: SIGNAL_EVAL_PROMPT + messageText }],
  });

  const raw = message.content[0].text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
