import './styles.css';

const app = document.querySelector('#app');
const THEME_STORAGE_KEY = 'vexl-privacy-clinic-theme-mode';
const themeModes = ['light', 'dark', 'system'];
const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const state = {
  selected: new Set(),
  config: null,
  adviceVisible: false,
  themeMode: getInitialThemeMode(),
};

function getInitialThemeMode() {
  const savedMode = localStorage.getItem(THEME_STORAGE_KEY);
  return themeModes.includes(savedMode) ? savedMode : 'system';
}

function getResolvedTheme() {
  return state.themeMode === 'system'
    ? systemThemeQuery.matches
      ? 'dark'
      : 'light'
    : state.themeMode;
}

function applyTheme() {
  const resolvedTheme = getResolvedTheme();
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themeMode = state.themeMode;
  document.documentElement.style.colorScheme = resolvedTheme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolvedTheme === 'dark' ? '#050604' : '#f4f1e8');
}

function setThemeMode(mode) {
  state.themeMode = mode;
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  applyTheme();
  render();
}

async function loadConfig() {
  const [questionConfig, diagnosticConfig] = await Promise.all([
    fetch('/config/questions.json').then((response) => response.json()),
    fetch('/config/diagnostics.json').then((response) => response.json()),
  ]);

  state.config = { questionConfig, diagnosticConfig };
}

function getScore() {
  return state.config.questionConfig.questions
    .filter((question) => state.selected.has(question.id))
    .reduce((total, question) => total + question.weight, 0);
}

function getDominantCategory() {
  const totals = {};

  state.config.questionConfig.questions
    .filter((question) => state.selected.has(question.id))
    .forEach((question) => {
      question.affects.forEach((category) => {
        totals[category] = (totals[category] || 0) + question.weight;
      });
    });

  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'p2p';
}

function getDiagnosis(score) {
  return state.config.diagnosticConfig.diagnoses.find(
    (diagnosis) => score >= diagnosis.minScore && score <= diagnosis.maxScore,
  );
}

function getSelectedQuestions() {
  return state.config.questionConfig.questions.filter((question) =>
    state.selected.has(question.id),
  );
}

function goTo(screen) {
  window.location.hash = screen === 'results' ? '#results' : screen === 'intake' ? '#intake' : '';
  state.adviceVisible = false;
  render();
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
}

function renderHeader() {
  return `
    <header class="topbar">
      <div class="brand-lockup">
        <img class="logo" src="/assets/logos/vexl-logo-white.svg" alt="Vexl" />
      </div>
      <div class="topbar-actions">
        <div class="theme-switcher" aria-label="Color theme">
          ${themeModes
            .map(
              (mode) => `
                <button
                  class="theme-option ${state.themeMode === mode ? 'is-active' : ''}"
                  type="button"
                  data-theme-mode="${mode}"
                  aria-pressed="${state.themeMode === mode}"
                >
                  ${mode}
                </button>
              `,
            )
            .join('')}
        </div>
        <div class="clinic-pill" aria-label="Clinic name">
          ${state.config.diagnosticConfig.clinicName}
        </div>
      </div>
    </header>
  `;
}

function bindHeaderActions() {
  app.querySelectorAll('[data-theme-mode]').forEach((button) => {
    button.addEventListener('click', (event) => {
      setThemeMode(event.currentTarget.dataset.themeMode);
    });
  });
}

function renderStart() {
  const { questionConfig } = state.config;

  app.innerHTML = `
    <main class="shell start-shell">
      ${renderHeader()}
      <section class="start-screen">
        <div class="start-copy">
          <p class="eyebrow">${questionConfig.eyebrow}</p>
          <h1>Check your Digital Health</h1>
          <button class="primary-button start-button" data-action="start">Check my health</button>
        </div>
        <div class="no-kyc-stamp" aria-hidden="true">NO KYC</div>
      </section>
    </main>
  `;

  app.querySelector('[data-action="start"]').addEventListener('click', () => goTo('intake'));
  bindHeaderActions();
}

