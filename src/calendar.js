'use strict'

/**
 * Calendar module.
 * @module Calendar
 * @author EternityWall
 * @license LPGL3
 */

/* global fetch, AbortSignal */
const minimatchModule = require('minimatch')
require('./extend-error.js')

const Utils = require('./utils.js')
const Context = require('./context.js')
const Timestamp = require('./timestamp.js')

// minimatch >= 10 exports { minimatch }; older majors export the function itself.
const minimatch = typeof minimatchModule === 'function' ? minimatchModule : minimatchModule.minimatch

/* Errors */
const CommitmentNotFoundError = Error.extend('CommitmentNotFoundError')
const URLError = Error.extend('URLError')
const ExceededSizeError = Error.extend('ExceededSizeError')

/** Largest calendar response accepted, in bytes. */
const MAX_RESPONSE_BYTES = 10000
/** Default time a calendar has to answer, in milliseconds. */
const DEFAULT_TIMEOUT_MS = 10000

/**
 * Read a response body, giving up as soon as more than `limit` bytes arrive.
 * @param {Response} response - The fetch response.
 * @param {number} limit - The largest accepted body, in bytes.
 * @return {Promise<Buffer>} The received bytes.
 */
async function readLimited (response, limit) {
  const declared = Number(response.headers.get('content-length'))
  if (declared > limit) {
    if (response.body) {
      await response.body.cancel().catch(() => {})
    }
    throw new ExceededSizeError('Calendar response exceeded size limit')
  }
  const chunks = []
  let received = 0
  if (response.body) {
    for await (const chunk of response.body) {
      received += chunk.length
      if (received > limit) {
        throw new ExceededSizeError('Calendar response exceeded size limit')
      }
      chunks.push(chunk)
    }
  }
  return Buffer.concat(chunks)
}

function isTimeout (err) {
  return err.name === 'TimeoutError' || (err.cause && err.cause.name === 'TimeoutError')
}

/** Class representing Remote Calendar server interface */
class RemoteCalendar {
  /**
   * Create a RemoteCalendar.
   * @param {string} url - The server url.
   * @param {Object} options - The option arguments.
   * @param {number} options.timeout - Milliseconds a request may take (default: 10000).
   */
  constructor (url, options = {}) {
    this.url = url
    this.timeout = options.timeout === undefined ? DEFAULT_TIMEOUT_MS : options.timeout
    this.headers = {
      Accept: 'application/vnd.opentimestamps.v1',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'javascript-opentimestamps'
    }
  }

  /**
   * Send a request and return the body, bounded in time and size.
   * Every failure is an Error whose message says what happened; HTTP errors keep
   * `statusCode` and the text the calendar sent.
   * @param {string} path - The path on the calendar.
   * @param {Object} init - The fetch options.
   * @return {Promise<Buffer>} The response body.
   */
  async request (path, init) {
    let response
    try {
      response = await fetch(new URL(path, this.url), {
        ...init,
        headers: this.headers,
        signal: AbortSignal.timeout(this.timeout)
      })
    } catch (err) {
      throw new URLError(isTimeout(err)
        ? 'Calendar request timed out after ' + this.timeout + ' ms'
        : 'Calendar request failed: ' + err.message)
    }
    let body
    try {
      body = await readLimited(response, MAX_RESPONSE_BYTES)
    } catch (err) {
      if (err instanceof ExceededSizeError) {
        throw err
      }
      throw new URLError(isTimeout(err)
        ? 'Calendar request timed out after ' + this.timeout + ' ms'
        : 'Calendar response could not be read: ' + err.message)
    }
    if (!response.ok) {
      const err = new URLError('Calendar answered HTTP ' + response.status + ': ' + body.toString('utf8'))
      err.statusCode = response.status
      throw err
    }
    return body
  }

  /**
   * Read a calendar answer as a Timestamp over `msg`.
   * @param {Buffer} body - The response body.
   * @param {byte[]} msg - The message the timestamp commits to.
   * @return {Timestamp} The timestamp.
   */
  static parseTimestamp (body, msg) {
    try {
      return Timestamp.deserialize(new Context.StreamDeserialization(body), msg)
    } catch (err) {
      throw new URLError('Calendar response is not a valid timestamp: ' + err.message)
    }
  }

  /**
   * This callback is called when the result is loaded.
   * @callback resolve
   * @param {Timestamp} timestamp - The timestamp of the Calendar response.
   */

  /**
   * This callback is called when the result fails to load.
   * @callback reject
   * @param {Error} error - The error that occurred while loading the result.
   */

  /**
   * Submitting a digest to remote calendar. Returns a Timestamp committing to that digest.
   * @param {byte[]} digest - The digest hash to send.
   * @returns {Promise} A promise that returns {@link resolve} if resolved
   * and {@link reject} if rejected.
   */
  async submit (digest) {
    const body = await this.request('/digest', { method: 'POST', body: Buffer.from(digest) })
    return RemoteCalendar.parseTimestamp(body, digest)
  }

  /**
   * Get a timestamp for a given commitment.
   * @param {byte[]} digest - The digest hash to send.
   * @returns {Promise} A promise that returns {@link resolve} if resolved
   * and {@link reject} if rejected.
   */
  async getTimestamp (commitment) {
    let body
    try {
      body = await this.request('/timestamp/' + Utils.bytesToHex(commitment), { method: 'GET' })
    } catch (err) {
      if (err.statusCode === 404) {
        const notFound = new CommitmentNotFoundError(err.message)
        notFound.statusCode = 404
        throw notFound
      }
      throw err
    }
    return RemoteCalendar.parseTimestamp(body, commitment)
  }
}

class UrlWhitelist {
  constructor (urls) {
    this.urls = new Set()
    if (!urls) {
      return
    }
    urls.forEach(u => this.add(u))
  }

  add (url) {
    if (typeof (url) !== 'string') {
      throw new TypeError('URL must be a string')
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      this.urls.add(url)
    } else {
      this.urls.add('http://' + url)
      this.urls.add('https://' + url)
    }
  }

  contains (url) {
    return [...this.urls].filter(u => minimatch(url, u)).length > 0
  }

  toString () {
    return 'UrlWhitelist([' + this.urls.join(',') + '])'
  }
}

const DEFAULT_CALENDAR_WHITELIST = new UrlWhitelist(
  ['https://*.calendar.opentimestamps.org', // Run by Peter Todd
    'https://*.calendar.eternitywall.com', // Run by Riccardo Casatta of Eternity Wall
    'https://*.calendar.catallaxy.com' // Run by Vincent Cloutier of Catallaxy
  ])

const DEFAULT_AGGREGATORS =
['https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
  'https://ots.btc.catallaxy.com'
]

module.exports = {
  RemoteCalendar,
  UrlWhitelist,
  MAX_RESPONSE_BYTES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CALENDAR_WHITELIST,
  DEFAULT_AGGREGATORS,
  CommitmentNotFoundError,
  URLError,
  ExceededSizeError
}
