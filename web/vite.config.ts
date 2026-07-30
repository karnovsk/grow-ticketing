import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  // Serves dev over HTTPS with a self-signed cert so the scan view's camera
  // (getUserMedia requires a secure context) works when hit from a phone over
  // the LAN, not just from localhost. Browsers will show a one-time
  // "connection not private" warning to click through — dev-only, not used
  // for the production build/Hosting.
  plugins: [basicSsl()],
  test: {
    environment: 'jsdom',
  },
});
