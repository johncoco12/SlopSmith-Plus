/** @param {import('../../backend/src/domain/interfaces/plugins/PluginContext.js').PluginContext} ctx */
export async function setup(ctx) {
  ctx.permissions.define('themes:manage', 'Change the application color theme');

  ctx.routes.register('GET', 'theme', async (_req, reply) => {
    const theme = await ctx.db.get('theme') ?? 'default';
    return reply.send({ theme });
  });

  ctx.routes.register(
    'PATCH',
    'theme',
    async (req, reply) => {
      const { theme } = req.body ?? {};
      if (typeof theme !== 'string') return reply.code(400).send({ error: 'theme required' });
      await ctx.db.set('theme', theme);
      ctx.logger.info('Theme changed', { theme });
      return reply.send({ theme });
    },
    { requirePermission: 'themes:manage' },
  );
}

export async function teardown(ctx) {
  ctx.logger.info('Themes plugin unloaded');
}
