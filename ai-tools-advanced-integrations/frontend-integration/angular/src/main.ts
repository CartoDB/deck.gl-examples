import { bootstrapApplication } from '@angular/platform-browser';
import { log as lumaLog } from '@luma.gl/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Suppress verbose luma.gl logging (ShaderFactory debug messages)
// Set before bootstrap to ensure it's configured before any deck.gl/luma.gl initialization
lumaLog.level = 0;

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
