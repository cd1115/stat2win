import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.stat2win.app",
  appName: "Stat2Win",
  webDir: "out",
  server: {
    url: "https://tudominio.com",
    cleartext: true,
  },
};

export default config;
