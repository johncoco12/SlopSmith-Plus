/** @param {import('../../backend/src/domain/interfaces/plugins/PluginContext.js').PluginContext} ctx */
export async function setup(ctx) {
  // Serialize all score writes to prevent concurrent read-modify-write races.
  let writeQueue = Promise.resolve();
  const enqueueWrite = (fn) => {
    writeQueue = writeQueue.then(fn).catch(() => {});
    return writeQueue;
  };

  ctx.permissions.define(
    'leaderboard:view',
    'View the global leaderboard and per-track score history',
  );
  ctx.permissions.define(
    'leaderboard:manage',
    'Reset leaderboard data and manage score entries',
  );

  ctx.providers.register('leaderboard', 'default', {
    /** @returns {Promise<ScoreEntry[]>} */
    async getTopScores(limit = 10) {
      const scores = /** @type {any[]} */ (await ctx.db.get('scores') ?? []);
      return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },

    /** @returns {Promise<ScoreEntry[]>} */
    async getTrackScores(trackId) {
      return /** @type {any[]} */ (await ctx.db.get(`track:${trackId}`) ?? []);
    },
  });

  // On startup, backfill the leaderboard from existing TrackScore records so
  // scores played before the plugin was installed are visible immediately.
  ctx.hooks.on('server:startup', async () => {
    const trackScoresSvc = ctx.providers.get('trackScores');
    if (!trackScoresSvc) {
      ctx.logger.warn('trackScores provider not available — skipping backfill');
      return;
    }

    const existing = /** @type {any[]} */ (await ctx.db.get('scores') ?? []);
    const existingKeys = new Set(
      existing.map(e => `${e.profileId}:${e.trackId}`),
    );

    const allScores = await trackScoresSvc.getAll();
    let added = 0;

    for (const s of allScores) {
      const key = `${s.profileId}:${s.trackId}`;
      if (existingKeys.has(key)) continue; // already recorded (from hook)

      const entry = {
        trackId:     s.trackId,
        title:       s.title  ?? s.trackId,
        artist:      s.artist ?? '',
        score:       s.bestScore,
        profileId:   s.profileId,
        playerName:  s.playerName,
        submittedAt: s.lastPlayedAt instanceof Date
          ? s.lastPlayedAt.toISOString()
          : String(s.lastPlayedAt),
      };

      existing.push(entry);
      existingKeys.add(key);

      const trackBucket = /** @type {any[]} */ (await ctx.db.get(`track:${s.trackId}`) ?? []);
      trackBucket.push(entry);
      await ctx.db.set(`track:${s.trackId}`, trackBucket);

      added++;
    }

    if (added > 0) await ctx.db.set('scores', existing);
    ctx.logger.info('Leaderboard ready', { entryCount: existing.length, backfilled: added });
  });

  ctx.hooks.on('track:score:submitted', (payload) => {
    const { trackId, score, profileId, playerName, title, artist, submittedAt } = payload.data;

    const entry = {
      trackId:     String(trackId),
      title:       String(title  ?? trackId),
      artist:      String(artist ?? ''),
      score:       Number(score),
      profileId:   Number(profileId),
      playerName:  String(playerName ?? 'Anonymous'),
      submittedAt: String(submittedAt ?? new Date().toISOString()),
    };

    enqueueWrite(async () => {
      const global = /** @type {any[]} */ (await ctx.db.get('scores') ?? []);
      global.push(entry);
      await ctx.db.set('scores', global);

      const trackScores = /** @type {any[]} */ (await ctx.db.get(`track:${trackId}`) ?? []);
      trackScores.push(entry);
      await ctx.db.set(`track:${trackId}`, trackScores);

      ctx.logger.info('Leaderboard entry recorded via hook', { trackId, score, profileId });
    });
  });

  ctx.routes.register(
    'GET',
    'scores',
    async (req, reply) => {
      const limit = Math.min(Number(req.query?.limit ?? 10), 100);
      const scores = /** @type {any[]} */ (await ctx.db.get('scores') ?? []);
      const sorted = scores.sort((a, b) => b.score - a.score).slice(0, limit);
      return reply.send({ scores: sorted, total: scores.length });
    },
    { requirePermission: 'leaderboard:view' },
  );

  ctx.routes.register(
    'GET',
    'scores/:trackId',
    async (req, reply) => {
      const { trackId } = req.params;
      const scores = /** @type {any[]} */ (await ctx.db.get(`track:${trackId}`) ?? []);
      const sorted = scores.sort((a, b) => b.score - a.score);
      return reply.send({ trackId, scores: sorted });
    },
    { requirePermission: 'leaderboard:view' },
  );

  ctx.routes.register(
    'DELETE',
    'scores',
    async (_req, reply) => {
      const all = await ctx.db.list();
      for (const { key } of all) {
        await ctx.db.delete(key);
      }
      ctx.logger.warn('Leaderboard data cleared', { entriesRemoved: all.length });
      return reply.send({ ok: true, cleared: all.length });
    },
    { requirePermission: 'leaderboard:manage' },
  );

  ctx.routes.register(
    'GET',
    'stats',
    async (_req, reply) => {
      const all = await ctx.db.list();
      const globalKey = all.find((e) => e.key === 'scores');
      const totalEntries = globalKey ? /** @type {any[]} */ (globalKey.value).length : 0;
      const trackCount = all.filter((e) => e.key.startsWith('track:')).length;
      return reply.send({ totalEntries, trackCount });
    },
  );
}

export async function teardown(ctx) {
  ctx.logger.info('Leaderboard plugin unloaded');
}
