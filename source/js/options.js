// communication port with background page
var port = chrome.runtime.connect({name: 'options'});

function addDir(label, dir) {

  var table;
  var rowElem;
  var col1Elem;
  var col2Elem;
  var col3Elem;
  var labelElem;
  var dirElem;
  var upButton;
  var downButton;
  var removeButton;

  if (label === '' || dir === '') {
    return;
  }

  table = document.getElementById('customdirs');

  for (let i = 1; i < table.rows.length - 1; ++i) {
    if (table.rows[i].childNodes[0].childNodes[0].value === label) {return;}
  }

  rowElem = table.insertRow(table.rows.length - 1);
  col1Elem = rowElem.insertCell(-1);
  col2Elem = rowElem.insertCell(-1);
  col3Elem = rowElem.insertCell(-1);
  labelElem = document.createElement('input');
  dirElem = document.createElement('input');
  upButton = document.createElement('div');
  downButton = document.createElement('div');
  removeButton = document.createElement('div');

  col1Elem.appendChild(labelElem);
  col2Elem.appendChild(dirElem);
  col3Elem.appendChild(upButton);
  col3Elem.appendChild(downButton);
  col3Elem.appendChild(removeButton);

  labelElem.setAttribute('type', 'text');
  labelElem.setAttribute('class', 'label');
  labelElem.setAttribute('value', label);
  dirElem.setAttribute('type', 'text');
  dirElem.setAttribute('class', 'dir');
  dirElem.setAttribute('value', dir);

  upButton.setAttribute('class', 'button up');
  upButton.addEventListener('click', function () { if (rowElem.rowIndex > 2) { table.tBodies[0].insertBefore(rowElem, rowElem.previousSibling); } }, false);

  downButton.setAttribute('class', 'button down');
  downButton.addEventListener('click', function () { if (rowElem.rowIndex < (table.rows.length - 1)) { table.tBodies[0].insertBefore(rowElem, rowElem.nextSibling.nextSibling); } }, false);

  removeButton.setAttribute('class', 'button remove');
  removeButton.addEventListener('click', function () { table.tBodies[0].removeChild(rowElem); }, false);

  document.getElementById('customlabel').value = '';
  document.getElementById('customdir').value = '';
}

function save() {
  let server = jQuery('#protocol').val() + '://' + jQuery('#ip').val() + ':' + jQuery('#port').val();

  if (jQuery('#path').val() !== '') {
    server += '/' + jQuery('#path').val();
  }

  let table = document.getElementById('customdirs');
  let dirs = [];
  for (let i = 1; i < table.rows.length - 1; ++i) {
    dirs.push({label: table.rows[i].childNodes[0].childNodes[0].value, dir: table.rows[i].childNodes[1].childNodes[0].value});
  }

  saveSettings({
    server                       : server,
    rpcPath                      : (jQuery('#rpcPath').val() !== '') ? '/' + jQuery('#rpcPath').val() : '',
    webPath                      : (jQuery('#webPath').val() !== '') ? '/' + jQuery('#webPath').val() + '/' : '',
    user                         : jQuery('#user').val(),
    pass                         : jQuery('#pass').val(),
    notificationstorrentfinished : jQuery('#notificationstorrentfinished').prop('checked'),
    notificationsnewtorrent      : jQuery('#notificationsnewtorrent').prop('checked'),
    browserbadgetimeout          : jQuery('#browserbadgetimeout').val(),
    popuprefreshinterval         : jQuery('#popuprefreshinterval').val(),
    start_paused                 : jQuery('#start_paused').prop('checked'),
    clickAction                  : jQuery("input[name='clickaction']:checked").val(),
    dlPopup                      : jQuery('#dlpopup').prop('checked'),
    dirs                         : JSON.stringify(dirs),
    version                      : chrome.runtime.getManifest().version,
    settingsMigrated             : 'true'
  }, function () {
    port.postMessage({method: 'settings-saved'});
    jQuery('#saved').fadeIn(100);
    jQuery('#saved').fadeOut(1000);
  });
}

jQuery(function ($) {
  migrateLegacyLocalStorageToChromeStorage(function (settings) {
    let dirs = JSON.parse(settings.dirs);
    let server = settings.server.match(/(.*?):\/\/(.+):(\d+)\/?(.*)/);

    $('#protocol').val(server[1]);
    $('#ip').val(server[2]);
    $('#port').val(server[3]);
    $('#path').val(server[4]);

    $('#rpcPath').val(settings.rpcPath.replace(/\//g, ''));
    $('#webPath').val(settings.webPath.replace(/\//g, ''));

    $('#user').val(settings.user);
    $('#pass').val(settings.pass);

    $('#notificationstorrentfinished').prop('checked', (settings.notificationstorrentfinished === 'true'));
    $('#notificationsnewtorrent').prop('checked', settings.notificationsnewtorrent === 'true');

    $('#browserbadgetimeout').val(settings.browserbadgetimeout);
    $('#popuprefreshinterval').val(settings.popuprefreshinterval);
    $('#start_paused').prop('checked', settings.start_paused === 'true');

    document.getElementById(settings.clickAction).checked = true;
    $('#dlpopup').prop('checked', (settings.dlPopup === 'true'));

    for (let i = 0, dir; dir = dirs[i]; ++i) {
      addDir(dirs[i].label, dirs[i].dir);
    }

    $('#save').on('click', save);
    $('#user,#pass').on('focus', function () { this.type = 'text'; });
    $('#user,#pass').on('blur', function () { this.type = 'password'; });
  });
});

jQuery(function ($) {
  $('#dldefault').on('click', function () {
    $('#dlpopup').disabled = false;
  });
  $('#dlcustom').on('click', function () {
    $('#dlpopup').disabled = true;
  });
  $('#adddir').on('click', function () {
    addDir($('#customlabel').val(), $('#customdir').val());
  });
});
