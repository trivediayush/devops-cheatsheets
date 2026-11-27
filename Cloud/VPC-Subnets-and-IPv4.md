---
title: VPCs, Subnets & IPv4 Subnetting
description: Practical VPC networking reference covering CIDR, IPv4 subnet masks, subnet calculations, AWS route tables, gateways and an interactive subnet calculator.
---

# VPCs, Subnets & IPv4 Subnetting

A practical field guide to virtual networks, CIDR notation, subnet masks, route tables and address planning. Includes a live IPv4 calculator, worked examples, AWS-specific behaviour and troubleshooting commands.

<SubnetCalculator />

## 1. The mental model

A Virtual Private Cloud (VPC) is a logically isolated network space in a cloud provider. You choose address ranges, divide them into subnets, and control traffic with routes and network security controls. In AWS, a VPC is regional while each subnet belongs to exactly one Availability Zone (AZ).

| Building block | What it means | Operational question |
|---|---|---|
| VPC | Your private network boundary and address space | Which CIDR ranges belong to this environment? |
| CIDR block | An IP range written as `address/prefix` | How many addresses are available? |
| Subnet | A smaller range carved from a VPC CIDR | Which workloads belong in this zone and tier? |
| Route table | Destination-to-target rules for traffic | Where does this packet go next? |
| Internet gateway (IGW) | VPC attachment for internet-routed IPv4/IPv6 traffic | Does this subnet have a direct internet route? |
| NAT gateway | Managed outbound IPv4 translation for private resources | Can private workloads initiate internet connections? |
| Security group | Stateful resource-level traffic filter in AWS | Which connections are allowed to this workload? |
| Network ACL (NACL) | Stateless subnet-level traffic filter in AWS | Are both request and return directions allowed? |

> A subnet is not public because its CIDR is public, nor private because its addresses are RFC 1918 addresses. In AWS, the route table determines whether the subnet is public: a direct route to an attached internet gateway makes it public. Address assignment, security rules and route reachability are separate concerns.

## 2. IPv4, subnet masks and CIDR

IPv4 addresses are 32 bits, usually displayed as four decimal octets. A subnet prefix says how many leading bits identify the network; the remaining bits identify addresses inside that network.

For example, `192.168.10.77/26` has 26 network bits and 6 host bits:

- Subnet mask: `255.255.255.192`
- Network address: `192.168.10.64`
- Broadcast address: `192.168.10.127`
- Total addresses: `2⁶ = 64`
- Standard usable host addresses: `64 − 2 = 62`
- Host range: `192.168.10.65` to `192.168.10.126`

### Common prefix reference

| CIDR | Subnet mask | Total IPv4 addresses | Standard usable hosts* | Typical use |
|---|---|---|---|---|
| `/16` | `255.255.0.0` | 65,536 | 65,534 | Large private network / VPC |
| `/20` | `255.255.240.0` | 4,096 | 4,094 | Large workload segment |
| `/22` | `255.255.252.0` | 1,024 | 1,022 | Medium workload segment |
| `/23` | `255.255.254.0` | 512 | 510 | Medium subnet |
| `/24` | `255.255.255.0` | 256 | 254 | Common LAN / workload subnet |
| `/25` | `255.255.255.128` | 128 | 126 | Smaller segment |
| `/26` | `255.255.255.192` | 64 | 62 | Small application tier |
| `/27` | `255.255.255.224` | 32 | 30 | Small service segment |
| `/28` | `255.255.255.240` | 16 | 14 | Smallest typical AWS IPv4 subnet |
| `/30` | `255.255.255.252` | 4 | 2 | Legacy point-to-point links |
| `/31` | `255.255.255.254` | 2 | 2 | Point-to-point links (RFC 3021) |
| `/32` | `255.255.255.255` | 1 | 1 | Single-host route |

*Standard host counts use the traditional network/broadcast reservation for prefixes `/0` through `/30`. `/31` point-to-point links can use both addresses; `/32` identifies one address. Cloud-provider reservations can reduce assignable capacity further.

### The subnet math

For a conventional IPv4 subnet:

```text
Total addresses       = 2 ^ (32 - prefix length)
Standard usable hosts = total addresses - 2   (prefix /0 through /30)
Subnet mask           = prefix 1-bits, then 0-bits
Network address       = IP address AND subnet mask
Broadcast address     = network address OR wildcard mask
Wildcard mask         = 255.255.255.255 - subnet mask
```

Block-size shortcut: in the octet where the subnet mask stops at a value other than `255` or `0`, calculate `256 − mask_octet`. That is the increment between network addresses.

Example: `/26` has mask `255.255.255.192`, so the block size is `256 − 192 = 64`. The last octet network boundaries are `0`, `64`, `128`, and `192`.

For `192.168.10.77/26`, the address `77` falls in the `64–127` block. Therefore the network is `.64`, broadcast is `.127`, and the standard host range is `.65–.126`.

## 3. Subnetting worked examples

### Split a `/24` into four equal subnets

A `/24` contains 256 addresses. Borrow two host bits to create four networks: `/24` becomes `/26` because `2² = 4`.

