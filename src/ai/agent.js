import Anthropic from '@anthropic-ai/sdk';
import { AGENT_TOOLS, executeAgentTool } from './agentTools.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const AGENT_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are the AI assistant for a Telegram contributor-coordination bot, running in "AI mode" inside a group where slash commands have been replaced by natural conversation. Contributors and admins talk to you directly to browse tasks, apply, and (if they are admins) create or review tasks.

Use the tools available to look things up or propose actions. Every state-changing tool only shows the user a confirmation card with real buttons - it does NOT perform the action itself. Never claim you created/approved/applied something unless you actually called the matching tool, and always make clear the user still needs to tap the button shown ("I've drafted this as task #4 - tap Approve to open it up").

Keep replies short and conversational, in the same language the user wrote in. If a request isn't something you have a tool for (e.g. reviewing a submission, assigning applicants, editing a field), say so briefly - don't invent a slash command, since commands are disabled in this room.`;

// Single-turn per message - no memory of earlier turns in this room. Good
// enough for "show me open tasks" / "create a task for X" / "apply me to
// #3" style requests; multi-turn context could be added later if needed.
const MAX_TOOL_ROUNDS = 4;

export async function runAgentTurn(ctx, userText) {
  const messages = [{ role: 'user', content: userText }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model: AGENT_MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      tools: AGENT_TOOLS,
      messages,
    });

    const toolUses = response.content.filter((b) => b.type === 'tool_use');

    if (toolUses.length === 0) {
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (text) await ctx.reply(text);
      return;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const use of toolUses) {
      const result = await executeAgentTool(ctx, use.name, use.input || {}).catch((err) => {
        console.error(`Agent tool "${use.name}" failed:`, err);
        return { error: 'Something went wrong running that action.' };
      });
      toolResults.push({ type: 'tool_result', tool_use_id: use.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  await ctx.reply("⚠️ Sorry, I couldn't finish figuring that out - try rephrasing, or ask an admin.");
}
