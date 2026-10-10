// web/src/main.ts
import './style.css';
import { login, logout, watchAuthState, requestPasswordReset } from './auth';
import { renderScanView, ScanViewHandle } from './scanView';
import { renderSearchView } from './searchView';
import { renderDashboardView } from './dashboardView';
import { t, getLang, setLang, applyDir, Lang } from './i18n';

const app = document.querySelector<HTMLDivElement>('#app')!;

let scanHandle: ScanViewHandle | null = null;
let hashListenerAttached = false;
let currentUserEmail: string | null = null;
let currentRoute: 'scan' | 'search' | 'dashboard' = 'scan';
// Which logged-out screen is showing, kept so a language toggle redraws the
// same screen (and the email typed so far) instead of jumping back to login.
let loginScreen: 'login' | 'reset' = 'login';
let loginEmailDraft = '';

applyDir();

// Optional brand theme, off by default — set VITE_THEME=habaronit in
// web/.env to enable (see the [data-theme='habaronit'] block in style.css).
if (import.meta.env.VITE_THEME) {
  document.documentElement.dataset.theme = import.meta.env.VITE_THEME;
}

function renderRoute() {
  const view = document.querySelector<HTMLElement>('#view');
  if (!view) return;
  if (scanHandle) {
    scanHandle.stop();
    scanHandle = null;
  }
  currentRoute = (window.location.hash.replace('#', '') || 'scan') as 'scan' | 'search' | 'dashboard';
  markCurrentNav();
  if (currentRoute === 'scan') scanHandle = renderScanView(view);
  else if (currentRoute === 'search') renderSearchView(view);
  else if (currentRoute === 'dashboard') renderDashboardView(view);

  // Restart the entrance animation even when navigating to the same route
  // twice in a row (removing the class alone wouldn't retrigger it — the
  // offsetWidth read forces a reflow in between).
  view.classList.remove('view-enter');
  void view.offsetWidth;
  view.classList.add('view-enter');
}

