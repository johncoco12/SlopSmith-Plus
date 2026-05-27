// Uses the app's own Vue instance (window.__slopsmithVue) so reactive state
// is tracked by the same renderer that mounts the component.
// Tailwind classes are available because tailwind.config.js scans ../plugins/**/*.js

const { h, ref, reactive, onMounted, onUnmounted, defineComponent } = window.__slopsmithVue;

function Icon(paths, cls = 'w-4 h-4') {
  return h('svg', {
    class: cls,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    viewBox: '0 0 24 24',
  }, (Array.isArray(paths) ? paths : [paths]).map(d => h('path', { d })));
}

const ICONS = {
  trophy: [
    'M6 9H4.5a2.5 2.5 0 0 1 0-5H6',
    'M18 9h1.5a2.5 2.5 0 0 0 0-5H18',
    'M4 22h16',
    'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22',
    'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22',
    'M18 2H6v7a6 6 0 0 0 12 0V2z',
  ],
  refresh: [
    'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8',
    'M21 3v5h-5',
    'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16',
    'M8 16H3v5',
  ],
  star:   'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 19.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 7.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
  trash:  [
    'M3 6h18',
    'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6',
    'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2',
  ],
};

// ─── Score helpers ────────────────────────────────────────────────────────────

function gradeClass(score) {
  if (score >= 95) return 'score-s';
  if (score >= 80) return 'score-a';
  if (score >= 60) return 'score-b';
  if (score >= 40) return 'score-c';
  return 'score-d';
}

function fmtScore(n)  { return `${Math.round(n)}%`; }
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function RankBadge(i) {
  const cls =
    i === 0 ? 'text-gold font-bold' :
    i === 1 ? 'text-gray-400 font-semibold' :
    i === 2 ? 'text-amber-600 font-semibold' :
    'text-gray-600';
  return h('span', { class: `text-sm tabular-nums ${cls}` }, String(i + 1));
}

let _ctx = null;

const LeaderboardBadge = defineComponent({
  name: 'LeaderboardBadge',
  props: { song: { type: Object, required: true } },
  setup(props) {
    const rank = ref(null);

    onMounted(async () => {
      if (!_ctx) return;
      const trackId = props.song.trackId ?? props.song.filename;
      if (!trackId) return;
      try {
        const data = await _ctx.api.get(`scores/${encodeURIComponent(trackId)}`);
        if (data.scores?.length) rank.value = 1;
      } catch { /* no permission or no data */ }
    });

    return () => {
      if (rank.value == null) return null;
      return h('span', {
        class: 'score-badge score-b shrink-0',
        title: `Leaderboard rank: #${rank.value}`,
      }, [Icon(ICONS.trophy, 'w-2.5 h-2.5')]);
    };
  },
});

const PlayerOverlay = defineComponent({
  name: 'LeaderboardOverlay',
  props: { trackId: { type: String, default: '' } },
  setup(props) {
    const personalBest = ref(null);

    onMounted(async () => {
      if (!_ctx || !props.trackId) return;
      try {
        const data = await _ctx.api.get(`scores/${encodeURIComponent(props.trackId)}`);
        const best = (data.scores ?? []).reduce(
          (b, s) => (s.score > (b?.score ?? -1) ? s : b), null,
        );
        if (best) personalBest.value = best.score;
      } catch { /* stay hidden */ }
    });

    const off = _ctx?.events.on('leaderboard:submitted', (detail) => {
      if (detail?.trackId === props.trackId)
        personalBest.value = Math.max(personalBest.value ?? 0, detail.score);
    });
    onUnmounted(() => off?.());

    return () => {
      if (personalBest.value == null) return null;
      return h('div', {
        class: 'absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg pointer-events-none z-20',
        style: { background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.10)' },
      }, [
        Icon(ICONS.trophy, 'w-3 h-3 text-gray-500'),
        h('span', { class: `score-badge ${gradeClass(personalBest.value)}` }, fmtScore(personalBest.value)),
      ]);
    };
  },
});

const SettingsPanel = defineComponent({
  name: 'LeaderboardSettings',
  setup() {
    const stats    = reactive({ totalEntries: 0, trackCount: 0 });
    const clearing = ref(false);
    const cleared  = ref(false);
    const error    = ref('');

    onMounted(async () => {
      if (!_ctx) return;
      try {
        const data = await _ctx.api.get('stats');
        stats.totalEntries = data.totalEntries ?? 0;
        stats.trackCount   = data.trackCount   ?? 0;
      } catch { /* no permission */ }
    });

    async function clearAll() {
      if (!_ctx || clearing.value) return;
      clearing.value = true;
      error.value    = '';
      try {
        await _ctx.api.delete('scores');
        stats.totalEntries = 0;
        stats.trackCount   = 0;
        cleared.value = true;
        setTimeout(() => { cleared.value = false; }, 3000);
      } catch (e) {
        error.value = e.message ?? 'Failed to clear scores';
      } finally {
        clearing.value = false;
      }
    }

    return () =>
      h('section', { class: 'settings-section' }, [
        h('h2', { class: 'flex items-center gap-2 text-sm font-semibold text-gray-200 mb-3' }, [
          Icon(ICONS.trophy, 'w-4 h-4 text-accent'),
          'Leaderboard',
        ]),
        h('div', { class: 'flex gap-6 text-sm text-gray-400 mb-3' }, [
          h('span', null, [h('b', { class: 'text-gray-200' }, String(stats.totalEntries)), ' scores']),
          h('span', null, [h('b', { class: 'text-gray-200' }, String(stats.trackCount)), ' tracks']),
        ]),
        h('button', {
          class: 'flex items-center gap-1.5 settings-btn !text-red-400 !border-red-500/30 !bg-red-500/10 hover:!bg-red-500/20',
          disabled: clearing.value,
          onClick: clearAll,
        }, [
          Icon(ICONS.trash, 'w-3.5 h-3.5'),
          clearing.value ? 'Clearing…' : cleared.value ? 'Cleared' : 'Clear all scores',
        ]),
        error.value
          ? h('p', { class: 'text-red-400 text-xs mt-2' }, error.value)
          : null,
      ]);
  },
});

