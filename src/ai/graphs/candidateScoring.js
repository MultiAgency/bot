// LangGraph template for Phase 2 (candidate scoring / matching engine).
// Not called from the current MVP bot - use this as a scaffold for AI steps
// that need multiple nodes plus a human checkpoint, instead of calling the
// Claude API directly.
import { StateGraph, END } from '@langchain/langgraph';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const graph = new StateGraph({
  channels: {
    profile: null,
    signals: null,
    score: null,
  },
})
  .addNode('gatherSignals', async (state) => {
    // TODO Phase 2: collect Twitter/Telegram activity for state.profile
    return { signals: state.signals ?? 'no signals collected yet' };
  })
  .addNode('scoreCandidate', async (state) => {
    const message = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content:
            'Based on the following signals, rate the contributor\'s trustworthiness (0-10 scale) and briefly explain why:\n' +
            state.signals,
        },
      ],
    });
    return { score: message.content[0].text };
  })
  .addEdge('gatherSignals', 'scoreCandidate')
  .addEdge('scoreCandidate', END)
  .setEntryPoint('gatherSignals');

export const candidateScoringGraph = graph.compile();
