// Apply theme before Vue renders to avoid any flash of default colors.
const THEMES = {
  default:        { accent: '64 128 224',   dark800: '17 17 17',    dark700: '22 22 22',    dark600: '30 30 30',    dark500: '42 42 42',    fg: '229 231 235', fgMuted: '156 163 175', line: '255 255 255', danger: '248 113 113' },
  obsidian:       { accent: '34 197 94',    dark800: '10 15 12',    dark700: '15 22 17',    dark600: '22 31 25',    dark500: '31 42 35',    fg: '220 235 225', fgMuted: '148 180 155', line: '255 255 255', danger: '248 113 113' },
  ember:          { accent: '249 115 22',   dark800: '17 12 8',     dark700: '22 16 10',    dark600: '31 22 14',    dark500: '42 30 18',    fg: '235 220 210', fgMuted: '180 155 135', line: '255 255 255', danger: '248 113 113' },
  rose:           { accent: '244 63 94',    dark800: '17 10 12',    dark700: '22 13 16',    dark600: '31 18 22',    dark500: '42 24 30',    fg: '235 220 225', fgMuted: '180 145 155', line: '255 255 255', danger: '248 113 113' },
  sage:           { accent: '20 184 166',   dark800: '10 16 16',    dark700: '13 22 22',    dark600: '18 31 31',    dark500: '24 42 42',    fg: '220 235 235', fgMuted: '145 180 180', line: '255 255 255', danger: '248 113 113' },
  violet:         { accent: '168 85 247',   dark800: '14 10 18',    dark700: '19 13 24',    dark600: '27 18 33',    dark500: '36 24 44',    fg: '225 215 235', fgMuted: '165 140 185', line: '255 255 255', danger: '248 113 113' },
  solarized:      { accent: '38 139 210',   dark800: '0 43 54',     dark700: '4 49 60',     dark600: '7 54 66',     dark500: '15 66 80',    fg: '147 161 161', fgMuted: '101 123 131', line: '238 232 213', danger: '220 50 47' },
  light:          { accent: '37 99 235',    dark800: '248 248 252',  dark700: '240 240 246', dark600: '228 228 236', dark500: '216 216 226', fg: '30 41 59',    fgMuted: '100 116 139', line: '0 0 0',       danger: '220 38 38' },
  'solarized-light': { accent: '38 139 210', dark800: '253 246 227', dark700: '238 232 213', dark600: '228 222 200', dark500: '218 210 186', fg: '7 54 66',     fgMuted: '101 123 131', line: '0 43 54',     danger: '220 50 47' },
};

const THEME_LABELS = {
  default:   'Default',
  obsidian:  'Obsidian',
  ember:     'Ember',
  rose:      'Rose',
  sage:      'Sage',
  violet:    'Violet',
  solarized: 'Solarized',
  light:            'Light',
  'solarized-light': 'Sol. Light',
};

function applyTheme(id) {
  const t = THEMES[id] ?? THEMES.default;
  const r = document.documentElement.style;
  r.setProperty('--accent',    t.accent);
  r.setProperty('--dark-800',  t.dark800);
  r.setProperty('--dark-700',  t.dark700);
  r.setProperty('--dark-600',  t.dark600);
  r.setProperty('--dark-500',  t.dark500);
  r.setProperty('--fg',        t.fg);
  r.setProperty('--fg-muted',  t.fgMuted);
  r.setProperty('--line',      t.line);
  r.setProperty('--danger',    t.danger);
  const LIGHT_THEMES = new Set(['light', 'solarized-light']);
  document.documentElement.classList.toggle('theme-light', LIGHT_THEMES.has(id));
}

// Immediate apply from localStorage so there's no visible flash before setup() runs.
const _saved = localStorage.getItem('slopsmith:theme');
if (_saved && THEMES[_saved]) applyTheme(_saved);

// ─────────────────────────────────────────────────────────────────────────────

const { h, ref, onMounted, defineComponent } = window.__slopsmithVue;

let _ctx = null;

const SettingsPanel = defineComponent({
  name: 'ThemesSettings',
  setup() {
    const active  = ref(localStorage.getItem('slopsmith:theme') ?? 'default');
    const saving  = ref(false);

    onMounted(async () => {
      if (!_ctx) return;
      try {
        const data = await _ctx.api.get('theme');
        if (data.theme && THEMES[data.theme]) {
          active.value = data.theme;
          applyTheme(data.theme);
          localStorage.setItem('slopsmith:theme', data.theme);
        }
      } catch { /* no permission — stay on local */ }
    });

    async function select(id) {
      if (saving.value || active.value === id) return;
      active.value = id;
      applyTheme(id);
      localStorage.setItem('slopsmith:theme', id);
      if (!_ctx) return;
      saving.value = true;
      try { await _ctx.api.patch('theme', { theme: id }); } catch { /* non-fatal */ }
      finally { saving.value = false; }
    }

    return () =>
      h('section', { class: 'settings-section' }, [
        h('h2', { class: 'text-sm font-semibold text-gray-200 mb-3' }, 'Themes'),
        h('div', { class: 'grid grid-cols-3 gap-2' },
          Object.keys(THEMES).map(id => {
            const t = THEMES[id];
            const isActive = active.value === id;
            return h('button', {
              key: id,
              class: [
                'flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer',
                isActive
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-white/[.06] bg-dark-600 text-gray-400 hover:border-white/15 hover:text-gray-300',
              ].join(' '),
              onClick: () => select(id),
            }, [
              h('div', {
                class: 'w-6 h-6 rounded-full ring-2 ring-white/10',
                style: { background: `rgb(${t.accent})` },
              }),
              THEME_LABELS[id],
            ]);
          }),
        ),
      ]);
  },
});

export async function setup(ctx) {
  _ctx = ctx;
  ctx.slots.register('settings-panel', SettingsPanel, { order: 10 });

  // Sync to server-persisted theme on login.
  ctx.events.on('auth:login', async () => {
    try {
      const data = await ctx.api.get('theme');
      if (data.theme && THEMES[data.theme]) {
        applyTheme(data.theme);
        localStorage.setItem('slopsmith:theme', data.theme);
      }
    } catch { /* no permission */ }
  });
}
