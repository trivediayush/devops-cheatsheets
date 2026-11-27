export const SUBNET_PRESETS = [
  { label: '10.0.0.0/24', cidr: '10.0.0.0/24', note: 'Standard /24' },
  { label: '192.168.10.77/26', cidr: '192.168.10.77/26', note: 'Quarter /24' },
  { label: '10.0.0.0/16', cidr: '10.0.0.0/16', note: 'AWS VPC' },
  { label: '172.16.0.0/28', cidr: '172.16.0.0/28', note: 'Small subnet' },
  { label: '10.0.1.0/30', cidr: '10.0.1.0/30', note: 'Point-to-point' },
]

export function toInt(octets) {
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
}

export function toIp(n) {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export function calculateSubnet(rawInput) {
  const value = String(rawInput || '').trim()
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
  if (!match) {
    return { error: 'Enter an IPv4 address with a prefix, for example 10.0.0.0/24.' }
  }

  const octets = match.slice(1, 5).map(Number)
  const prefix = Number(match[5])
  if (octets.some((o) => o > 255) || prefix > 32) {
    return { error: 'Octets must be 0–255 and the prefix 0–32.' }
  }

  const ip = toInt(octets)
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  const wildcard = (~mask) >>> 0
  const network = (ip & mask) >>> 0
  const broadcast = (network | wildcard) >>> 0
  const total = 2 ** (32 - prefix)

  let first
  let last
  let usable
  if (prefix === 32) {
    first = network
    last = network
    usable = 1
  } else if (prefix === 31) {
    first = network
    last = broadcast
    usable = 2
  } else {
    first = network + 1
    last = broadcast - 1
    usable = total - 2
  }

  const awsUsable = prefix >= 16 && prefix <= 28 ? total - 5 : null

  return {
    rows: [
      { label: 'Subnet mask', value: toIp(mask), copyable: true },
      { label: 'Wildcard mask', value: toIp(wildcard), copyable: true },
      { label: 'Network address', value: toIp(network), copyable: true },
      {
        label: 'Broadcast address',
        value: prefix >= 31 ? `${toIp(broadcast)} (not reserved on /${prefix})` : toIp(broadcast),
        copyValue: toIp(broadcast),
        copyable: true,
      },
      { label: 'Host range', value: `${toIp(first)} – ${toIp(last)}`, copyable: true },
      { label: 'Total addresses', value: total.toLocaleString('en-US'), copyable: false },
      { label: 'Standard usable hosts', value: usable.toLocaleString('en-US'), copyable: false },
      {
        label: 'AWS assignable IPv4',
        value: awsUsable === null ? 'n/a (AWS subnets are /16–/28)' : awsUsable.toLocaleString('en-US'),
        copyable: false,
      },
    ],
  }
}