const LeaderboardPage = defineComponent({
  name: 'LeaderboardPage',
  setup() {
    const scores  = ref([]);
    const loading = ref(true);
    const error   = ref('');

    async function fetchScores() {
      if (!_ctx) return;
      loading.value = true;
      error.value   = '';
      try {
        const data = await _ctx.api.get('scores?limit=50');
        scores.value = data.scores ?? [];
      } catch (e) {
        error.value = e.message ?? 'Failed to load leaderboard';
      } finally {
        loading.value = false;
      }
    }

    onMounted(fetchScores);
    const off = _ctx?.events.on('leaderboard:submitted', fetchScores);
    onUnmounted(() => off?.());

    return () =>
      h('div', { class: 'min-h-screen bg-dark-800 px-4 pb-12' }, [

        h('div', { class: 'flex items-center justify-between py-4 border-b border-white/[.06] mb-6' }, [
          h('div', { class: 'flex items-center gap-2' }, [
            Icon(ICONS.trophy, 'w-5 h-5 text-accent'),
            h('h1', { class: 'text-base font-semibold text-gray-100' }, 'Leaderboard'),
          ]),

          h('button', {
            class: 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 bg-dark-600 border border-white/[.06] hover:bg-dark-500 hover:text-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed',
            disabled: loading.value,
            onClick: fetchScores,
          }, [
            Icon(ICONS.refresh, `w-3.5 h-3.5 ${loading.value ? 'animate-spin' : ''}`),
            loading.value ? 'Loading…' : 'Refresh',
          ]),
        ]),

        loading.value
          ? h('div', { class: 'flex items-center justify-center gap-2 py-20 text-gray-500 text-sm' }, [
              Icon(ICONS.refresh, 'w-4 h-4 animate-spin'),
              'Loading scores…',
            ])
          : error.value
            ? h('div', { class: 'px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm' }, error.value)
            : scores.value.length === 0
              ? h('div', { class: 'flex flex-col items-center gap-3 py-20 text-gray-500' }, [
                  Icon(ICONS.trophy, 'w-8 h-8 opacity-30'),
                  h('p', { class: 'text-sm' }, 'No scores yet — play some songs!'),
                ])
              : ScoreTable(scores.value),
      ]);
  },
});

function ScoreTable(entries) {
  const cols = '2rem 1fr 6rem 4.5rem 5.5rem';

  return h('div', { class: 'bg-dark-700 border border-white/[.06] rounded-xl overflow-hidden' }, [

    h('div', {
      class: 'grid px-4 py-2 text-xs uppercase tracking-wider text-gray-600 border-b border-white/[.06]',
      style: { gridTemplateColumns: cols },
    }, [
      h('span', null, '#'),
      h('span', null, 'Song'),
      h('span', { class: 'text-right' }, 'Player'),
      h('span', { class: 'text-right' }, 'Score'),
      h('span', { class: 'text-right' }, 'Date'),
    ]),

    ...entries.map((entry, i) =>
      h('div', {
        key: `${entry.trackId}-${i}`,
        class: 'grid px-4 py-2.5 items-center hover:bg-white/[.015] transition-colors',
        style: {
          gridTemplateColumns: cols,
          borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
        },
      }, [
        RankBadge(i),

        h('div', { class: 'min-w-0 pr-3' }, [
          h('p', { class: 'text-sm text-gray-200 truncate leading-snug' }, entry.title ?? entry.trackId),
          entry.artist
            ? h('p', { class: 'text-xs text-gray-500 truncate' }, entry.artist)
            : null,
        ]),

        h('p', { class: 'text-xs text-gray-500 text-right truncate' }, entry.playerName ?? '—'),

        h('div', { class: 'flex justify-end' }, [
          h('span', { class: `score-badge ${gradeClass(entry.score)}` }, fmtScore(entry.score)),
        ]),

        h('p', { class: 'text-xs text-gray-600 text-right tabular-nums' }, fmtDate(entry.submittedAt)),
      ]),
    ),
  ]);
}

export async function setup(ctx) {
  _ctx = ctx;
  ctx.slots.register('library-card-badge', LeaderboardBadge, { order: 10 });
  ctx.slots.register('player-overlay',     PlayerOverlay,     { order: 20 });
  ctx.slots.register('settings-panel',     SettingsPanel,     { order: 50 });
  ctx.events.on('leaderboard:submitted', (detail) => {
    console.info('[Leaderboard] New score recorded', detail);
  });
  ctx.events.emit('leaderboard:ready', { pluginId: ctx.pluginId });
}

export default LeaderboardPage;
