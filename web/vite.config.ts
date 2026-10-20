import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    // Serves dev over HTTPS with a self-signed cert so the scan view's camera
    // (getUserMedia requires a secure context) works when hit from a phone over
    // the LAN, not just from localhost. Browsers will show a one-time
    // "connection not private" warning to click through — dev-only, not used
    // for the production build/Hosting.
    plugins: [
      basicSsl(),
      // The static <title> shows until main.ts sets the translated one, so it
      // must already match VITE_APP_TITLE_HE (the app's default language) or the
      // browser tab flashes the generic title first. Unset keeps index.html's.
      {
        name: 'app-title',
        transformIndexHtml: (html) => {
          const title = env.VITE_APP_TITLE_HE;
          if (!title) return html;
          const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return html.replace(/<title>[^<]*<\/title>/, () => `<title>${escaped}</title>`);
        },
      },
    ],
    // The staff app is only served at habaronit.com/staff (the domain root
    // redirects elsewhere — see firebase.json), so assets must resolve under
    // /staff/ and the build output must physically live in a "staff"
    // subfolder of the Hosting public dir (web/dist).
    base: '/staff/',
    build: {
      outDir: 'dist/staff',
    },
    test: {
      environment: 'jsdom',
    },
  };
});
