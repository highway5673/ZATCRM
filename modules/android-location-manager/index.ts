// Re-export the native module. On web, it will be resolved to AndroidLocationManagerModule.web.ts
// and on native platforms to AndroidLocationManagerModule.ts
export { default } from './src/AndroidLocationManagerModule';
export * from './src/AndroidLocationManager.types';
