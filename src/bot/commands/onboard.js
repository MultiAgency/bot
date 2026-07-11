import { prisma } from '../../db.js';
import { evaluateCandidate } from '../../candidateEvaluation.js';

export function registerOnboard(bot) {
  bot.command('onboard', async (ctx) => {
    const twitterHandle = ctx.message.text.split(' ')[1]?.replace(/^@/, '');
    if (!twitterHandle) {
      return ctx.reply('Usage: /onboard <twitter_handle> (without @)');
    }

    const contributor = await prisma.contributor.upsert({
      where: { telegramUserId: BigInt(ctx.from.id) },
      update: {
        telegramUsername: ctx.from.username ?? null,
        displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        twitterHandle,
      },
      create: {
        telegramUserId: BigInt(ctx.from.id),
        telegramUsername: ctx.from.username ?? null,
        displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
        twitterHandle,
      },
    });

    const { telegramScore, twitterScore, socialTrustScore, eligibilityTier } =
      await evaluateCandidate(contributor);

    await prisma.contributor.update({
      where: { id: contributor.id },
      data: {
        isRegistered: true,
        telegramScore,
        twitterScore,
        socialTrustScore,
        eligibilityTier,
        lastEvaluatedAt: new Date(),
      },
    });

    await ctx.reply(
      [
        `Onboarded @${twitterHandle}. Initial trust tier: ${eligibilityTier}.`,
        `Telegram score: ${telegramScore.toFixed(2)}`,
        twitterScore == null
          ? 'Twitter score: unavailable (not configured on this deployment, or the profile couldn\'t be found)'
          : `Twitter score: ${twitterScore.toFixed(2)}`,
        `Social trust score: ${socialTrustScore.toFixed(2)}`,
        '',
        'Your tier may be re-evaluated as you complete tasks. Use /tasks to see what you\'re eligible for.',
      ].join('\n')
    );
  });
}
