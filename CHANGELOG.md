# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-13

First open-source preview release.

### Added

- **Connection management** — multi-cluster connections with import/export, favourites,
  and connection health indicators.
- **Cluster overview** — brokers, topics, partitions, consumer groups at a glance;
  read-only cluster configuration viewer.
- **Topic management** — create/delete topics, partition details, live configuration
  viewer and editor.
- **Message viewer** — browse, filter, search, send messages; import and export with
  JSON / Avro / Protobuf support.
- **Consumer groups** — lag monitoring, offset reset, group state management.
- **Schema Registry** — browse, register, and evolve schemas.
- **Kafka Connect** — connector and task lifecycle management.
- **ACL management** — visual create / revoke ACL rules.
- **Cross-cluster topic data copy.**
- **Auth** — SASL (PLAIN / SCRAM / OAUTHBEARER), SSL / mTLS; Aiven & Confluent Cloud
  presets.
- **i18n** — English and 简体中文.
- **UX** — command palette (Cmd/Ctrl+K), global shortcuts, persistent settings.
- **Open-source scaffolding** — README (EN + zh-CN), LICENSE (MIT), Code of Conduct,
  Contributing guide, Security policy, issue & PR templates.
- **CI/CD** — GitHub Actions for lint/fmt/clippy/test on macOS / Ubuntu / Windows;
  automated multi-platform release builds (dmg / msi / exe / AppImage / deb / rpm);
  Dependabot security-only alerts; branch protection on `main`.

### Known Issues

- macOS bundle is not signed with an Apple Developer ID. First launch shows a
  "damaged" warning. Workaround: `xattr -cr "/Applications/Kafka Desktop Manager.app"`.
  Signed + notarized build planned for a future release.

[Unreleased]: https://github.com/halo-hx/Kafka-Desktop-Manager/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/halo-hx/Kafka-Desktop-Manager/releases/tag/v0.1.0
