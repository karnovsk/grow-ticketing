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

function renderRoute() {
  const view = document.querySelector<HTMLElement>('#view');
  if (!view) return;
  if (scanHandle) {
    scanHandle.stop();
    scanHandle = null;
  }
  currentRoute = (window.location.hash.replace('#', '') || 'scan') as 'scan' | 'search' | 'dashboard';
  if (currentRoute === 'scan') scanHandle = renderScanView(view);
  else if (currentRoute === 'search') renderSearchView(view);
  else if (currentRoute === 'dashboard') renderDashboardView(view);
}

function langToggleLabel(): string {
  return getLang() === 'he' ? 'EN' : 'עב';
}

function retranslateHeader() {
  const langButton = document.querySelector<HTMLButtonElement>('#lang-toggle');
  if (langButton) langButton.textContent = langToggleLabel();
  if (!currentUserEmail) return;
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
      <span></span>
      <button id="lang-toggle" class="lang-toggle" type="button">${langToggleLabel()}</button>
    </header>
    <form id="login-form">
      <input id="email" type="email" placeholder="${t('loginEmailPlaceholder')}" required />
      <input id="password" type="password" placeholder="${t('loginPasswordPlaceholder')}" required />
      <button type="submit" class="btn btn-primary btn-block">${t('loginButton')}</button>
      <p id="login-error" class="field-error"></p>
    </form>
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
      <span id="header-label">${t('headerLoggedInAs', { email: userEmail })}</span>
      <div class="header-actions">
        <button id="lang-toggle" class="lang-toggle" type="button">${langToggleLabel()}</button>
        <button id="logout-button" class="btn btn-secondary">${t('headerLogoutButton')}</button>
      </div>
    </header>
    <nav>
      <a href="#scan">${t('navScan')}</a>
      <a href="#dashboard">${t('navDashboard')}</a>
      <a href="#search">${t('navSearch')}</a>
    </nav>
    <main id="view"></main>
  `;
  document.querySelector<HTMLButtonElement>('#lang-toggle')!.addEventListener('click', toggleLang);
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
