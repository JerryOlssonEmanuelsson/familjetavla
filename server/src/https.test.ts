import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { certNames, certPaths } from "./https.js";

// A throwaway self-signed test certificate (no private key here) for hemma.example.org.
const PEM = `-----BEGIN CERTIFICATE-----
MIIBvDCCAWGgAwIBAgIUMpmvfpRZ5IP4YCEmN9HE8y7gOMswCgYIKoZIzj0EAwIw
HDEaMBgGA1UEAwwRaGVtbWEuZXhhbXBsZS5vcmcwHhcNMjYxMDIzMTQwMjMzWhcN
MzYxMDIwMTQwMjMzWjAcMRowGAYDVQQDDBFoZW1tYS5leGFtcGxlLm9yZzBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABJwjRyypVuy4UqyJpwOhDfKa4Y9syT11JmI/
UAdDm4SkpVuHOxFRuCOWkxVdt0YFf8CFcX/1zSk6dch9eU1CJx6jgYAwfjAdBgNV
HQ4EFgQUSitC0Br093pkb2jkppg4K+fHuE0wHwYDVR0jBBgwFoAUSitC0Br093pk
b2jkppg4K+fHuE0wDwYDVR0TAQH/BAUwAwEB/zArBgNVHREEJDAighFoZW1tYS5l
eGFtcGxlLm9yZ4INKi5leGFtcGxlLm9yZzAKBggqhkjOPQQDAgNJADBGAiEAlO0i
Y8adVzbcmcXrVxpCXZGAOHZhJwnNUF7xvZO+ENcCIQCOwit7ymnUjekxozYN4+To
6LoCx6lC9BDixODV53J+6w==
-----END CERTIFICATE-----`;

describe("https", () => {
  it("reads the address the certificate is for, not wildcards", () => {
    expect(certNames(PEM)).toEqual(["hemma.example.org"]);
    expect(certNames("inte ett certifikat")).toEqual([]);
  });

  it("uses Home Assistant's /ssl files only when both exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "ssl-"));
    writeFileSync(join(dir, "fullchain.pem"), PEM);
    expect(certPaths({ SSL_CERT: join(dir, "fullchain.pem"), SSL_KEY: join(dir, "privkey.pem") })).toBeNull();
    writeFileSync(join(dir, "privkey.pem"), "x");
    expect(certPaths({ SSL_CERT: join(dir, "fullchain.pem"), SSL_KEY: join(dir, "privkey.pem") })).toEqual({ cert: join(dir, "fullchain.pem"), key: join(dir, "privkey.pem") });
  });
});
