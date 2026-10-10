// web/src/main.ts
import './style.css';
import { login, logout, watchAuthState } from './auth';
import { renderScanView, ScanViewHandle } from './scanView';
import { renderSearchView } from './searchView';
import { renderDashboardView } from './dashboardView';
import { t, getLang, setLang, applyDir, Lang } from './i18n';

const app = document.querySelector<HTMLDivElement>('#app')!;

let scanHandle: ScanViewHandle | null = null;
let hashListenerAttached = false;
let currentUserEmail: string | null = null;
let currentRoute: 'scan' | 'search' | 'dashboard' = 'scan';

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
    <main class="login">
      <form id="login-form" class="card login-card">
        <h1>${t('appTitle')}</h1>
        <label for="email">${t('loginEmailPlaceholder')}</label>
        <input id="email" type="email" autocomplete="username" dir="ltr" required />
        <label for="password">${t('loginPasswordPlaceholder')}</label>
        <input id="password" type="password" autocomplete="current-password" dir="ltr" required />
        <button type="submit" class="btn btn-primary btn-block">${t('loginButton')}</button>
        <p id="login-error" class="field-error" role="alert"></p>
      </form>
    </main>
  `;
  document.querySelector<HTMLButtonElement>('#lang-toggle')!.addEventListener('click', toggleLang);
  const form = document.querySelector<HTMLFormElement>('#login-form')!;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.querySelector<HTMLInputElement>('#email')!.value;
    const password = document.querySelector<HTMLInputElement>('#password')!.value;
    try {
      await login(email, password);
    } catch (error) {
      document.querySelector<HTMLParagraphElement>('#login-error')!.textContent = t('loginError');
    }
  });
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
