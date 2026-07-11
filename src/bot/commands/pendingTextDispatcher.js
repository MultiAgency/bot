import { peekPending, clearPending } from '../pendingActions.js';
import { validateAssignmentForSubmission, submitTextOrLink, replyForTextSubmission } from './submitCore.js';
import { handleNewTaskWizardStep } from './newTaskCore.js';
import { handleOnboardWizardStep } from './onboard.js';

// Dispatches a plain (non-command) text message to whichever pending
// conversational flow the sender is in: two-step submission or the
// /newtask wizard. Must run before registerSignalListener so a message
// that's actually fulfilling a pending flow doesn't get treated as a chat
// signal instead.
export function registerPendingTextDispatcher(bot) {
  bot.command('cancel', async (ctx) => {
    const had = peekPending(ctx.from.id);
    clearPending(ctx.from.id);
    await ctx.reply(had ? 'Cancelled.' : 'Nothing to cancel.');
  });

  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();

    const entry = peekPending(ctx.from.id);
    if (!entry) return next();

    if (entry.type === 'submission') {
      clearPending(ctx.from.id);
      const { application, error } = await validateAssignmentForSubmission(ctx, entry.data.taskId);
      if (error) return ctx.reply(error);

      const submissionFileMetadata = await submitTextOrLink(ctx, application, ctx.message.text.trim());
      return replyForTextSubmission(ctx, entry.data.taskId, submissionFileMetadata);
    }

    if (entry.type === 'newtask_wizard') {
      return handleNewTaskWizardStep(ctx, entry);
    }

    if (entry.type === 'onboard_wizard') {
      // The job-role step is button-based (see the bot.action handler in
      // onboard.js) - if we're still on it, a stray text message here isn't
      // part of the flow. Fall through to next() rather than misinterpret it.
      if (entry.data.step === 'jobRole') return next();
      return handleOnboardWizardStep(ctx, entry);
    }

    return next();
  });
}
