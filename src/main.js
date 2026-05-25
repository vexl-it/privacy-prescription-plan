import './styles.css';

const app = document.querySelector('#app');
const state = {
  selected: new Set(),
  config: null,
  adviceVisible: false,
};

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
  window.location.hash = screen === 'results' ? '#results' : '#intake';
  state.adviceVisible = false;
  render();
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
}

function renderHeader() {
  return `
    <header class="topbar">
      <div class="brand-lockup">
        <img class="logo" src="/assets/logos/vexl-logo-white.svg" alt="Vexl" />
        <span>Booth intake</span>
      </div>
      <div class="clinic-pill" aria-label="Clinic name">
        ${state.config.diagnosticConfig.clinicName}
      </div>
    </header>
  `;
}

function renderIntake() {
  const { questionConfig } = state.config;
  const selectedCount = state.selected.size;

  app.innerHTML = `
    <main class="shell intake-shell">
      ${renderHeader()}
      <section class="hero-grid">
        <div class="intro">
          <p class="eyebrow">${questionConfig.eyebrow}</p>
          <div class="screen-title">${questionConfig.title}</div>
          <p class="subtitle">${questionConfig.subtitle}</p>
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
}

function renderResults() {
  const { diagnosticConfig } = state.config;
  const score = getScore();
  const diagnosis = getDiagnosis(score);
  const dominantCategory = getDominantCategory();
  const category = diagnosticConfig.categoryBoosts[dominantCategory];
  const symptoms = getSelectedQuestions();
  const symptomText = symptoms.length
    ? symptoms.map((question) => question.shortLabel).join(', ')
    : 'No major symptoms reported';

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
                <h2>${diagnosticConfig.activationText}</h2>
                <div class="qr-block">
                  <img src="/assets/images/vexl-download-qr.webp" alt="Vexl download QR code" />
                  <span>Scan Vexl</span>
                </div>
              `
              : `
                <p>${symptomText}</p>
                <p class="category-line">${category.condition}: ${category.line}</p>
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
    goTo('intake');
  });

  app.querySelector('[data-action="advice"]')?.addEventListener('click', () => {
    state.adviceVisible = true;
    renderResults();
  });
}

function render() {
  if (!state.config) return;

  if (window.location.hash === '#results') {
    renderResults();
  } else {
    renderIntake();
  }
}

loadConfig()
  .then(() => {
    window.addEventListener('hashchange', render);
    render();
  })
  .catch(() => {
    app.innerHTML = '<main class="shell"><p class="subtitle">Clinic files missing. Check config JSON.</p></main>';
  });
