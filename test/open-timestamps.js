const test = require('tape')
const fs = require('fs')
const path = require('path')
const Utils = require('../src/utils.js')
const OpenTimestamps = require('../src/open-timestamps.js')
const DetachedTimestampFile = require('../src/detached-timestamp-file.js')
const Calendar = require('../src/calendar.js')
const Context = require('../src/context.js')
const Ops = require('../src/ops.js')
const Notary = require('../src/notary.js')
const Helper = require('./helpers/calendar-server.js')

// The example files ship with the repository, so no test needs the network.
const example = name => fs.readFileSync(path.join(__dirname, '..', 'examples', name))
const incompleteOtsInfo = example('incomplete.txt.ots.info')
const incompleteOts = example('incomplete.txt.ots')
const incomplete = example('incomplete.txt')
const helloworldOts = example('hello-world.txt.ots')
const helloworld = example('hello-world.txt')
const merkle2Ots = example('merkle2.txt.ots')
const merkle2OtsInfo = example('merkle2.txt.ots.info')
const unknownOts = example('unknown-notary.txt.ots')
const knownUnknownOts = example('known-and-unknown-notary.txt.ots')
const merkle3Ots = example('merkle3.txt.ots')
const badStampOts = example('bad-stamp.txt.ots')

// INFO TESTS
test('OpenTimestamps.info()', assert => {
  const detachedOts = DetachedTimestampFile.deserialize(new Context.StreamDeserialization(incompleteOts))
  const otsInfoCalc = OpenTimestamps.info(detachedOts)
  assert.false(otsInfoCalc === undefined)
  assert.false(incompleteOts === undefined)
  assert.true(incompleteOtsInfo.equals(Buffer.from(otsInfoCalc)))
  assert.end()
})

test('OpenTimestamps.info()', assert => {
  const detachedOts = DetachedTimestampFile.deserialize(new Context.StreamDeserialization(merkle2Ots))
  const merkle2OtsInfoCalc = OpenTimestamps.info(detachedOts)
  assert.false(merkle2OtsInfoCalc === undefined)
  assert.false(merkle2Ots === undefined)
  assert.true(merkle2OtsInfo.equals(Buffer.from(merkle2OtsInfoCalc)))
  assert.end()
})

test('OpenTimestamps.info()', assert => {
  const detachedOts = DetachedTimestampFile.deserialize(new Context.StreamDeserialization(unknownOts))
  const unknownInfoCalc = OpenTimestamps.info(detachedOts)
  assert.false(unknownInfoCalc === undefined)
  assert.false(unknownOts === undefined)
  assert.end()
})

test('OpenTimestamps.info()', assert => {
  const detachedOts = DetachedTimestampFile.deserialize(new Context.StreamDeserialization(knownUnknownOts))
  const knownUnknownInfoCalc = OpenTimestamps.info(detachedOts)
  assert.false(knownUnknownInfoCalc === undefined)
  assert.false(knownUnknownOts === undefined)
  assert.end()
})

test('OpenTimestamps.info()', assert => {
  const detachedOts = DetachedTimestampFile.deserialize(new Context.StreamDeserialization(merkle3Ots))
  const merkle3InfoCalc = OpenTimestamps.info(detachedOts)
  assert.false(merkle3InfoCalc === undefined)
  assert.false(merkle3Ots === undefined)
  assert.end()
})

test('OpenTimestamps.info()', assert => {
  const detachedOts = DetachedTimestampFile.deserialize(new Context.StreamDeserialization(badStampOts))
  const badStampInfoCalc = OpenTimestamps.info(detachedOts)
  assert.false(badStampInfoCalc === undefined)
  assert.false(badStampOts === undefined)
  assert.end()
})

test('OpenTimestamps.DetachedTimestampFile()', assert => {
  const detached1 = DetachedTimestampFile.fromBytes(new Ops.OpSHA256(), incomplete)

  const ctx = new Context.StreamDeserialization(incomplete)
  const detached2 = DetachedTimestampFile.fromBytes(new Ops.OpSHA256(), ctx)

  const ctx1 = new Context.StreamDeserialization(incomplete)
  const fdHash = new Ops.OpSHA256().hashFd(ctx1)
  const detached3 = DetachedTimestampFile.fromHash(new Ops.OpSHA256(), fdHash)

  const bufferHash = Buffer.from(fdHash)
  const detached4 = DetachedTimestampFile.fromHash(new Ops.OpSHA256(), bufferHash)

  assert.true(detached1.equals(detached2))
  assert.true(detached2.equals(detached3))
  assert.true(detached3.equals(detached4))
  assert.end()
})

