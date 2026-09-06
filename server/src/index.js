import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[api] Sistema de Controlo de Ponto — a escutar em http://localhost:${config.port}`);
  console.log(`[api] Origens autorizadas: ${config.corsOrigins.join(', ')}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[api] ${signal} recebido, a encerrar...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
