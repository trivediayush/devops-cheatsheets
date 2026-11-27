import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateSubnet } from './subnet.mjs'

test('calculates standard /24 subnet accurately', () => {
  const res = calculateSubnet('10.0.0.0/24')
  assert.equal(res.error, undefined)
  const map = Object.fromEntries(res.rows.map((r) => [r.label, r.value]))
  assert.equal(map['Subnet mask'], '255.255.255.0')
  assert.equal(map['Wildcard mask'], '0.0.0.255')
  assert.equal(map['Network address'], '10.0.0.0')
  assert.equal(map['Broadcast address'], '10.0.0.255')
  assert.equal(map['Host range'], '10.0.0.1 – 10.0.0.254')
  assert.equal(map['Total addresses'], '256')
  assert.equal(map['Standard usable hosts'], '254')
  assert.equal(map['AWS assignable IPv4'], '251')
})

test('handles /31 and /32 edge prefixes', () => {
  const r32 = calculateSubnet('192.168.1.42/32')
  const map32 = Object.fromEntries(r32.rows.map((r) => [r.label, r.value]))
  assert.equal(map32['Standard usable hosts'], '1')
  assert.equal(map32['Host range'], '192.168.1.42 – 192.168.1.42')
  assert.match(map32['AWS assignable IPv4'], /n\/a/)

  const r31 = calculateSubnet('10.1.1.0/31')
  const map31 = Object.fromEntries(r31.rows.map((r) => [r.label, r.value]))
  assert.equal(map31['Standard usable hosts'], '2')
  assert.equal(map31['Host range'], '10.1.1.0 – 10.1.1.1')
})

test('validates malformed and out-of-range inputs', () => {
  assert.ok(calculateSubnet('not-an-ip').error)
  assert.ok(calculateSubnet('999.0.0.0/24').error)
  assert.ok(calculateSubnet('10.0.0.1/33').error)
})