test('OpenTimestamps.emptyTimestamp()', assert => {
  const info = 'File sha256 hash: 05c4f616a8e5310d19d938cfd769864d7f4ccdc2ca8b479b10af83564b097af9\nTimestamp:\n'
  const detached = DetachedTimestampFile.fromBytes(new Ops.OpSHA256(), incomplete)
  const detachedInfo = OpenTimestamps.info(detached)
  assert.equal(detachedInfo, info)

  // serialize & deserialize
  const ctx = new Context.StreamSerialization()
  detached.serialize(ctx)
  const buffer = Buffer.from(ctx.getOutput())

  // error to deserialize an ots with empty timestamp
  try {
    DetachedTimestampFile.deserialize(new Context.StreamDeserialization(buffer))
    assert.true(false)
  } catch (err) {
    assert.true(true)
  }
  assert.end()
})

test('OpenTimestamps.serialize()', assert => {
  // from bytes: serialize to buffer
  const det = DetachedTimestampFile.fromBytes(new Ops.OpSHA256(), helloworld)
  const ots = det.serializeToBytes()

  // from bytes: serialize with context
  try {
    const detached = DetachedTimestampFile.fromBytes(new Ops.OpSHA256(), helloworld)
    const ctx = new Context.StreamSerialization()
    detached.serialize(ctx)
    assert.true(Utils.arrEq(ots, ctx.getOutput()))
  } catch (err) {
    assert.fail(err)
  }

  // from hash: serialize to buffer
  try {
    const hash = (new Ops.OpSHA256()).call(helloworld)
    const detached = DetachedTimestampFile.fromHash(new Ops.OpSHA256(), hash)
    const bytes = Utils.arrayToBytes(detached.serializeToBytes())
    assert.true(Utils.arrEq(ots, bytes))
  } catch (err) {
    assert.fail(err)
  }

  // from hash: serialize with context
  try {
    const hash = (new Ops.OpSHA256()).call(helloworld)
    const detached = DetachedTimestampFile.fromHash(new Ops.OpSHA256(), hash)
    const ctx = new Context.StreamSerialization()
    detached.serialize(ctx)
    assert.true(Utils.arrEq(ots, ctx.getOutput()))
  } catch (err) {
    assert.fail(err)
  }

  // from ots: serialize to buffer
  try {
    const detached = DetachedTimestampFile.deserialize(helloworldOts)
    const bytes = Utils.arrayToBytes(detached.serializeToBytes())
    assert.true(Utils.arrEq(helloworldOts, bytes))
  } catch (err) {
    assert.fail(err)
  }

  // from ots: serialize with context
  try {
    const detached = DetachedTimestampFile.deserialize(helloworldOts)
    const ctx = new Context.StreamSerialization()
    detached.serialize(ctx)
    assert.true(Utils.arrEq(helloworldOts, ctx.getOutput()))
  } catch (err) {
    assert.fail()
  }

  assert.end()
})

// STAMP AND UPGRADE AGAINST AN IN-PROCESS CALENDAR
const SHA256_OF_HELLO = () => (new Ops.OpSHA256()).call(helloworld)
const freshFile = () => DetachedTimestampFile.fromHash(new Ops.OpSHA256(), SHA256_OF_HELLO())

function pendingAttestations (detached) {
  return Array.from(detached.timestamp.getAttestations()).filter(a => a instanceof Notary.PendingAttestation)
}

// Runs `fn` while console.* is replaced by a recorder; returns what was written.
async function captureConsole (fn) {
  const names = ['log', 'error', 'warn', 'info', 'debug']
  const saved = {}
  const written = []
  names.forEach(name => {
    saved[name] = console[name]
    console[name] = (...args) => written.push(name + ': ' + args.join(' '))
  })
  try {
    await fn()
  } catch (err) {
    written.push('rejected: ' + err.message)
  } finally {
    names.forEach(name => { console[name] = saved[name] })
  }
  return written
}

