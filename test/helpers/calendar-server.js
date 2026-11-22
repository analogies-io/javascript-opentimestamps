'use strict'

/**
 * In-process stand-in for an OpenTimestamps calendar, listening on port 0 (the
 * system picks a free port), so that tests never touch the network.
 */

const http = require('http')
const Context = require('../../src/context.js')
const Notary = require('../../src/notary.js')
const Timestamp = require('../../src/timestamp.js')

/**
 * Serialized calendar answer: a Timestamp over `msg` that carries `attestation`.
 * @param {byte[]} msg - The committed message.
 * @param {TimeAttestation} attestation - The attestation to put on the leaf.
 * @return {Buffer} The bytes a calendar sends.
 */
function calendarAnswer (msg, attestation) {
  const timestamp = new Timestamp(Array.from(msg))
  timestamp.attestations.push(attestation)
  const ctx = new Context.StreamSerialization()
  timestamp.serialize(ctx)
  return Buffer.from(ctx.getOutput())
}

function pendingAnswer (msg, uri) {
  return calendarAnswer(msg, new Notary.PendingAttestation(uri))
}

function bitcoinAnswer (msg, height) {
  return calendarAnswer(msg, new Notary.BitcoinBlockHeaderAttestation(height))
}

/**
 * Start a calendar. `handler(req, res, body)` answers every request; `body` is the
 * request body as a Buffer. Resolves with `{ url, requests, close }`.
 * @param {Function} handler - The request handler.
 * @return {Promise<Object>} The running calendar.
 */
function startCalendar (handler) {
  const requests = []
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      requests.push({ method: req.method, url: req.url, headers: req.headers, body })
      handler(req, res, body)
    })
  })
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        url: 'http://127.0.0.1:' + server.address().port,
        requests,
        close: () => new Promise(resolve => {
          server.closeAllConnections()
          server.close(resolve)
        })
      })
    })
  })
}

/** Calendar that answers every POST /digest with a pending attestation. */
function pendingCalendar (uri) {
  return startCalendar((req, res, body) => {
    res.writeHead(200, { 'Content-Type': 'application/vnd.opentimestamps.v1' })
    res.end(pendingAnswer(Array.from(body), uri))
  })
}

/** Calendar that answers every request with the given status and text. */
function failingCalendar (status = 500, text = 'calendar is down') {
  return startCalendar((req, res) => {
    res.writeHead(status, { 'Content-Type': 'text/plain' })
    res.end(text)
  })
}

module.exports = {
  startCalendar, pendingCalendar, failingCalendar, pendingAnswer, bitcoinAnswer
}
