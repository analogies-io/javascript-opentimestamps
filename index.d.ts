// Types for the subset of the library that stamping and upgrading proofs needs.
// Byte arrays are plain `number[]` (0-255) unless a Uint8Array is named.

type Bytes = number[]
type BinaryInput = Bytes | Uint8Array | ArrayBuffer

declare namespace OpenTimestamps {
  interface StampOptions {
    /** Calendar base URLs; defaults to Calendar.DEFAULT_AGGREGATORS. */
    calendars?: string[]
    /** At least this many calendars must answer, otherwise `stamp` rejects. Default 1, or 2 with two or more calendars. */
    m?: number
    /** Milliseconds each calendar has to answer. */
    timeout?: number
  }

  interface UpgradeOptions {
    /** Ask these calendars instead of the ones named in the pending attestations. */
    calendars?: string[]
    /** Calendars a pending attestation may point at; defaults to Calendar.DEFAULT_CALENDAR_WHITELIST. */
    whitelist?: Calendar.UrlWhitelist
    /** Milliseconds each calendar has to answer. */
    timeout?: number
  }

  /** Adds pending attestations to the given files in place; rejects when fewer than `m` calendars answered. */
  function stamp (detaches: DetachedTimestampFile | DetachedTimestampFile[], options?: StampOptions): Promise<void>
  /** Resolves true when the timestamp gained an attestation. */
  function upgrade (detached: DetachedTimestampFile, options?: UpgradeOptions): Promise<boolean>

  class DetachedTimestampFile {
    constructor (fileHashOp: Ops.Op, timestamp: Timestamp)
    fileHashOp: Ops.Op
    timestamp: Timestamp
    static fromHash (fileHashOp: Ops.Op, fdHash: BinaryInput): DetachedTimestampFile
    static deserialize (buffer: Context.StreamDeserialization | BinaryInput): DetachedTimestampFile
    fileDigest (): Bytes
    serializeToBytes (): Uint8Array
    equals (another: DetachedTimestampFile): boolean
  }

  class Timestamp {
    msg: Bytes
    attestations: Notary.TimeAttestation[]
    getAttestations (): Set<Notary.TimeAttestation>
    isTimestampComplete (): boolean
    equals (another: Timestamp): boolean
  }

  namespace Ops {
    class Op {}
    class CryptOp extends Op {}
    class OpSHA256 extends CryptOp {}
  }

  namespace Notary {
    class TimeAttestation {}
    class UnknownAttestation extends TimeAttestation {
      payload: Bytes
    }
    /** A calendar promised to commit the timestamp; `uri` is where to ask for the upgrade. */
    class PendingAttestation extends TimeAttestation {
      constructor (uri: string)
      uri: string
    }
    class BitcoinBlockHeaderAttestation extends TimeAttestation {
      constructor (height: number)
      height: number
    }
  }

  namespace Context {
    class StreamDeserialization {
      constructor (stream: Uint8Array | ArrayBuffer | Bytes | string)
    }
  }

  namespace Calendar {
    class UrlWhitelist {
      constructor (urls?: string[])
      add (url: string): void
      contains (url: string): boolean
    }
    const DEFAULT_CALENDAR_WHITELIST: UrlWhitelist
    const DEFAULT_AGGREGATORS: string[]
  }
}

export = OpenTimestamps
