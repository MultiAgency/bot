import { StateGraph, END } from '@langchain/langgraph';
import { anthropic, HAIKU_MODEL } from '../anthropicClient.js';
import { draftTask } from './draftTask.js';

const SIGNAL_EVAL_PROMPT = `You are the signal-detection layer for a contributor coordination bot. Given a chat message, decide whether it represents an opportunity worth turning into a task for contributors (e.g. an event, a request, a content opportunity, a community ask). Score it 0-10 combining importance, timeliness, and relevance. Only set shouldDraft to true if the score is 6 or higher AND there is enough information to draft a concrete task.

Respond with ONLY valid JSON, no prose, no markdown fences, in exactly this shape:
{"score": number, "reasoning": string, "shouldDraft": boolean}

Message:
`;

const graph = new StateGraph({
  channels: {
    messageText: null,
    evaluation: null,
    draftOutput: null,
    result: null,
  },
})
  .addNode('evaluate', async (state) => {
    const message = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      messages: [{ role: 'user', content: SIGNAL_EVAL_PROMPT + state.messageText }],
    });
    try {
      return { evaluation: JSON.parse(message.content[0].text.trim()) };
    } catch {
      return { evaluation: null };
    }
  })
  .addNode('draft', async (state) => {
    const draftOutput = await draftTask(state.messageText);
    return { draftOutput };
  })
  .addNode('finalize', (state) => {
    if (!state.evaluation) return { result: null };
    return {
      result: {
        ...state.evaluation,
        title: state.draftOutput?.title ?? null,
        description: state.draftOutput?.description ?? null,
        category: state.draftOutput?.category ?? null,
        skillTags: state.draftOutput?.skillTags ?? [],
      },
    };
  })
  .addConditionalEdges(
    'evaluate',
    (state) => (state.evaluation?.shouldDraft ? 'draft' : 'finalize'),
    { draft: 'draft', finalize: 'finalize' },
  )
  .addEdge('draft', 'finalize')
  .addEdge('finalize', END)
  .setEntryPoint('evaluate');

const compiled = graph.compile();

// Returns null if the model's response isn't parseable JSON, so callers can
// fail safe (treat as "not a signal") instead of crashing on a bad response.
// Shape matches the old single-call evaluateSignal: {score, reasoning,
// shouldDraft, title, description, category, skillTags}.
export async function evaluateSignal(messageText) {
  const state = await compiled.invoke({ messageText });
  return state.result;
}
