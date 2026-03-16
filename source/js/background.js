/* global SETTINGS_DEFAULTS loadSettings saveSettings */

importScripts('settings.js');

const TR_STATUS_STOPPED = 0;
const TR_STATUS_SEED_WAIT = 5;
const TR_STATUS_SEED = 6;
const CONTEXT_MENU_ID = 'download-with-remote-transmission';
const NOTIFICATION_ALARM = 'notificationRefresh';

let completedTorrents = '';
let torrentInfo = {};
let settingsCache = Object.assign({}, SETTINGS_DEFAULTS);
let settingsLoaded = false;

function parseArgs(args) {
  if (!args) {
    return {};
  }

  if (typeof args === 'object') {
    return args;
  }

  return JSON.parse('{' + args + '}');
}

function getDirs() {
  try {
    return settingsCache.dirs ? JSON.parse(settingsCache.dirs) : [];
  } catch (e) {
    return [];
  }
}

function withSettings(callback) {
  if (settingsLoaded) {
    callback(settingsCache);
    return;
  }

  loadSettings(function (settings) {
    settingsCache = settings;
    settingsLoaded = true;
    callback(settingsCache);
  });
}

function updateSetting(key, value, callback) {
  const update = {};
  update[key] = value;
  settingsCache[key] = value;
  saveSettings(Object.assign({}, settingsCache, update), function (settings) {
    settingsCache = settings;
    if (callback) {
      callback(settings);
    }
  });
}

function setTorrentInfo(page, info, callback) {
  torrentInfo[page] = info;
  chrome.storage.session.set({['torrentInfo:' + page]: info}, function () {
    if (callback) {
      callback();
    }
  });
}

function getTorrentInfo(page, callback) {
  if (torrentInfo[page]) {
    callback(torrentInfo[page]);
    return;
  }

  chrome.storage.session.get('torrentInfo:' + page, function (items) {
    const info = items['torrentInfo:' + page];
    if (info) {
      torrentInfo[page] = info;
    }
    callback(info);
  });
}

function showBadge(text, color, duration) {
  const timeout = typeof duration === 'undefined' ? parseInt(settingsCache.browserbadgetimeout, 10) : duration;

  chrome.action.setBadgeBackgroundColor({color: color});
  chrome.action.setBadgeText({text: text});

  setTimeout(function () {
    chrome.action.setBadgeText({text: ''});
  }, timeout);
}

function showNotification(title, message) {
  if (settingsCache.notificationsnewtorrent !== 'true') {
    return;
  }

  chrome.notifications.create({
    type    : 'basic',
    title   : title,
    message : message,
    iconUrl : 'images/icon128.png'
  });
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (settingsCache.sessionId) {
    headers['X-Transmission-Session-Id'] = settingsCache.sessionId;
  }

  if (settingsCache.user || settingsCache.pass) {
    headers.Authorization = 'Basic ' + btoa(settingsCache.user + ':' + settingsCache.pass);
  }

  return headers;
}

function rpcTransmission(args, method, tag, callback, hasRetried) {
  withSettings(function () {
    const payload = {
      arguments : parseArgs(args),
      method    : method
    };

    if (tag !== '' && typeof tag !== 'undefined') {
      payload.tag = tag;
    }

    fetch(settingsCache.server + settingsCache.rpcPath, {
      method  : 'POST',
      headers : buildHeaders(),
      body    : JSON.stringify(payload)
    }).then(function (response) {
      if (response.status === 409 && !hasRetried) {
        const sessionId = response.headers.get('X-Transmission-Session-Id') || '';
        updateSetting('sessionId', sessionId, function () {
          rpcTransmission(args, method, tag, callback, true);
        });
        return null;
      }

      if (!response.ok) {
        throw new Error(response.statusText || 'Request failed');
      }

      return response.json();
    }).then(function (data) {
      if (data && callback) {
        callback(data);
      }
    }).catch(function () {
      if (callback) {
        callback(JSON.parse(
          '{"arguments":{"torrents":[{"addedDate":0,"doneDate":0,"downloadDir":"","eta":0,"id":0,"leftUntilDone":0,"metadataPercentComplete":0,"name":"Unable to connect to ' + settingsCache.server + '.","rateDownload":0,"rateUpload":0,"recheckProgress":0,"sizeWhenDone":0,"status":0,"uploadedEver":0}]},"result":"Unable to connect to server.","tag":1}'
        ));
      }
    });
  });
}

function dlTorrent(request) {
  if (request.add_to_custom_locations) {
    let dir = request.dir;
    let label = request.new_label;
    if (label === '') {
      let i = dir.lastIndexOf('/');
      label = i === -1 ? dir : dir.substring(i + 1);
    }

    let dirs = getDirs();
    dirs.push({label: label, dir: dir});
    updateSetting('dirs', JSON.stringify(dirs));
  }

  const args = {
    paused : Boolean(request.paused)
  };

  if (typeof request.data !== 'undefined') {
    args.metainfo = request.data;
  } else {
    args.filename = request.url;
  }
  if (typeof request.dir !== 'undefined' && request.dir !== '') {
    args['download-dir'] = request.dir;
  }
  if (request.high && request.high.length) {
    args['priority-high'] = request.high;
  }
  if (request.normal && request.normal.length) {
    args['priority-normal'] = request.normal;
  }
  if (request.low && request.low.length) {
    args['priority-low'] = request.low;
  }
  if (request.blacklist && request.blacklist.length) {
    args['files-unwanted'] = request.blacklist;
  }
  if (!args.paused) {
    delete args.paused;
  }

  rpcTransmission(args, 'torrent-add', '', function (response) {
    if (response.arguments['torrent-duplicate']) {
      showBadge('dup', [0, 0, 255, 255]);
      showNotification('Duplicate torrent', '');
    } else if (response.arguments['torrent-added']) {
      showBadge('add', [0, 255, 0, 255]);
      showNotification('Torrent added successfully', response.arguments['torrent-added'].name);
    } else {
      showBadge('fail', [255, 0, 0, 255]);
      showNotification('Adding torrent failed', '');
    }
  });
}

