import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.stat2win.app",
  appName: "Stat2Win",
  webDir: "out",
  server: {
    url: "https://stat2win.vercel.app",
    cleartext: true,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
