// Offline first-tap variants for the next two fields. Cancellation is between deterministic jobs;
// no generated layout depends on the speed of this worker or the order messages arrive in.
importScripts('../../engine/rng.js', 'board.js');

var pending = [];
var workerToken = 0;

self.onmessage = function (event) {
  var message = event.data || {};
  if (message.type !== 'prepare' && message.type !== 'cancel') return;
  workerToken++;
  pending = [];
  if (message.type === 'cancel') return;
  var jobs = message.jobs || [];
  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    if (!job || !job.spec || !job.key) continue;
    pending.push({ key: job.key, spec: job.spec, seed: job.seed, options: job.options || {},
      starts: job.starts ? job.starts.slice() : MineBoard.startOrder(job.spec.w, job.spec.h), at: 0 });
  }
  var token = workerToken;
  setTimeout(function () { prepareOne(token); }, 0);
};

function prepareOne(token) {
  if (token !== workerToken || !pending.length) return;
  var job = pending.shift();
  if (job.at >= job.starts.length) {
    self.postMessage({ type: 'done', key: job.key });
  } else {
    var start = job.starts[job.at++];
    try {
      var field = MineBoard.generate(job.spec, job.seed, start, job.options);
      self.postMessage({ type: 'field', key: job.key, start: start, field: field });
    } catch (error) {
      self.postMessage({ type: 'error', key: job.key, message: String(error.message || error) });
      job.at = job.starts.length;
    }
    pending.push(job);
  }
  setTimeout(function () { prepareOne(token); }, 0);
}
