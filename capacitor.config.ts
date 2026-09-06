import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.equipmoz.controloponto',
  appName: 'Controlo de Ponto',
  webDir: 'www',
  server: {
    // A leitura do QR Code usa a câmara via getUserMedia, que os browsers só
    // autorizam em contextos seguros. No dispositivo, o WebView serve a app
    // por HTTPS para que a permissão possa ser concedida.
    androidScheme: 'https',
  },
};

export default config;
