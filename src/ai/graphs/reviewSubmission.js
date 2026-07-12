import { StateGraph, END } from '@langchain/langgraph';
import { anthropic, HAIKU_MODEL } from '../anthropicClient.js';

function textPrompt(task, submissionText) {
  return (
    'A contributor submitted the text below for this task:\n' +
    `Title: ${task.title}\nDescription: ${task.description}\n` +
    `Required output: ${task.requiredOutput || '(not specified)'}\n\n` +
    'Briefly summarize the submission for a human reviewer, and note whether it looks complete and matches ' +
    `the required output, or seems to be missing something:\n\n${submissionText}`
  );
}

function imagePrompt(task) {
  return (
    'A contributor submitted this image for the task below. Briefly describe what the image shows, ' +
    'and note whether it looks like it satisfies the task, for a human reviewer:\n' +
    `Title: ${task.title}\nDescription: ${task.description}\n` +
    `Required output: ${task.requiredOutput || '(not specified)'}`
  );
}

function pdfPrompt(task) {
  return (
    'A contributor submitted this PDF for the task below. Briefly summarize its contents, and note ' +
    'whether it looks like it satisfies the task, for a human reviewer:\n' +
    `Title: ${task.title}\nDescription: ${task.description}\n` +
    `Required output: ${task.requiredOutput || '(not specified)'}`
  );
}

const graph = new StateGraph({
  channels: {
    kind: null,
    payload: null,
    mediaType: null,
    task: null,
    note: null,
  },
})
  .addNode('route', () => ({}))
  .addNode('reviewText', async (state) => {
    const message = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 250,
      messages: [{ role: 'user', content: textPrompt(state.task, state.payload) }],
    });
    return { note: message.content[0].text };
  })
  .addNode('reviewImage', async (state) => {
    const message = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 250,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: state.mediaType || 'image/jpeg',
                data: state.payload,
              },
            },
            { type: 'text', text: imagePrompt(state.task) },
          ],
        },
      ],
    });
    return { note: message.content[0].text };
  })
  .addNode('reviewPdf', async (state) => {
    const message = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: state.payload },
            },
            { type: 'text', text: pdfPrompt(state.task) },
          ],
        },
      ],
    });
    return { note: message.content[0].text };
  })
  .addConditionalEdges('route', (state) => state.kind, {
    text: 'reviewText',
    image: 'reviewImage',
    pdf: 'reviewPdf',
  })
  .addEdge('reviewText', END)
  .addEdge('reviewImage', END)
  .addEdge('reviewPdf', END)
  .setEntryPoint('route');

export const reviewSubmissionGraph = graph.compile();