| Subnet | Network | Usable host range | Broadcast |
|---|---|---|---|
| 1 | `10.0.0.0/26` | `10.0.0.1 – 10.0.0.62` | `10.0.0.63` |
| 2 | `10.0.0.64/26` | `10.0.0.65 – 10.0.0.126` | `10.0.0.127` |
| 3 | `10.0.0.128/26` | `10.0.0.129 – 10.0.0.190` | `10.0.0.191` |
| 4 | `10.0.0.192/26` | `10.0.0.193 – 10.0.0.254` | `10.0.0.255` |

Each `/26` contains 64 addresses and 62 standard usable hosts. The four ranges are contiguous and do not overlap.

### Binary view of the `/26` calculation

The final mask octet for `/26` is `192` (`11000000` in binary). The final IP octet `77` is `01001101`:

```text
IP octet:       01001101   (77)
Subnet mask:    11000000   (192)
                -------- AND
Network octet: 01000000   (64)
```

The host bits are the final six bits. Setting them all to `1` gives the broadcast octet `01111111` (`127`). This is the same result shown by the CIDR calculator above.

### Plan for capacity, not only today's instance count

- Estimate peak addresses per tier, including autoscaling, load balancers, pod/ENI allocation and maintenance headroom.
- Allocate a larger VPC CIDR with room for future Availability Zones, environments and services.
- Divide the VPC into non-overlapping subnet ranges; leave address space unallocated where growth is expected.
- Avoid overlap with on-premises, VPN, peered VPC and transit-network ranges. Overlap makes routing and connectivity difficult or impossible without translation.
- Record the owner, environment, AZ, purpose and intended route policy for every subnet.

## 4. AWS VPC subnet behaviour

AWS-specific details matter when translating subnet math into deployable capacity:

- An AWS VPC is regional. An AWS subnet is tied to one Availability Zone; create subnets in multiple AZs for zonal resilience.
- An IPv4 VPC/subnet CIDR is selected from allowed private or publicly routable ranges subject to AWS rules. For a subnet, the IPv4 prefix is between `/16` and `/28`.
- Subnet CIDRs inside the same VPC must not overlap.
- AWS reserves five IPv4 addresses per subnet: the first four addresses and the final address in the range. A `/24` therefore has `256 − 5 = 251` assignable IPv4 addresses, not 254.
- A subnet is associated with one route table at a time. If you do not explicitly associate one, it uses the VPC's main route table.

| AWS IPv4 subnet | Total addresses | AWS-reserved addresses | Assignable addresses |
|---|---|---|---|
| `/16` | 65,536 | 5 | 65,531 |
| `/20` | 4,096 | 5 | 4,091 |
| `/24` | 256 | 5 | 251 |
| `/25` | 128 | 5 | 123 |
| `/26` | 64 | 5 | 59 |
| `/27` | 32 | 5 | 27 |
| `/28` | 16 | 5 | 11 |

AWS reserves the subnet network address, the first usable address for the VPC router, the second address for DNS, the third address for future use, and the final address in the subnet range. This is why AWS capacity differs from the standard IPv4 host count.

### Example: a two-AZ application VPC

A simple production layout can reserve separate ranges for public entry points, private application workloads and isolated data services. The following ranges all fit inside `10.40.0.0/16` and do not overlap:

| Tier | Availability Zone A | Availability Zone B | Route pattern |
|---|---|---|---|
| Public | `10.40.0.0/24` | `10.40.1.0/24` | `0.0.0.0/0 → IGW` |
| Application | `10.40.16.0/20` | `10.40.48.0/20` | `0.0.0.0/0 → NAT in same AZ` |
| Data | `10.40.32.0/24` | `10.40.33.0/24` | VPC-local and explicitly approved private routes only |

```text
                         VPC 10.40.0.0/16
                                  |
             +--------------------+--------------------+
             |                                         |
          AZ A                                      AZ B
       +---------+                                +---------+
       | Public  | -- IGW route                   | Public  | -- IGW route
       | /24     |                                | /24     |
       +----+----+                                +----+----+
            | NAT / private route                       | NAT / private route
       +----v----+                                +----v----+
       | App /20 |                                | App /20 |
       +----+----+                                +----+----+
            |                                         |
       +----v----+                                +----v----+
       | Data/24 |                                | Data/24 |
       +---------+                                +---------+
```

This is an address-planning example, not a universal sizing recommendation. Size each tier for expected ENIs, autoscaling, load balancers, container networking and growth. Keep enough unused space to add subnets and services without renumbering.

## 5. Public, private and isolated subnets

The route table is the deciding factor. A default route is written as `0.0.0.0/0` for all IPv4 destinations; IPv6 uses `::/0` separately.

| Subnet pattern | Example route | What it means |
|---|---|---|
| Public | `0.0.0.0/0 → igw-...` | Direct route to the VPC's internet gateway. A resource also needs suitable public addressing and security rules for internet reachability. |
| Private with egress | `0.0.0.0/0 → nat-...` | Outbound IPv4 internet access via NAT; no direct route from the subnet to the IGW. |
| Isolated | No internet default route | No internet path through an IGW or NAT gateway; only explicitly configured private routes and local VPC routes apply. |
| IPv6 egress-only | `::/0 → eigw-...` | Outbound-initiated IPv6 connectivity without allowing unsolicited inbound internet connections. |

