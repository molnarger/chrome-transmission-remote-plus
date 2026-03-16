/* exported SETTINGS_DEFAULTS loadSettings saveSettings migrateLegacyLocalStorageToChromeStorage */

const SETTINGS_VERCONFIG = 6;
const SETTINGS_DEFAULTS = {
  verConfig                    : SETTINGS_VERCONFIG,
  server                       : 'http://localhost:9091/transmission',
  rpcPath                      : '/rpc',
  webPath                      : '/web/',
  user                         : '',
  pass                         : '',
  notificationstorrentfinished : 'true',
  notificationsnewtorrent      : 'false',
  browserbadgetimeout          : '1000',
  popuprefreshinterval         : '3000',
  start_paused                 : 'false',
  clickAction                  : 'dlremote',
  dlPopup                      : 'true',
  dirs                         : '[]',
  sessionId                    : '',
  torrentType                  : '-1',
  torrentFilter                : '',
  version                      : '',
  settingsMigrated             : 'false'
};

function canUseLocalStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch (e) {
    return false;
  }
}

function normalizeValue(key, value) {
  if (typeof value === 'undefined' || value === null) {
    return SETTINGS_DEFAULTS[key];
  }

  switch (key) {
    case 'verConfig':
      return parseInt(value, 10) || SETTINGS_VERCONFIG;
    case 'browserbadgetimeout':
    case 'popuprefreshinterval':
      return String(parseInt(value, 10) || parseInt(SETTINGS_DEFAULTS[key], 10));
    case 'notificationstorrentfinished':
    case 'notificationsnewtorrent':
    case 'start_paused':
    case 'dlPopup':
    case 'settingsMigrated':
      return String(value === true || value === 'true');
    default:
      return String(value);
  }
}

function normalizeSettings(settings) {
  const normalized = {};
  Object.keys(SETTINGS_DEFAULTS).forEach(function (key) {
    normalized[key] = normalizeValue(key, settings[key]);
  });

  if (!normalized.rpcPath.startsWith('/')) {
    normalized.rpcPath = '/' + normalized.rpcPath.replace(/^\/+/, '');
  }

  if (normalized.webPath !== '' && !normalized.webPath.startsWith('/')) {
    normalized.webPath = '/' + normalized.webPath.replace(/^\/+/, '');
  }

  if (normalized.webPath !== '' && !normalized.webPath.endsWith('/')) {
    normalized.webPath += '/';
  }

  return normalized;
}

function writeLocalSettings(settings) {
  if (!canUseLocalStorage()) {
    return;
  }

  Object.keys(settings).forEach(function (key) {
    localStorage[key] = settings[key];
  });
}

function loadSettings(callback) {
  chrome.storage.local.get(null, function (storedSettings) {
    const normalized = normalizeSettings(Object.assign({}, SETTINGS_DEFAULTS, storedSettings || {}));
    callback(normalized);
  });
}

function saveSettings(settings, callback) {
  const normalized = normalizeSettings(Object.assign({}, settings));
  chrome.storage.local.set(normalized, function () {
    writeLocalSettings(normalized);
    if (callback) {
      callback(normalized);
    }
  });
}

function migrateLegacyLocalStorageToChromeStorage(callback) {
  loadSettings(function (storedSettings) {
    if (storedSettings.settingsMigrated === 'true' || !canUseLocalStorage()) {
      writeLocalSettings(storedSettings);
      callback(storedSettings);
      return;
    }

    const localSettings = {};
    let hasLegacySettings = false;

    Object.keys(SETTINGS_DEFAULTS).forEach(function (key) {
      if (typeof localStorage[key] !== 'undefined') {
        localSettings[key] = localStorage[key];
        hasLegacySettings = true;
      }
    });

    if (!hasLegacySettings) {
      const mergedDefaults = Object.assign({}, storedSettings, {settingsMigrated: 'true'});
      saveSettings(mergedDefaults, callback);
      return;
    }

    const mergedSettings = normalizeSettings(Object.assign({}, storedSettings, localSettings, {
      settingsMigrated : 'true'
    }));

    saveSettings(mergedSettings, callback);
  });
}
