# Clawset.app 🦞

**Clawset** is a powerful, secure desktop application built with **Tauri**, **React**, and **Rust** to manage and orchestrate **OpenClaw** environments using **Multipass**.

Managing secure local environments for agents can be complex. Clawset simplifies this by providing a user-friendly interface to launch, provision, and interact with Ubuntu-based virtual machines running OpenClaw.

> **Why OpenClaw needs a full OS like Ubuntu?**
> Because an Agent without a full-OS is just a chatbot.

---

## ✨ Key Features

- 🚀 **Multipass Orchestration**: Easily launch and manage Ubuntu LTS instances directly from the app.
- 🔧 **Automated Provisioning**: One-click installation of Node.js and the full OpenClaw stack within your VMs.
- 📺 **Embedded Dashboard**: Access your remote OpenClaw Gateway UI directly within the desktop application.
- 🧩 **AppHub Integration**: Start development servers (like `npm run dev`) inside the VM and preview them instantly in-app.
- 📊 **Resource Monitoring**: Real-time tracking of host resources (CPU, RAM, Disk) to help you choose the right instance sizes.
- 🎨 **Premium UI/UX**: Designed with **HeroUI** (NextUI) for a sleek, modern look with full dark mode support.

---

## 🛠️ Tech Stack

- **Backend**: Rust 🦀 + [Tauri v2](https://tauri.app/)
- **Frontend**: React 19, TypeScript, [Vite](https://vitejs.dev/)
- **Styling**: [HeroUI](https://heroui.com/) (NextUI), Tailwind CSS
- **Virtualization**: [Multipass](https://multipass.run/)

---

## 🗺️ Roadmap

- 🐋 **Docker Support**: Containerized agents for even faster and slimmer deployments.
- 📦 **Multi-Molt Support**: Future integration for **NanoBot**, **PicoClaw**, **ZeroClaw**, and **🦞 NullClaw**.
- **Cooperation Framework**: Combine multiple agents to create a more powerful system on top of your data.
- 🤖 **Additional AI Providers**: Support for Anthropic, Google Gemini, and local LLMs (Ollama) beyond OpenAI.

---

## 🚀 Getting Started

### Prerequisites

1.  **Rust**: [Install Rust](https://www.rust-lang.org/tools/install)
2.  **Node.js**: [Install Node.js](https://nodejs.org/)
3.  **Multipass**: [Install Multipass](https://multipass.run/install) (Ensure it's reachable via CLI)

### Installation & Development

Once you have the prerequisites ready:

```bash
# Clone the repository
git clone https://github.com/webdeb/clawset.app.git
cd clawset

# Install dependencies
npm install

# Start the development server (runs Tauri window + Vite dev server)
npm run tauri dev
```

### Production Build

To bundle the application for production:

```bash
npm run tauri build
```

The resulting binaries will be located in `src-tauri/target/release/bundle/`.

---

## 📂 Project Structure

- `src/`: React frontend with components, contexts, and hooks.
- `src-tauri/`: Rust backend, including command handlers and system integration.
- `src-tauri/src/multipass.rs`: Cross-platform Multipass binary resolution.
- `src-tauri/src/instance_control.rs`: Logic for controlling VM states and OpenClaw commands.
- `setup-instance/`: Shell scripts and configurations used for VM provisioning.

---

## 🤝 Contribution

Contributions are welcome! If you find a bug or have a feature request, please open an issue.

## 📄 License

[MIT License](LICENSE) - © 2026 @webdeb
