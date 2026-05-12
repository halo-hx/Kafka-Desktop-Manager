# Security Policy

## Supported Versions

Only the latest minor release receives security updates.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report them privately via one of the following channels:

1. [GitHub Security Advisories](https://github.com/halo-hx/Kafka-Desktop-Manager/security/advisories/new) (preferred).
2. Email **jinjie_he@outlook.com** with the subject line `[kafka-desktop-manager] security`.

Include as much of the following as possible:

- A description of the vulnerability and its impact.
- Steps to reproduce (PoC / sample config welcome).
- The affected version(s) and platform(s).
- Any suggested remediation.

We aim to:

- Acknowledge receipt within **3 business days**.
- Provide a status update within **7 business days**.
- Release a patch within **30 days** for high-severity issues.

## Disclosure Policy

We follow a coordinated disclosure model: we will work with you to confirm,
fix and release the patch before any public disclosure. After a fix is
released, we are happy to credit reporters in the release notes (unless you
prefer to remain anonymous).

## Scope

In scope:

- The desktop application and its IPC surface (`src-tauri/`).
- The React frontend (`src/`).
- Official release artifacts.

Out of scope:

- Vulnerabilities in third-party Kafka clusters you connect to.
- Issues caused by user misconfiguration (e.g. storing credentials in plain
  text outside the app).
