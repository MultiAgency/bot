import { StateGraph, END } from '@langchain/langgraph';
import { anthropic, HAIKU_MODEL } from '../anthropicClient.js';

const DRAFT_TASK_PROMPT = `You turn a short, informal request into a structured task draft for a contributor coordination bot. Write a clear title, a description detailed enough for a contributor to act on without asking follow-up questions, and the required output format.

Respond with ONLY valid JSON, no prose, no markdown fences, in exactly this shape:
{"title": string, "description": string, "requiredOutput": string|null, "category": string|null, "skillTags": string[]}

Request:
`;

const graph = new StateGraph({
  channels: {
    shortPrompt: null,
    raw: null,
    draft: null,
  },
})
  .addNode('generate', async (state) => {
    const message = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: DRAFT_TASK_PROMPT + state.shortPrompt }],
    });
    return { raw: message.content[0].text.trim() };
  })
  .addNode('validate', (state) => {
    try {
      const parsed = JSON.parse(state.raw);
      if (!parsed.title || !parsed.description) return { draft: null };
      return { draft: parsed };
    } catch {
      return { draft: null };
    }
  })
  .addEdge('generate', 'validate')
  .addEdge('validate', END)
  .setEntryPoint('generate');

const compiled = graph.compile();

// Returns null if the model's response isn't parseable JSON or is missing
// required fields, so callers can fall back to the manual /newtask flow
// instead of creating a broken task.
export async function draftTask(shortPrompt) {
  const state = await compiled.invoke({ shortPrompt });
  return state.draft;
}
