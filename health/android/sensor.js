// The phone's own step counter (Sensor.TYPE_STEP_COUNTER): steps since the phone started.
// One reading: subscribe, take the first value, unsubscribe. Needs ACTIVITY_RECOGNITION.

exports.present = function () {
  var manager = context.getSystemService('sensor');
  return Boolean(manager && manager.getDefaultSensor(android.hardware.Sensor.TYPE_STEP_COUNTER));
};

exports.granted = function () {
  return context.checkSelfPermission('android.permission.ACTIVITY_RECOGNITION') === 0;
};

/** The counter's value, or null when the sensor said nothing within waitMs. */
exports.read = function (waitMs) {
  var manager = context.getSystemService('sensor');
  var sensor = manager && manager.getDefaultSensor(android.hardware.Sensor.TYPE_STEP_COUNTER);
  if (!sensor) return null;
  var latch = new java.util.concurrent.CountDownLatch(1);
  var box = { value: null };
  var listener = new android.hardware.SensorEventListener({
    onSensorChanged: function (event) {
      if (box.value === null) {
        box.value = Number(event.values[0]);
        latch.countDown();
      }
    },
    onAccuracyChanged: function () {}
  });
  manager.registerListener(listener, sensor, android.hardware.SensorManager.SENSOR_DELAY_NORMAL);
  try {
    latch.await(waitMs || 4000, java.util.concurrent.TimeUnit.MILLISECONDS);
  } finally {
    manager.unregisterListener(listener);
  }
  return box.value;
};

/** When the phone started, in ms: to tell a restart (the counter starts from zero again). */
exports.boot = function () {
  return Date.now() - Number(android.os.SystemClock.elapsedRealtime());
};