function markCurrentNav() {
  document.querySelectorAll<HTMLAnchorElement>('nav a').forEach((link) => {
    if (link.getAttribute('href') === `#${currentRoute}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function langToggleLabel(): string {
  return getLang() === 'he' ? 'EN' : 'עב';
}

function retranslateHeader() {
  const langButton = document.querySelector<HTMLButtonElement>('#lang-toggle');
  if (langButton) langButton.textContent = langToggleLabel();
  if (!currentUserEmail) return;
  const brand = document.querySelector<HTMLSpanElement>('#brand');
  if (brand) brand.textContent = t('appTitle');
  const nav = document.querySelector<HTMLElement>('nav');
  if (nav) nav.setAttribute('aria-label', t('navLabel'));
  const headerLabel = document.querySelector<HTMLSpanElement>('#header-label');
  if (headerLabel) headerLabel.textContent = t('headerLoggedInAs', { email: currentUserEmail });
  const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button');
  if (logoutButton) logoutButton.textContent = t('headerLogoutButton');
  const navScan = document.querySelector<HTMLAnchorElement>('a[href="#scan"]');
  if (navScan) navScan.textContent = t('navScan');
  const navSearch = document.querySelector<HTMLAnchorElement>('a[href="#search"]');
  if (navSearch) navSearch.textContent = t('navSearch');
  const navDashboard = document.querySelector<HTMLAnchorElement>('a[href="#dashboard"]');
  if (navDashboard) navDashboard.textContent = t('navDashboard');
}

function toggleLang() {
  const next: Lang = getLang() === 'he' ? 'en' : 'he';
  setLang(next);
  applyDir();
  if (!currentUserEmail) {
    const emailInput = document.querySelector<HTMLInputElement>('#email');
    if (emailInput) loginEmailDraft = emailInput.value;
    renderLogin();
    return;
  }
  retranslateHeader();
  if (currentRoute === 'scan' && scanHandle) {
    scanHandle.retranslate();
  } else {
    renderRoute();
  }
}

function renderLogin() {
  if (scanHandle) {
    scanHandle.stop();
    scanHandle = null;
  }
  app.innerHTML = `
    <header>
      <span class="brand">${t('appTitle')}</span>
      <button id="lang-toggle" class="lang-toggle" type="button">${langToggleLabel()}</button>
    </header>
    <main class="login"></main>
  `;
  document.querySelector<HTMLButtonElement>('#lang-toggle')!.addEventListener('click', toggleLang);
  const main = app.querySelector<HTMLElement>('main')!;
  if (loginScreen === 'reset') renderResetForm(main);
  else renderLoginForm(main);
}

function renderLoginForm(main: HTMLElement) {
  main.innerHTML = `
    <form id="login-form" class="card login-card">
      <h1>${t('appTitle')}</h1>
      <label for="email">${t('loginEmailPlaceholder')}</label>
      <input id="email" type="email" autocomplete="username" dir="ltr" required />
      <label for="password">${t('loginPasswordPlaceholder')}</label>
      <input id="password" type="password" autocomplete="current-password" dir="ltr" required />
      <button type="submit" class="btn btn-primary btn-block">${t('loginButton')}</button>
      <p id="login-error" class="field-error" role="alert"></p>
      <button id="forgot-password" type="button" class="link-button">${t('loginForgotPassword')}</button>
    </form>
  `;
  const emailInput = main.querySelector<HTMLInputElement>('#email')!;
  emailInput.value = loginEmailDraft;
  main.querySelector<HTMLButtonElement>('#forgot-password')!.addEventListener('click', () => {
    loginEmailDraft = emailInput.value.trim();
    loginScreen = 'reset';
    renderResetForm(main);
  });
  main.querySelector<HTMLFormElement>('#login-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = main.querySelector<HTMLInputElement>('#password')!.value;
    try {
      await login(emailInput.value, password);
    } catch (error) {
      main.querySelector<HTMLParagraphElement>('#login-error')!.textContent = t('loginError');
    }
  });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function renderResetForm(main: HTMLElement) {
  main.innerHTML = `
    <form id="reset-form" class="card login-card" novalidate>
      <h1>${t('resetTitle')}</h1>
      <p class="login-intro">${t('resetIntro')}</p>
      <label for="email">${t('loginEmailPlaceholder')}</label>
      <input id="email" type="email" autocomplete="username" dir="ltr" required aria-describedby="reset-error" />
      <p id="reset-error" class="field-error" role="alert"></p>
      <button id="reset-send" type="submit" class="btn btn-primary btn-block">${t('resetSendButton')}</button>
      <button id="reset-back" type="button" class="link-button">${t('resetBackToLogin')}</button>
    </form>
  `;
  const emailInput = main.querySelector<HTMLInputElement>('#email')!;
  const error = main.querySelector<HTMLParagraphElement>('#reset-error')!;
  const sendButton = main.querySelector<HTMLButtonElement>('#reset-send')!;
  emailInput.value = loginEmailDraft;
  emailInput.focus();

  const backToLogin = () => {
    loginScreen = 'login';
    renderLoginForm(main);
  };
  main.querySelector<HTMLButtonElement>('#reset-back')!.addEventListener('click', backToLogin);

  main.querySelector<HTMLFormElement>('#reset-form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    loginEmailDraft = email;
    if (!EMAIL_PATTERN.test(email)) {
      error.textContent = t('resetInvalidEmail');
      emailInput.setAttribute('aria-invalid', 'true');
      emailInput.focus();
      return;
    }
    emailInput.removeAttribute('aria-invalid');
    error.textContent = '';
    sendButton.disabled = true;
    sendButton.textContent = t('resetSending');
    const outcome = await requestPasswordReset(email, getLang());
    sendButton.disabled = false;
    sendButton.textContent = t('resetSendButton');

    if (outcome === 'sent') {
      renderResetSent(main, email, backToLogin);
      return;
    }
    if (outcome === 'invalidEmail') {
      emailInput.setAttribute('aria-invalid', 'true');
      error.textContent = t('resetInvalidEmail');
    } else {
      error.textContent = t(outcome === 'tooManyRequests' ? 'resetTooManyRequests' : 'resetFailed');
    }
  });
}

function renderResetSent(main: HTMLElement, email: string, backToLogin: () => void) {
  main.innerHTML = `
    <div class="card login-card" role="status">
      <h1>${t('resetSentTitle')}</h1>
      <p id="reset-sent" class="login-intro"></p>
      <button id="reset-done" type="button" class="btn btn-secondary btn-block">${t('resetBackToLogin')}</button>
    </div>
  `;
  // textContent, not the template: the email is user input.
  main.querySelector<HTMLParagraphElement>('#reset-sent')!.textContent = t('resetSent', { email });
  const doneButton = main.querySelector<HTMLButtonElement>('#reset-done')!;
  doneButton.addEventListener('click', backToLogin);
  doneButton.focus();
}

function renderApp(userEmail: string) {
  currentUserEmail = userEmail;
  app.innerHTML = `
    <header>
      <div class="header-identity">
        <span id="brand" class="brand">${t('appTitle')}</span>
        <span id="header-label" class="header-user"></span>
      </div>
      <div class="header-actions">
        <button id="lang-toggle" class="lang-toggle" type="button">${langToggleLabel()}</button>
        <button id="logout-button" class="btn-ghost" type="button">${t('headerLogoutButton')}</button>
      </div>
    </header>
    <nav aria-label="${t('navLabel')}">
      <a href="#scan">${t('navScan')}</a>
      <a href="#dashboard">${t('navDashboard')}</a>
      <a href="#search">${t('navSearch')}</a>
    </nav>
    <main id="view"></main>
  `;
  document.querySelector<HTMLButtonElement>('#lang-toggle')!.addEventListener('click', toggleLang);
  // Set via textContent, not the template above: the email is account data.
  document.querySelector<HTMLSpanElement>('#header-label')!.textContent = t('headerLoggedInAs', { email: userEmail });
  document.querySelector<HTMLButtonElement>('#logout-button')!.addEventListener('click', () => logout());

  if (!hashListenerAttached) {
    window.addEventListener('hashchange', renderRoute);
    hashListenerAttached = true;
  }
  renderRoute();
}

watchAuthState((user) => {
  if (user) {
    renderApp(user.email ?? 'staff');
  } else {
    currentUserEmail = null;
    renderLogin();
  }
});