// Resolves with the rejection reason; fails the test when the promise resolves or hangs.
function rejection (assert, promise, ms = 4000) {
  let timer
  const guard = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('no rejection within ' + ms + ' ms')), ms)
  })
  return Promise.race([promise, guard]).then(
    value => { assert.fail('expected a rejection, got ' + value); return new Error('resolved') },
    err => err
  ).finally(() => clearTimeout(timer))
}

test('OpenTimestamps.stamp() adds the pending attestation of the calendar', async assert => {
  const calendar = await Helper.pendingCalendar('https://alice.example/calendar')
  try {
    const detached = freshFile()
    await OpenTimestamps.stamp(detached, { calendars: [calendar.url] })
    const pending = pendingAttestations(detached)
    assert.equal(pending.length, 1)
    assert.equal(pending[0].uri, 'https://alice.example/calendar')
    // The calendar received sha256(digest || nonce), never the digest itself.
    const sent = calendar.requests[0].body
    assert.equal(sent.length, 32)
    assert.false(Utils.arrEq(Array.from(sent), SHA256_OF_HELLO()), 'the digest is not sent as is')
    assert.true(Array.from(detached.timestamp.allTips()).some(tip => Utils.arrEq(tip, Array.from(sent))), 'the sent value is a tip of the tree')
  } finally {
    await calendar.close()
  }
  assert.end()
})

test('OpenTimestamps.stamp() fails when every calendar fails', async assert => {
  const calendarA = await Helper.failingCalendar(500, 'down A')
  const calendarB = await Helper.failingCalendar(503, 'down B')
  try {
    for (const options of [
      { calendars: [calendarA.url, calendarB.url] },
      { calendars: [calendarA.url, calendarB.url], m: 1 },
      { calendars: [calendarA.url], m: 1 }
    ]) {
      const detached = freshFile()
      const err = await rejection(assert, OpenTimestamps.stamp(detached, options))
      assert.true(err instanceof Error && err.message.length > 0, 'error: ' + err.message)
      assert.equal(pendingAttestations(detached).length, 0, 'no attestation was invented')
    }
  } finally {
    await calendarA.close()
    await calendarB.close()
  }
  assert.end()
})

test('OpenTimestamps.stamp() enforces m', async assert => {
  const good = await Helper.pendingCalendar('https://good.example/calendar')
  const bad = await Helper.failingCalendar(500, 'down')
  try {
    const detachedM2 = freshFile()
    const err = await rejection(assert, OpenTimestamps.stamp(detachedM2, { calendars: [good.url, bad.url], m: 2 }))
    assert.true(/2/.test(err.message) || /calendar/i.test(err.message), 'm = 2 with one failure rejects: ' + err.message)

    const detachedDefault = freshFile()
    await rejection(assert, OpenTimestamps.stamp(detachedDefault, { calendars: [good.url, bad.url] }))

    const detachedM1 = freshFile()
    await OpenTimestamps.stamp(detachedM1, { calendars: [good.url, bad.url], m: 1 })
    assert.equal(pendingAttestations(detachedM1).length, 1, 'm = 1 accepts one answer out of two')
  } finally {
    await good.close()
    await bad.close()
  }
  assert.end()
})

test('OpenTimestamps.stamp() passes the timeout on to the calendars', async assert => {
  const silent = await Helper.startCalendar(() => { /* never answers */ })
  try {
    const started = Date.now()
    const err = await rejection(assert, OpenTimestamps.stamp(freshFile(), { calendars: [silent.url], timeout: 150 }))
    assert.true(Date.now() - started < 3000, 'rejected soon after the timeout: ' + err.message)
  } finally {
    await silent.close()
  }
  assert.end()
})

test('OpenTimestamps.stamp() rejects an invalid m', async assert => {
  const calendar = await Helper.pendingCalendar('https://alice.example/calendar')
  try {
    const err = await rejection(assert, OpenTimestamps.stamp(freshFile(), { calendars: [calendar.url], m: 5 }))
    assert.true(err instanceof Error)
    assert.equal(calendar.requests.length, 0, 'no calendar was contacted')
  } finally {
    await calendar.close()
  }
  assert.end()
})

