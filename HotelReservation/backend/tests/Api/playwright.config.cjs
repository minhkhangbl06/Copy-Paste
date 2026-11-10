const { defineConfig } = require('@playwright/test');
const { isAbsolute } = require('node:path');

const baseURL = 'http://127.0.0.1:8081';
const database = process.env.DB_DATABASE;

if (!database || !isAbsolute(database)) {
  throw new Error('Set DB_DATABASE to the absolute path of a seeded test SQLite database.');
}

module.exports = defineConfig({
  testDir: '.',
  use: {
    baseURL,
    extraHTTPHeaders: { Accept: 'application/json' },
  },
  webServer: {
    command: 'php artisan serve --host=127.0.0.1 --port=8081 --no-reload',
    cwd: '../..',
    url: baseURL + '/api/rooms',
    reuseExistingServer: false,
    env: {
      APP_ENV: 'testing',
      DB_CONNECTION: 'sqlite',
      DB_DATABASE: database,
      DB_URL: '',
    },
  },
});
