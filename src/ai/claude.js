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

// task carries title/description/requiredOutput so the note can judge fit
// against what was actually asked for, not just summarize in a vacuum. This
// is an AI pre-review aid for the human reviewer - it never approves or
// rejects anything itself.
export async function summarizeSubmission(submissionText, task) {
  const message = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 250,
    messages: [
      {
        role: 'user',
        content:
          'A contributor submitted the text below for this task:\n' +
          `Title: ${task.title}\nDescription: ${task.description}\n` +
          `Required output: ${task.requiredOutput || '(not specified)'}\n\n` +
          'Briefly summarize the submission for a human reviewer, and note whether it looks complete and matches ' +
          `the required output, or seems to be missing something:\n\n${submissionText}`,
      },
    ],
  });
  return message.content[0].text;
}

// Same purpose as summarizeSubmission but for an image (e.g. a screenshot
// submission) via Claude's vision input. imageBase64 must not include the
// "data:image/...;base64," prefix.
export async function reviewSubmissionImage(imageBase64, mediaType, task) {
  const message = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 250,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          {
            type: 'text',
            text:
              'A contributor submitted this image for the task below. Briefly describe what the image shows, ' +
              'and note whether it looks like it satisfies the task, for a human reviewer:\n' +
              `Title: ${task.title}\nDescription: ${task.description}\n` +
              `Required output: ${task.requiredOutput || '(not specified)'}`,
          },
        ],
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
