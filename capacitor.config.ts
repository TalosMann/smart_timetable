import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.timetable.app',
  appName: 'Timetable',
  webDir: 'dist',
  android: {
    minSdkVersion: 24,
    targetSdkVersion: 36,
    compileSdkVersion: 36,
  },
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#6366f1",
      sound: "default"
    }
  }
};

export default config;
