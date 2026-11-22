// Compiled with `tsc --strict --noEmit`; uses every entry of the typed subset (index.d.ts).
import OpenTimestamps = require('../../index')

const { DetachedTimestampFile, Ops, Notary, Context, Calendar } = OpenTimestamps

async function stampAndUpgrade (digest: number[], ots: Uint8Array): Promise<boolean> {
  const fresh: OpenTimestamps.DetachedTimestampFile = DetachedTimestampFile.fromHash(new Ops.OpSHA256(), digest)
  await OpenTimestamps.stamp(fresh)
  await OpenTimestamps.stamp([fresh], { calendars: ['https://a.pool.opentimestamps.org'], m: 1, timeout: 5000 })

  const stored = DetachedTimestampFile.deserialize(new Context.StreamDeserialization(ots))
  const again = DetachedTimestampFile.deserialize(ots)
  const bytes: Uint8Array = stored.serializeToBytes()
  const sameDigest: number[] = again.fileDigest()
  const sameFile: boolean = stored.equals(again) && bytes.length === sameDigest.length

  const whitelist = new Calendar.UrlWhitelist(['https://*.calendar.example'])
  whitelist.add('https://other.example')
  const listed: boolean = whitelist.contains('https://a.calendar.example') || Calendar.DEFAULT_CALENDAR_WHITELIST.contains('x')
  const defaults: string[] = Calendar.DEFAULT_AGGREGATORS

  const timestamp: OpenTimestamps.Timestamp = stored.timestamp
  const msg: number[] = timestamp.msg
  const complete: boolean = timestamp.isTimestampComplete() && timestamp.equals(again.timestamp)
  const attestations: OpenTimestamps.Notary.TimeAttestation[] = timestamp.attestations
  for (const attestation of timestamp.getAttestations()) {
    if (attestation instanceof Notary.PendingAttestation) {
      const uri: string = attestation.uri
      console.log(uri)
    } else if (attestation instanceof Notary.BitcoinBlockHeaderAttestation) {
      const height: number = attestation.height
      console.log(height)
    } else if (attestation instanceof Notary.UnknownAttestation) {
      const payload: number[] = attestation.payload
      console.log(payload)
    }
  }
  console.log(new Notary.PendingAttestation('https://x.example').uri, new Notary.BitcoinBlockHeaderAttestation(1).height)
  console.log(sameFile, listed, defaults, msg, complete, attestations, stored.fileHashOp, new DetachedTimestampFile(stored.fileHashOp, timestamp))

  const changed = await OpenTimestamps.upgrade(stored, { calendars: [], whitelist, timeout: 5000 })
  return changed || await OpenTimestamps.upgrade(stored)
}

// @ts-expect-error a digest must be bytes, not a string
DetachedTimestampFile.fromHash(new Ops.OpSHA256(), 'deadbeef')

void stampAndUpgrade