test('OpenTimestamps.upgrade() merges the attestation of a whitelisted calendar', async assert => {
  const upgradeCalendar = await Helper.startCalendar((req, res) => {
    res.writeHead(200)
    res.end(Helper.bitcoinAnswer(Utils.hexToBytes(req.url.split('/')[2]), 358391))
  })
  try {
    // A pending attestation that points at the in-process calendar.
    const detached = freshFile()
    const pendingCalendar = await Helper.pendingCalendar(upgradeCalendar.url)
    await OpenTimestamps.stamp(detached, { calendars: [pendingCalendar.url] })
    await pendingCalendar.close()

    const whitelist = new Calendar.UrlWhitelist([upgradeCalendar.url])
    const changed = await OpenTimestamps.upgrade(detached, { whitelist })
    assert.true(changed, 'upgraded')
    const heights = Array.from(detached.timestamp.getAttestations())
      .filter(a => a instanceof Notary.BitcoinBlockHeaderAttestation).map(a => a.height)
    assert.deepEqual(heights, [358391])
    assert.equal(upgradeCalendar.requests.length, 1)
  } finally {
    await upgradeCalendar.close()
  }
  assert.end()
})

test('OpenTimestamps.upgrade() with the default whitelist skips foreign calendars without any request', async assert => {
  const detached = freshFile()
  const foreign = await Helper.pendingCalendar('https://calendar.evil.example')
  try {
    await OpenTimestamps.stamp(detached, { calendars: [foreign.url] })
  } finally {
    await foreign.close()
  }
  const changed = await OpenTimestamps.upgrade(detached)
  assert.equal(changed, false)
  assert.equal(pendingAttestations(detached).length, 1)
  assert.end()
})

test('OpenTimestamps.upgrade() keeps the timestamp when the calendar fails', async assert => {
  const failing = await Helper.failingCalendar(500, 'down')
  const detached = freshFile()
  const pendingCalendar = await Helper.pendingCalendar(failing.url)
  try {
    await OpenTimestamps.stamp(detached, { calendars: [pendingCalendar.url] })
    const changed = await OpenTimestamps.upgrade(detached, { whitelist: new Calendar.UrlWhitelist([failing.url]) })
    assert.equal(changed, false)
  } finally {
    await pendingCalendar.close()
    await failing.close()
  }
  assert.end()
})

test('stamp and upgrade write nothing to the console', async assert => {
  const good = await Helper.pendingCalendar('https://alice.example/calendar')
  const bad = await Helper.failingCalendar(500, 'down')
  const upgradeCalendar = await Helper.startCalendar((req, res) => {
    res.writeHead(200)
    res.end(Helper.bitcoinAnswer(Utils.hexToBytes(req.url.split('/')[2]), 1))
  })
  try {
    const written = await captureConsole(async () => {
      await OpenTimestamps.stamp(freshFile(), { calendars: [good.url, bad.url], m: 1 })
      await OpenTimestamps.stamp(freshFile(), { calendars: [bad.url] }).catch(() => {})
      await OpenTimestamps.stamp(freshFile(), { calendars: [good.url], m: 3 }).catch(() => {})

      // upgrade: a calendar that upgrades, one that fails, one outside the whitelist, one overridden by options.calendars
      const detached = freshFile()
      const p1 = await Helper.pendingCalendar(upgradeCalendar.url)
      await OpenTimestamps.stamp(detached, { calendars: [p1.url] })
      await p1.close()
      await OpenTimestamps.upgrade(detached, { whitelist: new Calendar.UrlWhitelist([upgradeCalendar.url]) })

      const failing = freshFile()
      const p2 = await Helper.pendingCalendar(bad.url)
      await OpenTimestamps.stamp(failing, { calendars: [p2.url] })
      await p2.close()
      await OpenTimestamps.upgrade(failing, { whitelist: new Calendar.UrlWhitelist([bad.url]) })
      await OpenTimestamps.upgrade(failing)
      await OpenTimestamps.upgrade(failing, { calendars: [bad.url] })
    })
    assert.deepEqual(written, [], 'no console output')
  } finally {
    await good.close()
    await bad.close()
    await upgradeCalendar.close()
  }
  assert.end()
})
