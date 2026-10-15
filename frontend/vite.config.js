/** @module vite Build and configurable local static-server settings. */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/** Load local serving ports; these are configuration, not client secrets.
 * @param {{mode: string}} environment Vite execution mode.
 * @returns {object} Vite configuration.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: { host: '0.0.0.0', port: Number(env.VITE_DEV_PORT || 5173), strictPort: true },
    preview: { host: '0.0.0.0', port: Number(env.VITE_PREVIEW_PORT || 4173), strictPort: true },
  };
});