function renderIntake() {
  const { questionConfig } = state.config;
  const selectedCount = state.selected.size;

  app.innerHTML = `
    <main class="shell intake-shell">
      ${renderHeader()}
      <section class="hero-grid">
        <div class="intro">
          <h1 class="screen-title">Tap every symptom <span>Multiple answers are allowed.</span></h1>
        </div>
        <aside class="status-card">
          <div class="status-card-top">
            <img src="/assets/logos/glasses-black.svg" alt="" />
            <p>symptoms</p>
          </div>
          <span>${selectedCount || '0'}</span>
          <small>${selectedCount ? 'marked on file' : 'blank intake'}</small>
        </aside>
      </section>

      <section class="question-grid" aria-label="KYC symptoms">
        ${questionConfig.questions
          .map(
            (question, index) => `
              <label class="question-card ${state.selected.has(question.id) ? 'is-selected' : ''}">
                <input type="checkbox" data-question-id="${question.id}" ${state.selected.has(question.id) ? 'checked' : ''} />
                <span class="checkmark">${state.selected.has(question.id) ? '✓' : ''}</span>
                <span class="question-number">${String(index + 1).padStart(2, '0')}</span>
                <span class="question-text">${question.label}</span>
                <span class="question-state">${state.selected.has(question.id) ? 'Selected' : 'Tap if yes'}</span>
              </label>
            `,
          )
          .join('')}
      </section>

      <footer class="action-bar">
        <button class="primary-button" data-action="confirm">${questionConfig.confirmLabel}</button>
      </footer>
    </main>
  `;

  app.querySelectorAll('[data-question-id]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const id = event.currentTarget.dataset.questionId;
      if (event.currentTarget.checked) {
        state.selected.add(id);
      } else {
        state.selected.delete(id);
      }
      renderIntake();
    });
  });

  app.querySelector('[data-action="confirm"]').addEventListener('click', () => goTo('results'));
  bindHeaderActions();
}

function renderResults() {
  const { diagnosticConfig } = state.config;
  const score = getScore();
  const diagnosis = getDiagnosis(score);
  const symptoms = getSelectedQuestions();
  const symptomText = symptoms.length
    ? symptoms.map((question) => question.shortLabel).join(', ')
    : 'No symptoms detected, but they could appear soon. Get your prevention prescription before symptoms appear.';

  app.innerHTML = `
    <main class="shell results-shell">
      ${renderHeader()}
      <section class="diagnosis-screen">
        <div class="diagnosis-card">
          <p class="eyebrow">${diagnosticConfig.resultEyebrow}</p>
          <p class="diagnosis-opener">${diagnosis.opener}</p>
          <h1>${diagnosis.title}</h1>
          <p class="result-summary">${diagnosis.summary}</p>

          <div class="diagnosis-meta">
            <span>${diagnosticConfig.scoreLabel}: ${score}</span>
            <span>${diagnosis.severity}</span>
            <span>${diagnosis.badge}</span>
          </div>
        </div>

        <div class="clinic-note ${state.adviceVisible ? 'has-advice' : ''}">
          <p class="panel-label">Symptoms on file</p>
          ${
            state.adviceVisible
              ? `
                <h2>Scan Vexl</h2>
                <p class="activation-copy">${diagnosticConfig.activationText}</p>
                <div class="qr-block">
                  <img src="/assets/images/vexl-download-qr.webp" alt="Vexl download QR code" />
                  <span>Download app</span>
                </div>
              `
              : `
                <p>${symptomText}</p>
              `
          }
        </div>
      </section>

      <footer class="action-bar">
        <button class="secondary-button" data-action="reset">${diagnosticConfig.resetLabel}</button>
        ${
          state.adviceVisible
            ? ''
            : `<button class="primary-button" data-action="advice">${diagnosticConfig.actionLabel}</button>`
        }
      </footer>
    </main>
  `;

  app.querySelector('[data-action="reset"]').addEventListener('click', () => {
    state.selected.clear();
    goTo('start');
  });

  app.querySelector('[data-action="advice"]')?.addEventListener('click', () => {
    state.adviceVisible = true;
    renderResults();
  });
  bindHeaderActions();
}

function render() {
  if (!state.config) return;

  if (window.location.hash === '#results') {
    renderResults();
  } else if (window.location.hash === '#intake') {
    renderIntake();
  } else {
    renderStart();
  }
}

loadConfig()
  .then(() => {
    applyTheme();
    systemThemeQuery.addEventListener('change', () => {
      if (state.themeMode === 'system') {
        applyTheme();
        render();
      }
    });
    window.addEventListener('hashchange', render);
    render();
  })
  .catch(() => {
    app.innerHTML = '<main class="shell"><p class="subtitle">Clinic files missing. Check config JSON.</p></main>';
  });
