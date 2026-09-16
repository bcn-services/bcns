# bcn-services.com DNS — BEFORE (captured 2026-09-15, Squarespace panel + dig)

Registrar: Squarespace Domains II LLC. NS: nsd1-4.squarespacedns.com.
Panel: https://account.squarespace.com/domains/managed/bcn-services.com/dns/dns-settings
Banner: "This domain is managed by Google Workspace".
NOTE: the domain does NOT appear in the Squarespace Domains *list* page; only the
deep link above reaches it.

## DNS Presets
| TYPE | NAME | PRIORITY | TTL | DATA |
|---|---|---|---|---|
| CNAME | _domainconnect | N/A | 1 hr | _domainconnect.domains.squarespace.com |

## Custom records (11)
| # | TYPE | NAME | PRIORITY | TTL | DATA |
|---|---|---|---|---|---|
| 1 | A | @ | N/A | 4 hrs | 216.198.79.1 |
| 2 | CNAME | oedwg6jrpjwi.send | N/A | 4 hrs | gv-jucthsvjjly6sk.dv.googlehosted.com |
| 3 | MX | @ | 1 | 1 hr | smtp.google.com |
| 4 | MX | send | 1 | 30 mins | smtp.google.com |
| 5 | TXT | @ | N/A | 1 hr | v=spf1 include:_spf.google.com ~all |
| 6 | TXT | _dmarc | N/A | 30 mins | v=DMARC1; p=none; rua=mailto:dmarc@bcn-ser... |
| 7 | TXT | _dmarc.send | N/A | 30 mins | v=DMARC1; p=none; rua=mailto:dmarc@bcn-ser... |
| 8 | TXT | google._domainkey | N/A | 1 hr | v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQE... |
| 9 | TXT | google._domainkey.s(end) | N/A | 30 mins | v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQE... |
| 10 | TXT | send | N/A | 30 mins | google-site-verification=xGvFKhjGAWOXKi6F8o... |
| 11 | TXT | send | N/A | 30 mins | v=spf1 include:_spf.google.com ~all |

Mail rows to leave untouched: 3,4 (MX) · 5,11 (SPF) · 8,9 (DKIM) · 6,7 (DMARC) · 2,10 (Workspace verification).
No `www` record exists. No wildcard exists.

## dig, same moment
```
apex      A : 216.198.79.1 
connect   A : (empty)
mcp       A : (empty)
sb        A : (empty)
MX          : 1 smtp.google.com. 
SPF         : "v=spf1 include:_spf.google.com ~all" 
DMARC       : "v=DMARC1; p=none; rua=mailto:dmarc@bcn-services.com" 
DKIM        : "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxf67PjTW8sMvDZL8C

```
