// Read-only dictionary lookup. Existing owner dictionaries take precedence; store assets
// provide a first-install fallback without copying or replacing anything in data/.
(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') { for (var key in api) exports[key] = api[key]; }
  else root.WWDictionary = api;
})(this, function () {
  'use strict';
  var LEGACY = 'data/games/word-weaver/assets/dict.txt';
  var BUNDLED = 'modules/games/word-weaver/assets/dict.txt';

  function read(files) {
    return files.read(files.exists(LEGACY) ? LEGACY : BUNDLED);
  }

  function load(fetcher) {
    return fetcher('/' + LEGACY).then(function (response) {
      return response.status === 404 ? fetcher('/' + BUNDLED) : response;
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    });
  }

  return { read: read, load: load, legacy: LEGACY, bundled: BUNDLED };
});
