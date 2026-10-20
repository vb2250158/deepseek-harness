# Agent Note: Sidebar Browser extension bridge

Status: implemented

English | [中文](2026-10-08-sidebar-browser-bridge.zh.md)

## Problem

Extension consumers need the selected Browser tab without creating a second renderer or owning its navigation state.

## Decision

The official Browser renderer owns tab navigation and presentation. `ctx.sidebarBrowser` provides Session/tab-scoped access to its mounted controllers and optional iframe message leases, so an extension consumer can reuse that renderer instead of maintaining another browser panel. This supplements the [Sidebar Browser decision](2026-09-16-sidebar-browser.md); its navigation and persistence decisions remain active.

## Consequences

The service does not read website content, register tools, or grant extension authorization. The consumer verifies the selected Session and tab, obtains extension authorization, records results through its tool pipeline, and handles cancellation. A physical iframe lease expires on replacement, detachment, or hiding. Desktop navigation remains available without an iframe lease. Controller registration is withdrawn during plugin disposal; stale release calls cannot withdraw a replacement registration.

## Alternatives considered

A separate browser panel duplicates navigation, persistence and disposal. Sharing the mounted official controllers retains one owner while exposing no website content.

## Validation

Package tests cover Session isolation, official persistence writes, invalid addresses, replaced and hidden leases, registration disposal, and existing Web/Desktop navigation. The downstream consumer additionally checks archive migration and authenticated extension operations on synthetic cross-origin pages.
