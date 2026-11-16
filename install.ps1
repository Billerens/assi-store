# Installs projects of the store into Assi on a device (phone over Wi-Fi debugging or emulator).
#
#   .\install.ps1                          # every project
#   .\install.ps1 inbox spending           # only these
#   .\install.ps1 subway -Serial 192.0.2.1:41234
#
# Each project folder has store.json: {"id", "kind": "module"|"game", "target": "modules/<id>" | "modules/games/<id>"}.
# Games go inside the game hub (Игротека), which ships with Assi itself.
# The folder is copied into the app's workspace at `target` (the previous copy of the code is
# replaced, the module's data in data/ stays). The workspace is snapshotted first, so the install
# can be undone in «История изменений». A module whose module.json says "autostart": true is
# started right away (and at every launch of the app, by lib/boot.js).
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)][string[]]$Projects,
    [string]$Serial = 'emulator-5554',
    [int]$WaitSeconds = 60
)

$ErrorActionPreference = 'Stop'
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$root = $PSScriptRoot
$skip = @('store.json', 'README.md', 'tests', '_data')

$all = Get-ChildItem $root -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'store.json') }
if ($Projects) {
    $chosen = foreach ($name in $Projects) {
        $found = $all | Where-Object { $_.Name -eq $name }
        if (-not $found) { throw "Нет проекта $name" }
        $found
    }
} else {
    $chosen = $all
}

$remote = '/data/local/tmp/assi-store'
& $adb -s $Serial shell "rm -rf $remote && mkdir -p $remote" | Out-Null

$entries = @()
foreach ($dir in $chosen) {
    $meta = Get-Content (Join-Path $dir.FullName 'store.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($meta.target -notmatch '^modules/(?:[a-z0-9-]+|games/(?:[a-z0-9-]+|daily/[0-9]{4}-[0-9]{2}-[0-9]{2}))$') { throw "$($dir.Name): странный target $($meta.target)" }
    $stage = Join-Path ([System.IO.Path]::GetTempPath()) ("assi-store-" + $meta.id)
    if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    New-Item -ItemType Directory $stage | Out-Null
    Get-ChildItem $dir.FullName -Force | Where-Object { $skip -notcontains $_.Name } | Copy-Item -Destination $stage -Recurse -Force
    & $adb -s $Serial push "$stage\." "$remote/$($meta.id)" | Out-Null
    Remove-Item -Recurse -Force $stage
    # Heavy files (dictionaries, sounds) go to data/, outside the snapshots: the project's _data/
    # folder is copied over data/<store.json "data">, adding and replacing files, removing none.
    $data = $null
    $source = Join-Path $dir.FullName '_data'
    if ((Test-Path $source) -and $meta.data) {
        if ($meta.data -notmatch '^[a-z0-9-]+(/[a-z0-9-]+)?$') { throw "$($dir.Name): странный data $($meta.data)" }
        & $adb -s $Serial push "$source\." "$remote/$($meta.id).data" | Out-Null
        $data = $meta.data
    }
    $entries += @{ id = $meta.id; target = $meta.target; data = $data }
}
& $adb -s $Serial shell "chmod -R a+rX $remote" | Out-Null

$list = ($entries | ConvertTo-Json -Compress -AsArray)
$script = @"
(function () {
  var list = $list;
  var Files = java.nio.file.Files;
  var root = new java.io.File(context.getFilesDir(), 'assi');
  function wipe(file) {
    if (file.isDirectory()) { var inner = file.listFiles(); for (var i = 0; i < inner.length; i++) wipe(inner[i]); }
    file['delete']();
  }
  function copy(from, to) {
    if (from.isDirectory()) {
      to.mkdirs();
      var inner = from.listFiles();
      for (var i = 0; i < inner.length; i++) copy(inner[i], new java.io.File(to, inner[i].getName()));
    } else {
      Files.copy(from.toPath(), to.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }
  }
  Packages.app.assi.core.Workspace.INSTANCE.snapshot('Перед установкой из assi-store: ' + list.map(function (e) { return e.id; }).join(', '));
  var out = [];
  list.forEach(function (entry) {
    var to = new java.io.File(root, entry.target);
    wipe(to);
    copy(new java.io.File('$remote/' + entry.id), to);
    var line = entry.id + ' -> ' + entry.target;
    if (entry.data) {
      copy(new java.io.File('$remote/' + entry.id + '.data'), new java.io.File(new java.io.File(context.getFilesDir(), 'data'), entry.data));
      line += ', data/' + entry.data;
    }
    try {
      var meta = JSON.parse(String(new java.lang.String(Files.readAllBytes(new java.io.File(to, 'module.json').toPath()), 'UTF-8')));
      if (meta.autostart) {
        var main = require(entry.target + '/main.js');
        if (typeof main.start === 'function') { main.start(); line += ' (запущен)'; }
      }
    } catch (error) {
      if (!/NoSuchFile/.test(String(error))) line += ' (ошибка запуска: ' + error + ')';
    }
    out.push(line);
  });
  try { native('nav.changed'); } catch (ignored) {}
  return out.join('\n');
})()
"@
$file = Join-Path ([System.IO.Path]::GetTempPath()) 'assi-store-install.js'
Set-Content -Path $file -Value $script -Encoding UTF8
& (Join-Path $PSScriptRoot '..\Assi\scripts\eval.ps1') $file -Serial $Serial -WaitSeconds $WaitSeconds |
    Where-Object { $_ -notmatch 'pushed|Activity not' }
& $adb -s $Serial shell "rm -rf $remote" | Out-Null
