// Health Connect through the platform API (android.health.connect, Android 14 and later), from
// the engine without the Jetpack library. Every call is asynchronous on the Java side; here it
// waits on a latch. Needs the shell change that declares the health permissions in the manifest
// (docs/shell-changes.md, item 16) and the owner's consent.
var PERMS = {
  steps: 'android.permission.health.READ_STEPS',
  sleep: 'android.permission.health.READ_SLEEP',
  exercise: 'android.permission.health.READ_EXERCISE',
  background: 'android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND',
  history: 'android.permission.health.READ_HEALTH_DATA_HISTORY',
  hydration: 'android.permission.health.WRITE_HYDRATION'
};
exports.PERMS = PERMS;

var executor = null;

function run() {
  if (!executor) executor = java.util.concurrent.Executors.newSingleThreadExecutor();
  return executor;
}

function manager() {
  if (android.os.Build.VERSION.SDK_INT < 34) return null;
  try {
    return context.getSystemService(java.lang.Class.forName('android.health.connect.HealthConnectManager'));
  } catch (error) {
    return null;
  }
}

/** Is Health Connect there on this phone at all. */
exports.available = function () {
  return manager() !== null;
};

/** Is the permission in the app's manifest (the shell change). */
exports.declared = function () {
  try {
    var info = context.getPackageManager().getPackageInfo(context.getPackageName(), android.content.pm.PackageManager.GET_PERMISSIONS);
    var list = info.requestedPermissions ? js(info.requestedPermissions) : [];
    return list.indexOf(PERMS.steps) >= 0;
  } catch (error) {
    return false;
  }
};

exports.granted = function (what) {
  return context.checkSelfPermission(PERMS[what] || what) === 0;
};

exports.status = function () {
  var out = { available: exports.available(), declared: exports.declared() };
  Object.keys(PERMS).forEach(function (key) { out[key] = exports.granted(key); });
  return out;
};

function wait(start, timeoutMs) {
  var latch = new java.util.concurrent.CountDownLatch(1);
  var box = { value: null, error: null };
  var receiver = new android.os.OutcomeReceiver({
    onResult: function (value) {
      box.value = value;
      latch.countDown();
    },
    onError: function (error) {
      box.error = error;
      latch.countDown();
    }
  });
  start(run(), receiver);
  if (!latch.await(timeoutMs || 15000, java.util.concurrent.TimeUnit.MILLISECONDS)) throw new Error('Health Connect не ответил вовремя');
  if (box.error) throw new Error('Health Connect: ' + box.error);
  return box.value;
}

function filter(from, to) {
  return new android.health.connect.TimeInstantRangeFilter.Builder()
    .setStartTime(java.time.Instant.ofEpochMilli(from))
    .setEndTime(java.time.Instant.ofEpochMilli(to))
    .build();
}

function ms(instant) {
  return instant ? Number(instant.toEpochMilli()) : null;
}

/** Steps by hour: [{ start, steps }]. */
exports.stepsByHour = function (from, to, timeoutMs) {
  var hcm = manager();
  if (!hcm) return [];
  var type = android.health.connect.datatypes.StepsRecord.STEPS_COUNT_TOTAL;
  var request = new android.health.connect.AggregateRecordsRequest.Builder(filter(from, to)).addAggregationType(type).build();
  var groups = wait(function (ex, receiver) {
    hcm.aggregateGroupByDuration(request, java.time.Duration.ofHours(1), ex, receiver);
  }, timeoutMs);
  var out = [];
  var it = groups.iterator();
  while (it.hasNext()) {
    var group = it.next();
    var value = group.get(type);
    out.push({ start: ms(group.getStartTime()), steps: value === null ? 0 : Number(value) });
  }
  return out;
};

function read(className, from, to, timeoutMs) {
  var hcm = manager();
  if (!hcm) return [];
  var request = new android.health.connect.ReadRecordsRequestUsingFilters.Builder(java.lang.Class.forName(className))
    .setTimeRangeFilter(filter(from, to)).setPageSize(1000).build();
  var response = wait(function (ex, receiver) { hcm.readRecords(request, ex, receiver); }, timeoutMs);
  return js(response.getRecords()) || [];
}

/** Sleep sessions: [{ id, start, end, stages: [{ start, end, type }] }]. */
exports.sleep = function (from, to, timeoutMs) {
  return read('android.health.connect.datatypes.SleepSessionRecord', from, to, timeoutMs).map(function (record) {
    var stages = [];
    var it = record.getStages().iterator();
    while (it.hasNext()) {
      var stage = it.next();
      stages.push({ start: ms(stage.getStartTime()), end: ms(stage.getEndTime()), type: Number(stage.getType()) });
    }
    return { id: String(record.getMetadata().getId()), start: ms(record.getStartTime()), end: ms(record.getEndTime()), stages: stages };
  });
};

/** Workouts: [{ id, start, end, type, title }]. */
exports.exercises = function (from, to, timeoutMs) {
  return read('android.health.connect.datatypes.ExerciseSessionRecord', from, to, timeoutMs).map(function (record) {
    var title = record.getTitle();
    return {
      id: String(record.getMetadata().getId()),
      start: ms(record.getStartTime()),
      end: ms(record.getEndTime()),
      type: Number(record.getExerciseType()),
      title: title ? String(title) : ''
    };
  });
};

var HYDRATION = 'android.health.connect.datatypes.HydrationRecord';

/** Writes a glass of water (ml at a moment); returns the Health Connect id of the record. */
exports.writeWater = function (at, ml, timeoutMs) {
  var hcm = manager();
  if (!hcm) return null;
  var dt = android.health.connect.datatypes;
  var start = java.time.Instant.ofEpochMilli(at);
  var record = new dt.HydrationRecord.Builder(new dt.Metadata.Builder().build(), start, start.plusSeconds(60),
    dt.units.Volume.fromLiters(ml / 1000)).build();
  var list = new java.util.ArrayList();
  list.add(record);
  var response = wait(function (ex, receiver) { hcm.insertRecords(list, ex, receiver); }, timeoutMs);
  var saved = response.getRecords();
  return saved && saved.size() ? String(saved.get(0).getMetadata().getId()) : null;
};

/** Takes a glass written by writeWater back. */
exports.deleteWater = function (id, timeoutMs) {
  var hcm = manager();
  if (!hcm || !id) return false;
  var filters = new java.util.ArrayList();
  filters.add(android.health.connect.RecordIdFilter.fromId(java.lang.Class.forName(HYDRATION), String(id)));
  wait(function (ex, receiver) { hcm.deleteRecords(filters, ex, receiver); }, timeoutMs);
  return true;
};

// A few names of ExerciseSessionType for the record's title.
var TYPES = { 8: 'велосипед', 9: 'велотренажёр', 25: 'эллипсоид', 36: 'интервальная', 37: 'поход', 56: 'бег',
  57: 'бег на дорожке', 70: 'силовая', 73: 'плавание', 74: 'плавание', 79: 'ходьба', 83: 'йога' };
exports.typeName = function (type) {
  return TYPES[type] || 'тренировка';
};
