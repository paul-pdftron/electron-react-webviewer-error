/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build-main`, this file is compiled to
 * `./app/main.prod.js` using webpack. This gives us some performance wins.
 *
 *
 */
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import installExtension from 'electron-devtools-installer';
import { download } from 'electron-dl';
import path from 'path';
import { captureException } from '@sentry/electron';
import MenuBuilder from './menu';
import './static/sentry';
// import unhandled from 'electron-unhandled';

// Load environment variables
require('dotenv').config();

// Setup persistent store
const Store = require('electron-store');

const schema = {
  ...
};

const defaults = {
  ...
};

const persistentStore = new Store({ schema, defaults });
global.persistentStore = persistentStore;

const fs = require('fs');
const request = require('request');

const assetCachePath = path.join(app.getPath('userData'), 'assets');
global.assetCachePath = assetCachePath;

global.pdftronLicenseKey = process.env.PDFTRON_LICENSE_KEY;

const log = require('electron-log');
const { autoUpdater } = require('electron-updater');

log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.info('App starting...');
log.info('File path: ', log.transports.file.getFile().path);
log.catchErrors({ showDialog: process.env.NODE_ENV !== 'production' });

autoUpdater.logger = log;

// Set `__static` path to static files: https://stackoverflow.com/questions/44337944/how-to-manage-configuration-for-webpack-electron-app
// if (process.env.NODE_ENV !== 'development') {
//   global.__static = require('path').join(__dirname, '/static').replace(/\\/g, '\\\\')
// }

let __static;
if (process.env.NODE_ENV === 'development') {
  __static = require('path').join(__dirname, '/static').replace(/\\/g, '\\\\');
} else {
  __static = require('path').join(__dirname, '/dist').replace(/\\/g, '\\\\');
}

let mainWindow = null;
let privatePresentationWindow = null;

if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
  // require('electron-debug')();
  const path = require('path');
  const p = path.join(__dirname, '..', 'app', 'node_modules');
  require('module').globalPaths.push(p);
}

const buildMainWindow = () => {
  const { workArea } = screen.getPrimaryDisplay();
  const { x, y, width, height } = workArea;
  mainWindow = new BrowserWindow({
    show: false,
    width,
    height,
    title: 'Demoflow',
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      partition: 'persist:application',
      nodeIntegration: true,
      webviewTag: true,
      preload: path.join(__static, 'sentry.js')
    }
  });

  // Needed for Windows B.S.
  mainWindow.setMinimizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setFullScreenable(true);
  mainWindow.setResizable(true);
  mainWindow.setMovable(true);
  mainWindow.setClosable(true);

  mainWindow.loadURL(`file://${__dirname}/app.html`, { userAgent: 'Chrome' });

  // Handle true new window requests from WebView
  // https://github.com/electron/electron/issues/15936
  // https://github.com/electron/electron/blob/v6.0.0/docs/api/window-open.md
  mainWindow?.webContents?.on('did-attach-webview', (event, webContents) => {
    webContents.on(
      'new-window',
      (e, url, frameName, disposition, options, additionalFeatures) => {
        if (disposition !== 'new-window') {
          // Don't actually open a new window.
          // This is probably a request to open a `foreground-tab`,
          // and in that case we'll handle it depending on the context
          e.preventDefault();
        }
      }
    );
  });

  // @TODO: Use 'ready-to-show' event
  //        https://github.com/electron/electron/blob/master/docs/api/browser-window.md#using-ready-to-show-event
  mainWindow?.webContents?.on('did-finish-load', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // `closed` is called AFTER the window is unmounted
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Remove any cached asset file that hasn't been updated (used) in 30 days.
    // This value is updated when we receive the `download-asset-slides` event
    const result = removeOldCachedFiles();
    console.log('Deleted files from: ', assetCachePath, result);
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();
};

// unhandled({
//   showDialog: true
// });

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Fired when the icon in the user's dock is clicked (Mac only)
app.on('activate', () => {
  if (!mainWindow) {
    buildMainWindow();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('ready', async () => {
  log.info('App ready - running on platform: ', process.platform);

  log.info('Screen Size: ', screen.getPrimaryDisplay().workAreaSize);
  log.info('All Display Sizes: ', screen.getAllDisplays());
  // We need this for weird warnings we get from Google
  // https://github.com/firebase/firebase-js-sdk/issues/2478
  // https://www.reddit.com/r/electronjs/comments/eiy2sf/google_blocking_log_in_from_electron_apps/
  app.userAgentFallback = app.userAgentFallback.replace(
    `Electron/${process.versions.electron}`,
    ''
  );

  if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
    global.updateReady = false;
    global.updateError = false;

    // do a check right when opening the app
    autoUpdater.checkForUpdates();
    // and then schedule the check for every hour thereafter
    setInterval(() => {
      autoUpdater.checkForUpdates();
    }, 3600000);
  }

  if (
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'staging' ||
    process.env.DEBUG_PROD === 'true'
  ) {
    await installExtension('fmkadmapgofadopljbjfkapdkoienihi', true); // React Dev Tools (Chrome extension)
    // await installExtension('jdkknkkbebbapilgoeccciglkfbmbnfm', true); // Apollo Dev Tools (Chrome extension)
  }

  // mainWindow.loadURL(`file://${__dirname}/app.html`);
  buildMainWindow();

  // Reset the store to clear all checked demos
  persistentStore.set('demosWithCheckedUrls', []);


if (process.env.NODE_ENV !== 'development') {
  // when the update has been downloaded and is ready to be installed, notify the BrowserWindow
  autoUpdater.on('update-downloaded', (info) => {
    global.updateReady = true;
    if (mainWindow) mainWindow?.webContents?.send('update-ready');
    log.info('Update ready: ', info);
  });

  // Check for errors and send to user
  autoUpdater.on('error', (info) => {
    global.updateError = true;
    if (mainWindow) mainWindow?.webContents?.send('update-error');
    captureException(info);
    log.info('AutoUpdate Error: ', info);
    console.log('AutoUpdate Error: ', info);
  });

  // when receiving an quitAndInstall signal, quit and install the new version
  ipcMain.on('quitAndInstall', (event, arg) => {
    log.info('Quit and install');
    autoUpdater.quitAndInstall();
  });
}
