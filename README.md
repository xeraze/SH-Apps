<div align="center">

# Sloboda Hospital — Applications Bot

A modular Discord bot project for the Sloboda Hospital community, focused on handling applications and related server workflows.

![SHApps1](assets/SH%20Apps%201.png)
![SHApps2](assets/SH%20Apps%202.png)

</div>

## Overview

**SH-Apps** is a TypeScript / Node.js Discord bot project organized around reusable source modules and project data.

The repository is structured as a standalone bot application with a dedicated source tree and TypeScript configuration.

## Project Structure

```text
SH-Apps/
├── src/
│   ├── index.ts        Bot entry point
│   ├── config.ts       Configuration (env)
│   ├── commands/       Slash commands
│   ├── components/     Forms, call-center UI, review menus
│   ├── listeners/      Event handlers (forms, call-center, dialogue)
│   ├── store/          Data layer (forms, submissions, call-center)
│   └── lib/            Helpers (notify, permissions, ...)
├── data/               Persistent data (forms JSON, submissions, tickets)
├── package.json
└── tsconfig.json
```

## Tech Stack

- TypeScript 5.7
- Node.js
- discord.js 14.16
- dotenv
- tsc

## Purpose

Application review workflow (job applications, complaints, appeals, ideas, bugs, questions) and call-center ticket system with operator channels, dialogue threads, and status management — all driven by JSON form definitions.

---

<div align="center">

Built by **xeraze** for **Sloboda Hospital**

</div>