function openDownloadWindow(page) {
  chrome.windows.create({
    url    : page,
    type   : 'popup',
    width  : page === 'downloadMagnet.html' ? 852 : 850,
    height : page === 'downloadMagnet.html' ? 190 : 610
  });
}

function getTorrent(url) {
  const dirs = getDirs();

  if (settingsCache.dlPopup === 'false') {
    dlTorrent({url: url, paused: (settingsCache.start_paused === 'true')});
    return;
  }

  if (url.toLowerCase().indexOf('magnet:') === 0) {
    setTorrentInfo('magnet', {dirs: dirs, url: url}, function () {
      openDownloadWindow('downloadMagnet.html');
    });
    return;
  }

  setTorrentInfo('torrent', {dirs: dirs, url: url}, function () {
    openDownloadWindow('downloadTorrent.html');
  });
}

function notificationRefresh() {
  rpcTransmission({fields: ['id', 'name', 'status', 'leftUntilDone'], ids: 'recently-active'}, 'torrent-get', 10, function (response) {
    if (!response || !response.arguments || !response.arguments.torrents) {
      return;
    }

    for (let i = 0; i < response.arguments.torrents.length; i++) {
      let torrent = response.arguments.torrents[i];
      if ((torrent.status === TR_STATUS_SEED_WAIT || torrent.status === TR_STATUS_SEED || torrent.status === TR_STATUS_STOPPED) &&
          torrent.leftUntilDone === 0 && completedTorrents.indexOf(torrent.id) < 0) {
        chrome.notifications.create({
          type    : 'basic',
          title   : 'Torrent Download Complete',
          message : torrent.name + ' has finished downloading.',
          iconUrl : 'images/icon128.png'
        });
        completedTorrents += torrent.id + ',';
      }
    }
  });
}

function configureNotifications() {
  if (settingsCache.notificationstorrentfinished === 'true') {
    chrome.alarms.create(NOTIFICATION_ALARM, {periodInMinutes: 0.5});
    notificationRefresh();
  } else {
    chrome.alarms.clear(NOTIFICATION_ALARM);
  }
}

function ensureContextMenu() {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id       : CONTEXT_MENU_ID,
      title    : 'Download with Remote Transmission',
      contexts : ['link']
    });
  });
}

function maybeOpenOptions() {
  const currentVersion = chrome.runtime.getManifest().version;
  const storedVersion = settingsCache.version || '';
  const versionChanged = !storedVersion || currentVersion.split('.')[0] !== storedVersion.split('.')[0];

  if (settingsCache.settingsMigrated !== 'true' || versionChanged) {
    chrome.tabs.create({url: 'options.html?newver=true'});
  }
}

function injectExistingTabs() {
  chrome.tabs.query({url: ['http://*/*', 'https://*/*']}, function (tabs) {
    tabs.forEach(function (tab) {
      if (!tab.id) {
        return;
      }

      chrome.scripting.executeScript({
        target : {tabId: tab.id},
        files  : ['js/jquery-3.2.1.min.js', 'js/inject.js']
      }, function () {
        void chrome.runtime.lastError;
      });
    });
  });
}

function initializeExtension(options) {
  withSettings(function () {
    ensureContextMenu();
    configureNotifications();
    if (options && options.openOptions) {
      maybeOpenOptions();
    }
    if (options && options.injectTabs) {
      injectExistingTabs();
    }
  });
}

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName !== 'local') {
    return;
  }

  Object.keys(changes).forEach(function (key) {
    settingsCache[key] = changes[key].newValue;
  });
  settingsLoaded = true;
});

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === NOTIFICATION_ALARM) {
    withSettings(function () {
      notificationRefresh();
    });
  }
});

chrome.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    withSettings(function () {
      getTorrent(info.linkUrl);
    });
  }
});

chrome.runtime.onInstalled.addListener(function () {
  initializeExtension({openOptions: true, injectTabs: true});
});

chrome.runtime.onStartup.addListener(function () {
  initializeExtension({openOptions: true, injectTabs: false});
});

chrome.runtime.onConnect.addListener(function (port) {
  switch (port.name) {
    case 'popup':
    case 'downloadMagnet':
    case 'downloadTorrent':
      port.onMessage.addListener(function (msg) {
        switch (msg.method) {
          case 'torrent-get':
          case 'session-get':
            rpcTransmission(msg.args, msg.method, msg.tag, function (response) {
              port.postMessage({args: response.arguments, tag: response.tag});
            });
            break;
          default:
            rpcTransmission(msg.args, msg.method);
        }
      });
      break;
    case 'inject':
      port.onMessage.addListener(function (msg) {
        if (msg.method === 'torrent-add') {
          withSettings(function () {
            getTorrent(msg.url);
          });
        }
      });
      break;
    case 'options':
      port.onMessage.addListener(function (msg) {
        if (msg.method === 'settings-saved') {
          withSettings(function () {
            configureNotifications();
          });
        }
      });
      break;
    default:
      break;
  }
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.method === 'get-torrent-info') {
    getTorrentInfo(request.page, function (info) {
      sendResponse(info);
    });
    return true;
  }

  withSettings(function () {
    dlTorrent(request);
    sendResponse({});
  });
  return true;
});

initializeExtension({openOptions: false, injectTabs: false});
