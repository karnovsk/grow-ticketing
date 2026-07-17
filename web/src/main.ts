import { login, logout, watchAuthState } from './auth';
import { renderScanView } from './scanView';
import { renderSearchView } from './searchView';
import { renderDashboardView } from './dashboardView';

const app = document.querySelector<HTMLDivElement>('#app')!;

function renderLogin() {
  app.innerHTML = `
    <form id="login-form">
      <input id="email" type="email" placeholder="Email" required />
      <input id="password" type="password" placeholder="Password" required />
      <button type="submit">Log in</button>
      <p id="login-error" style="color: red;"></p>
    </form>
  `;
  const form = document.querySelector<HTMLFormElement>('#login-form')!;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.querySelector<HTMLInputElement>('#email')!.value;
    const password = document.querySelector<HTMLInputElement>('#password')!.value;
    try {
      await login(email, password);
    } catch (error) {
      document.querySelector<HTMLParagraphElement>('#login-error')!.textContent =
        'Login failed. Check your credentials.';
    }
  });
}

function renderApp(userEmail: string) {
  app.innerHTML = `
    <header>
      <span>Logged in as ${userEmail}</span>
      <button id="logout-button">Log out</button>
    </header>
    <nav>
      <a href="#scan">Scan</a>
      <a href="#search">Search</a>
      <a href="#dashboard">Dashboard</a>
    </nav>
    <main id="view"></main>
  `;
  document.querySelector<HTMLButtonElement>('#logout-button')!.addEventListener('click', () => logout());

  function renderRoute() {
    const view = document.querySelector<HTMLElement>('#view')!;
    const route = window.location.hash.replace('#', '') || 'scan';
    if (route === 'scan') renderScanView(view);
    else if (route === 'search') renderSearchView(view);
    else if (route === 'dashboard') renderDashboardView(view);
  }

  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}

watchAuthState((user) => {
  if (user) {
    renderApp(user.email ?? 'staff');
  } else {
    renderLogin();
  }
});
