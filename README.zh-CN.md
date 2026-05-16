# Kafka Desktop Manager

<p align="center">
  <img src="src-tauri/icons/kafka_logo.svg" alt="Kafka Desktop Manager" width="128" />
</p>

<p align="center">
  <b>现代化、跨平台的 Apache Kafka 桌面管理工具。</b><br/>
  基于 <a href="https://tauri.app">Tauri 2</a> + React 18 + Rust 构建。
</p>

[English](./README.md) | 简体中文

---

## ✨ 核心特性

- **多集群管理** — 同时连接和管理多个 Kafka 集群
- **Topic 操作** — 创建 / 删除 / 查看分区和配置
- **消息浏览** — 消费、过滤、搜索、发送、导入、导出，支持 JSON/Avro/Protobuf
- **消费组管理** — 查看 Lag、重置 Offset、管理组状态
- **Schema Registry** — 浏览 / 注册 / 演进 Schema
- **Kafka Connect** — 连接器和任务的完整生命周期管理
- **ACL 管理** — 可视化创建与撤销 ACL
- **跨集群复制** — 几步即可完成 Topic 数据迁移
- **SASL / SSL** — 支持 PLAIN、SCRAM、OAUTHBEARER、mTLS，内置 Aiven / Confluent Cloud 预设
- **国际化** — 内置中英文
- **轻量高效** — Rust 原生内核，包体积小，占用低

## 📸 截图

<p align="center">
  <img src="docs/screenshots/cluster-overview.png" alt="集群概览" width="900" />
  <br/>
  <sub><em>集群概览 — Broker、Topic、分区、消费组与配置一目了然。</em></sub>
</p>

## 📦 安装

在 [Releases](https://github.com/halo-hx/Kafka-Desktop-Manager/releases) 下载对应平台的安装包：

- macOS (Intel / Apple Silicon) — `.dmg`
- Windows — `.msi` / `.exe`
- Linux — `.AppImage` / `.deb` / `.rpm`

> **macOS 首次打开提示安全警告？** 应用已进行 ad-hoc 签名，但未经 Apple 公证，首次打开时 macOS Gatekeeper 会弹出安全提示。请按以下方式打开：
>
> **方法一（推荐）：** 右键点击应用，选择 **打开**，在弹出的对话框中点击 **打开**。仅需操作一次。
>
> **方法二：** 前往 **系统设置 > 隐私与安全性**，向下滚动找到被阻止的应用提示，点击 **仍要打开**。
>
> **方法三（终端）：** 如果上述方法无效，在终端执行：
> ```bash
> xattr -cr "/Applications/Kafka Desktop Manager.app"
> ```

### 从源码构建

环境要求：Node.js ≥ 18、pnpm ≥ 8、Rust stable、以及 [Tauri 平台依赖](https://tauri.app/start/prerequisites/)。

```bash
git clone https://github.com/halo-hx/Kafka-Desktop-Manager.git
cd Kafka-Desktop-Manager
pnpm install
pnpm tauri dev
pnpm tauri build
```

## 🤝 参与贡献

欢迎贡献！请先阅读 [贡献指南](./CONTRIBUTING.md) 与 [行为准则](./CODE_OF_CONDUCT.md)。

## 📄 开源协议

本项目采用 [MIT License](./LICENSE)。