### Minimal route table examples

Public subnet route table

```text
Destination       Target
10.20.0.0/16      local
0.0.0.0/0         igw-0123456789abcdef0
```

Private application subnet route table

```text
Destination       Target
10.20.0.0/16      local
0.0.0.0/0         nat-0123456789abcdef0
```

For production, consider one NAT gateway per AZ and route each private subnet to the NAT gateway in its own AZ. This avoids cross-AZ dependency and transfer charges and limits the impact of an AZ failure. NAT gateways are not inbound connection proxies; use an internet-facing load balancer or another explicitly designed ingress path.

## 6. Security controls: security groups vs NACLs

| Feature | Security group | Network ACL |
|---|---|---|
| Scope | Attached to network interfaces/resources | Applied at subnet boundary |
| State | Stateful; response traffic is tracked automatically | Stateless; allow both request and response directions |
| Rules | Allow rules only | Allow and deny rules |
| Evaluation | All applicable rules are aggregated | Numbered rules evaluated in order; first match wins |
| Typical use | Workload-specific least-privilege access | Coarse subnet-level guardrails or explicit deny rules |

A route that exists does not guarantee a successful connection. Check routes, security groups, NACLs, DNS, host firewalls and application listeners as separate layers.

## 7. VPC connectivity building blocks

| Component | Use it for | Watch out for |
|---|---|---|
| VPC peering | Private routing between two VPCs | Not transitive; overlapping CIDRs are not supported for peering |
| Transit Gateway | Hub-and-spoke connectivity across many VPCs and VPNs | Route-table segmentation and attachment propagation need deliberate design |
| Site-to-Site VPN | Encrypted connectivity to an on-premises network | Check BGP/static routes, tunnel health and non-overlapping CIDRs |
| Direct Connect | Dedicated private connectivity from on-premises to AWS | It is not encryption by itself; add VPN/MACsec where required |
| VPC endpoint | Private access to supported AWS services | Gateway endpoints and interface endpoints have different routing/DNS behaviour |
| VPC Flow Logs | Capture IP traffic metadata for network troubleshooting | Flow logs are not packet captures and are not real-time packet inspection |

## 8. AWS CLI quick reference

```bash
# Inspect VPC CIDR ranges
aws ec2 describe-vpcs \
  --query 'Vpcs[].{Vpc:VpcId,CIDRs:CidrBlockAssociationSet[*].CidrBlock}'

# List subnets, AZs and available IPv4 capacity
aws ec2 describe-subnets \
  --query 'Subnets[].{Subnet:SubnetId,VPC:VpcId,CIDR:CidrBlock,AZ:AvailabilityZone,Available:AvailableIpAddressCount}'

# Inspect route tables and subnet associations
aws ec2 describe-route-tables \
  --query 'RouteTables[].{Table:RouteTableId,Routes:Routes,Associations:Associations}'

# Inspect security groups
aws ec2 describe-security-groups \
  --query 'SecurityGroups[].{Group:GroupId,VPC:VpcId,Ingress:IpPermissions,Egress:IpPermissionsEgress}'

# Inspect VPC Flow Log configuration
aws ec2 describe-flow-logs --filter Name=resource-id,Values=vpc-0123456789abcdef0
```

## 9. Troubleshooting checklist

```text
1. Address plan?     Is the workload IP inside the expected subnet CIDR?
2. CIDR overlap?     Does this range overlap a peered, VPN or on-prem network?
3. Route table?      Is the subnet associated with the intended route table?
4. Next hop?         Does the route target exist and have a healthy path?
5. Security group?   Are the source, destination, protocol and port allowed?
6. Network ACL?      Are both forward and return ephemeral-port paths allowed?
7. DNS?              Does the name resolve to the intended private/public address?
8. Host and app?     Is the process listening on the expected interface and port?
9. Capacity?         Is the subnet running out of assignable IP addresses?
10. Flow Logs?       Are packets ACCEPTed or REJECTed along the path?
```

### Common symptoms

- Instance has no outbound internet: check public IP/EIP + IGW route for public subnets, or NAT gateway + private route for private IPv4 egress.
- VPC peering connects but a host is unreachable: check both VPC route tables, security controls, DNS options and CIDR overlap.
- Subnet launch failures: inspect available IPv4 address count and AWS-reserved addresses; also check ENI/IP consumption by managed services.
- One AZ fails while another works: compare subnet associations, route targets, NAT dependencies and AZ-specific endpoints.

## 10. Learning resources

- [AWS VPC CIDR blocks](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html)
- [AWS subnet sizing and reserved IPv4 addresses](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html)
- [AWS subnet route tables](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-route-tables.html)
- [AWS subnet and VPC configuration options](https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html)
- [RFC 4632 — Classless Inter-domain Routing (CIDR)](https://www.rfc-editor.org/rfc/rfc4632)
- [RFC 3021 — Using 31-bit prefixes on IPv4 point-to-point links](https://www.rfc-editor.org/rfc/rfc3021)
