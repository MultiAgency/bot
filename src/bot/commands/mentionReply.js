// When the bot is @mentioned in a group with a plain message (not a
// command), it otherwise falls through silently: no pending flow claims it,
// and signal detection (if even enabled for that room) only reacts when a
// message clears the score threshold. This gives an immediate acknowledgment
// so "tagging the bot" never looks like it's not working. Still calls
// next() so signal detection gets a chance to evaluate the same message as
// a potential task signal.
export function registerMentionReply(bot) {
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    if (ctx.chat.type === 'private') return next(); // no mention needed in a DM

    const username = ctx.botInfo?.username;
    if (!username || !ctx.message.text.includes(`@${username}`)) return next();

    await ctx.reply(
      "👋 Hey, I'm here! Use /help to see what I can do, /tasks to see open tasks, or /newtask to create one."
    );

    return next();
  });
}
