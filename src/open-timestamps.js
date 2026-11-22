'use strict'

/**
 * OpenTimestamps module.
 * @module OpenTimestamps
 * @author EternityWall
 * @license LPGL3
 */

const Promise = require('promise')
const Context = require('./context.js')
const DetachedTimestampFile = require('./detached-timestamp-file.js')
const Timestamp = require('./timestamp.js')
const Utils = require('./utils.js')
const Ops = require('./ops.js')
const Calendar = require('./calendar.js')
const Notary = require('./notary.js')
const Merkle = require('./merkle.js')

module.exports = {

  /**
   * Show information on a timestamp.
   * @exports OpenTimestamps/info
   * @param {DetachedTimestampFile} detached - The array of detached file to stamp.
   * @param {Object} options - The option arguments.
   * @param {boolean} options.verbose - True if verbose output.
   * @return {String} The message to print.
   */
  info (detached, options) {
    if ((detached === undefined) || !(detached instanceof DetachedTimestampFile)) {
      console.error('Invalid input')
      return 'Invalid input'
    }

    const timestamp = detached.timestamp
    const hashOp = detached.fileHashOp._HASHLIB_NAME()
    const fileHash = Utils.bytesToHex(detached.fileDigest())
    const firstLine = 'File ' + hashOp + ' hash: ' + fileHash + '\n'

    try {
      if (options !== undefined && options.verbose) {
        return firstLine + 'Timestamp:\n' + timestamp.strTree(0, 1)
      }
      return firstLine + 'Timestamp:\n' + timestamp.strTree(0, 0)
    } catch (err) {
      return 'Error parsing info ' + err
    }
  },

  /**
   * Show information on a timestamp.
   * @exports OpenTimestamps/json
   * @param {ArrayBuffer} ots - The ots array buffer.
   * @return {String} The message to print in Json string format.
   */
  json (ots) {
    const json = {}

    if (ots === undefined) {
      json.result = 'KO'
      json.error = 'No ots file'
      return JSON.stringify(json)
    }

    let timestamp

    if (ots instanceof Timestamp) {
      // Pass timestamp
      timestamp = ots
      json.hash = Utils.bytesToHex(timestamp.msg)
    } else {
      // Deserialize timestamp from file
      try {
        const ctx = new Context.StreamDeserialization(ots)
        const detachedTimestampFile = DetachedTimestampFile.deserialize(ctx)
        timestamp = detachedTimestampFile.timestamp
        json.hash = Utils.bytesToHex(timestamp.msg)
        json.op = detachedTimestampFile.fileHashOp._HASHLIB_NAME()
      } catch (err) {
        json.result = 'KO'
        json.error = 'Error deserialization ' + err
        return JSON.stringify(json)
      }
    }

    try {
      json.result = 'OK'
      json.timestamp = timestamp.toJson()
    } catch (err) {
      json.result = 'KO'
      json.error = 'Error parsing info ' + err
    }
    return JSON.stringify(json)
  },

  /**
   * Create timestamp with the aid of a remote calendar for one or multiple files.
   * @exports OpenTimestamps/stamp
   * @param {DetachedTimestampFile[]} detaches - The array of detached file to stamp; input/output parameter.
   * @param {Object} options - The option arguments.
   * @param {String[]} options.calendars - public calendar url list.
   * @param {number} options.m - at least M calendars replied.
   * @return {Promise<void,Error>} if resolve modified detaches parameter.
   */
  stamp (detaches, options = {}) {
    // Parse input detaches
    let detachedList
    if (detaches instanceof DetachedTimestampFile) {
      detachedList = [detaches]
    } else if (detaches instanceof Array) {
      detachedList = detaches
    } else {
      return new Promise((resolve, reject) => { reject(new Error('Invalid input')) })
    }

    // Build markle tree
    const merkleTip = this.makeMerkleTree(detachedList)
    if (merkleTip === undefined) {
      return new Promise((resolve, reject) => { reject(new Error('Invalid input')) })
    }

    // Parse options : public calendars
    if (!options.calendars || options.calendars.length === 0) {
      options.calendars = Calendar.DEFAULT_AGGREGATORS
    }
    if (!options.m || options.m === 0) {
      options.m = 1
      if (options.calendars.length >= 2) {
        options.m = 2
      }
    } else if (options.m < 0 || options.m > options.calendars.length) {
      console.log('m cannot be greater than available calendar neither less or equal 0')
      return new Promise((resolve, reject) => {
        reject(new Error('m cannot be greater than available calendar neither less or equal 0'))
      })
    }

    // Build timestamp from the merkle root
    return this.createTimestamp(merkleTip, options.calendars, options.m).then(timestamp => {
      if (timestamp === undefined) {
        throw new Error('Error on timestamp creation')
      }
    })
  },

  /**
   * Create a timestamp
   * @param {timestamp} timestamp - The timestamp.
   * @param {String[]} calendars - Public calendar url list.
   * @param {number} m - At least M calendars replied.
   * @return {Promise<Timestamp,Error>} if resolve return new timestamp.
   */
  createTimestamp (timestamp, calendars, m) {
    const res = []
    if (calendars) {
      calendars.forEach(calendar => {
        const remote = new Calendar.RemoteCalendar(calendar)
        res.push(remote.submit(timestamp.msg))
        console.log('Submitting to remote calendar ' + calendar)
      })
    }

    return Promise.all(res.map(Utils.softFail))
      .then(results => {
        // console.log('results=' + results);
        results
          .filter(r => !(r instanceof Error) && r !== undefined)
          .forEach(resultTimestamp => {
            timestamp.merge(resultTimestamp)
          })
        // console.log(timestamp.strTree());
        return timestamp
      })
  },

  /**
     * Make Merkle Tree.
     * @param fileTimestamps The list of DetachedTimestampFile.
     * @return merkle tip timestamp.
     */
  makeMerkleTree (fileTimestamps) {
    /* Add nonce:
         * Remember that the files - and their timestamps - might get separated
         * later, so if we didn't use a nonce for every file, the timestamp
         * would leak information on the digests of adjacent files.
         * */
    const merkleRoots = []
    fileTimestamps.forEach(fileTimestamp => {
      if (!(fileTimestamp instanceof DetachedTimestampFile)) {
        console.error('Invalid input')
        return undefined
      }
      try {
        const bytesRandom16 = Utils.randBytes(16)
        // nonce_appended_stamp = file_timestamp.timestamp.ops.add(OpAppend(os.urandom(16)))
        const nonceAppendedStamp = fileTimestamp.timestamp.add(new Ops.OpAppend(Utils.arrayToBytes(bytesRandom16)))
        // merkle_root = nonce_appended_stamp.ops.add(OpSHA256())
        const merkleRoot = nonceAppendedStamp.add(new Ops.OpSHA256())
        merkleRoots.push(merkleRoot)
      } catch (err) {
        return undefined
      }
    })

    const merkleTip = Merkle.makeMerkleTree(merkleRoots)
    return merkleTip
  },

  /** Upgrade a timestamp.
   * @exports OpenTimestamps/upgrade
   * @param {DetachedTimestampFile} detached - The DetachedTimestampFile object.
   * @param {Object} options - The option arguments.
   * @param {String[]} options.calendars - Override calendars in timestamp.
   * @param {UrlWhitelist} options.whitelist - Remote calendar whitelist.
   * @return {Promise<boolean,Error>} if resolve return True if the timestamp has changed, False otherwise.
   */
  upgrade (detached, options) {
    // Upgrade timestamp
    return this.upgradeTimestamp(detached.timestamp, options).then(changed => {
      // changed = true - Timestamp upgraded
      // detached.timestamp.isTimestampComplete() - Timestamp complete
      return changed
    })
  },

  /** Attempt to upgrade an incomplete timestamp to make it verifiable.
   * Note that this means if the timestamp that is already complete, False will be returned as nothing has changed.
   * @param {Timestamp} timestamp - The timestamp.
   * @param {Object} options - The option arguments.
   * @param {String[]} options.calendars - Override calendars in timestamp.
   * @param {UrlWhitelist} options.whitelist - Remote calendar whitelist.
   * @return {Promise<boolean,Error>} if resolve return True if the timestamp has changed, False otherwise.
   */
  upgradeTimestamp (timestamp, options) {
    const existingAttestations = timestamp.getAttestations()
    const promises = []
    const self = this

    if (!options) {
      options = {}
    }
    if (!options.whitelist) {
      options.whitelist = Calendar.DEFAULT_CALENDAR_WHITELIST
    }

    timestamp.directlyVerified().forEach(subStamp => {
      subStamp.attestations.forEach(attestation => {
        if (attestation instanceof Notary.PendingAttestation) {
          // check if already resolved
          if (subStamp.isTimestampComplete()) {
            return
          }
          let calendars = []
          if (options.calendars && options.calendars.length > 0) {
            calendars = options.calendars.slice()
            console.log('Attestation URI ' + attestation.uri + ' overridden by user-specified remote calendar(s)')
          } else {
            if (options.whitelist.contains(attestation.uri)) {
              calendars.push(attestation.uri)
            } else {
              console.log('Ignoring attestation from calendar ' + attestation.uri + ': Calendar not in whitelist')
            }
          }

          const commitment = subStamp.msg
          calendars.forEach(calendarUrl => {
            const calendar = new Calendar.RemoteCalendar(calendarUrl)
            // console.log('Checking calendar ' + attestation.uri + ' for ' + Utils.bytesToHex(subStamp.msg))
            promises.push(self.upgradeStamp(subStamp, calendar, commitment, existingAttestations))
          })
        }
      })
    })

    return Promise.all(promises.map(Utils.softFail))
      .then(results => {
        let changed = false
        results.forEach(result => {
          if (result !== undefined && !(result instanceof Error)) {
            changed = true
            result.subStamp.merge(result.upgradedStamp)
          }
        })
        return changed
      }).catch(err => {
        console.error(err)
        throw err
      })
  },

  /** Merge attestations of a timestamp
     * @param {Timestamp} subStamp - The current timestamp to upgrade.
     * @param {Calendar} calendar - The calender to check the attestation.
     * @param {byte[]} commitment - The commitment to upgrade.
     * @param {TimeAttestation[]} existingAttestations - The timestamp.
     * @return {Promise<boolean,Error>} if resolve return original and upgraded timestamp.
     */
  upgradeStamp (subStamp, calendar, commitment, existingAttestations) {
    return calendar.getTimestamp(commitment).then(upgradedStamp => {
      // console.log(Timestamp.strTreeExtended(upgradedStamp, 0));
      // const atts_from_remote = get_attestations(upgradedStamp)
      const attsFromRemote = upgradedStamp.getAttestations()
      if (attsFromRemote.size > 0) {
        // console.log(attsFromRemote.size + ' attestation(s) from ' + calendar.url);
        console.log('Got 1 attestation(s) from ' + calendar.url)
      }

      // Set difference from remote attestations & existing attestations
      const newAttestations = new Set([...attsFromRemote].filter(x => !existingAttestations.has(x)))
      if (newAttestations.size > 0) {
        // changed & found_new_attestations
        // foundNewAttestations = true;
        // console.log(attsFromRemote.size + ' attestation(s) from ' + calendar.url);

        // Set union of existingAttestations & newAttestations
        existingAttestations = new Set([...existingAttestations, ...newAttestations])
        return { subStamp, upgradedStamp }
        // subStamp.merge(upgradedStamp);
        // args.cache.merge(upgraded_stamp)
        // sub_stamp.merge(upgraded_stamp)
      }
      return {}
    }).catch(err => {
      console.log('Calendar ' + calendar.url + ': ' + err.message)
      throw err
    })
  }
}
