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
