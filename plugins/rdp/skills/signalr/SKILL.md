---
name: signalr
description: RDP rules for ASP.NET Core SignalR. Use when adding a SignalR hub or touching hub code.
---
# SignalR

Rules for projects using ASP.NET Core SignalR. Read when adding or changing a hub.

## Hubs are transient

A Hub is created per method invocation and disposed when it returns. Treat it as hard constraint.

- No state in a hub.
- Never register a hub as singleton.
- Don't inject `IHubContext<TSelf>` into the hub itself. If needed use an IHostedService