const test = require('tape')
const Calendar = require('../src/calendar.js')
const Utils = require('../src/utils.js')
const Helper = require('./helpers/calendar-server.js')

const DIGEST = Utils.hexToBytes('57cfa5c46716df9bd9e83595bce439c58108d8fcc1678f30d4c6731c3f1fa6c7')

// Resolves with the rejection reason; fails the test when the promise resolves or hangs.
function rejection (assert, promise, ms = 3000) {
  let timer
  const guard = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('no rejection within ' + ms + ' ms')), ms)
  })
  return Promise.race([promise, guard]).then(
    value => { assert.fail('expected a rejection, got ' + value); return new Error('resolved') },
    err => err
  ).finally(() => clearTimeout(timer))
}

test('RemoteCalendar.submit() returns the calendar timestamp', async assert => {
  const calendar = await Helper.pendingCalendar('https://alice.example/calendar')
  try {
    const timestamp = await new Calendar.RemoteCalendar(calendar.url).submit(DIGEST)
    assert.deepEqual(timestamp.msg, DIGEST, 'timestamp commits to the digest')
    assert.equal(timestamp.attestations[0].uri, 'https://alice.example/calendar')
    assert.equal(calendar.requests[0].method, 'POST')
    assert.equal(calendar.requests[0].url, '/digest')
    assert.deepEqual(Array.from(calendar.requests[0].body), DIGEST, 'the digest is the request body')
    assert.equal(calendar.requests[0].headers.accept, 'application/vnd.opentimestamps.v1')
  } finally {
    await calendar.close()
  }
  assert.end()
})

test('RemoteCalendar.getTimestamp() returns the upgraded timestamp', async assert => {
  const calendar = await Helper.startCalendar((req, res) => {
    res.writeHead(200)
    res.end(Helper.bitcoinAnswer(DIGEST, 358391))
  })
  try {
    const timestamp = await new Calendar.RemoteCalendar(calendar.url).getTimestamp(DIGEST)
    assert.equal(timestamp.attestations[0].height, 358391)
    assert.equal(calendar.requests[0].method, 'GET')
    assert.equal(calendar.requests[0].url, '/timestamp/' + Utils.bytesToHex(DIGEST))
  } finally {
    await calendar.close()
  }
  assert.end()
})

for (const method of ['submit', 'getTimestamp']) {
  test('RemoteCalendar.' + method + '() rejects a response over the size limit', async assert => {
    const calendar = await Helper.startCalendar((req, res) => {
      res.writeHead(200)
      res.end(Buffer.alloc(20000, 0x41))
    })
    try {
      const err = await rejection(assert, new Calendar.RemoteCalendar(calendar.url)[method](DIGEST))
      assert.true(err instanceof Calendar.ExceededSizeError, 'ExceededSizeError, got ' + err.name + ': ' + err.message)
    } finally {
      await calendar.close()
    }
    assert.end()
  })

  test('RemoteCalendar.' + method + '() rejects a response that is not a timestamp', async assert => {
    const calendar = await Helper.startCalendar((req, res) => {
      res.writeHead(200)
      res.end(Buffer.from([0x01, 0x02, 0x03]))
    })
    try {
      const err = await rejection(assert, new Calendar.RemoteCalendar(calendar.url)[method](DIGEST))
      assert.false(err instanceof TypeError, 'not a TypeError masking the cause, got ' + err.name + ': ' + err.message)
      assert.true(err instanceof Error && err.message.length > 0, 'readable message: ' + err.message)
    } finally {
      await calendar.close()
    }
    assert.end()
  })

  test('RemoteCalendar.' + method + '() rejects after the timeout when the calendar does not answer', async assert => {
    const calendar = await Helper.startCalendar(() => { /* never answers */ })
    try {
      const started = Date.now()
      const err = await rejection(assert, new Calendar.RemoteCalendar(calendar.url, { timeout: 150 })[method](DIGEST))
      assert.true(Date.now() - started < 2500, 'rejected soon after the timeout')
      assert.false(err instanceof TypeError, 'not a TypeError, got ' + err.name + ': ' + err.message)
      assert.true(/timeout|timed out/i.test(err.message), 'message names the timeout: ' + err.message)
    } finally {
      await calendar.close()
    }
    assert.end()
  })

  test('RemoteCalendar.' + method + '() keeps the status code and text of an HTTP error', async assert => {
    const calendar = await Helper.failingCalendar(500, 'calendar exploded')
    try {
      const err = await rejection(assert, new Calendar.RemoteCalendar(calendar.url)[method](DIGEST))
      assert.false(err instanceof TypeError, 'not a TypeError, got ' + err.name + ': ' + err.message)
      assert.equal(err.statusCode, 500, 'status code kept')
      assert.true(err.message.includes('500') && err.message.includes('calendar exploded'), 'message: ' + err.message)
    } finally {
      await calendar.close()
    }
    assert.end()
  })
}

test('RemoteCalendar.getTimestamp() maps a 404 to CommitmentNotFoundError', async assert => {
  const calendar = await Helper.failingCalendar(404, 'Not found')
  try {
    const err = await rejection(assert, new Calendar.RemoteCalendar(calendar.url).getTimestamp(DIGEST))
    assert.true(err instanceof Calendar.CommitmentNotFoundError, 'got ' + err.name + ': ' + err.message)
    assert.equal(err.statusCode, 404)
  } finally {
    await calendar.close()
  }
  assert.end()
})

test('UrlWhitelist.contains() works with the installed minimatch', assert => {
  const whitelist = Calendar.DEFAULT_CALENDAR_WHITELIST
  assert.true(whitelist.contains('https://a.calendar.opentimestamps.org'))
  assert.false(whitelist.contains('https://calendar.evil.example'))
  assert.false(whitelist.contains('https://a.calendar.opentimestamps.org.evil.example'))
  assert.end()
})
