// @vitest-environment happy-dom

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import {
  R3Button,
  R3Card,
  R3EmptyState,
  R3IconButton,
  R3InlineNotice,
  R3Input,
  R3Modal,
  R3PageHeader,
  R3SearchField,
  R3Select,
  R3Skeleton,
  R3Spinner,
  R3StatusBadge,
  R3Tabs,
  R3Tag,
  R3Textarea,
  R3Tooltip,
} from "../src/renderer/components/ui";

const componentRoot = resolve("apps/desktop/src/renderer/components/ui");

const baseComponents = [
  "R3Button.vue",
  "R3Card.vue",
  "R3EmptyState.vue",
  "R3IconButton.vue",
  "R3InlineNotice.vue",
  "R3Input.vue",
  "R3Modal.vue",
  "R3PageHeader.vue",
  "R3SearchField.vue",
  "R3Select.vue",
  "R3Skeleton.vue",
  "R3Spinner.vue",
  "R3StatusBadge.vue",
  "R3Tabs.vue",
  "R3Tag.vue",
  "R3Textarea.vue",
  "R3Tooltip.vue",
] as const;

describe("DFE-1A/1B base UI component foundation", () => {
  it("mounts representative .vue components and verifies runtime props and state", async () => {
    const button = mount(R3Button, {
      props: { variant: "primary", loading: true },
      slots: { default: "Run" },
    });
    expect(button.find("button").attributes("aria-busy")).toBe("true");
    expect(button.find("button").attributes("disabled")).toBeDefined();
    expect(button.text()).toContain("Run");

    const icon = mount(R3IconButton, {
      props: { label: "Refresh", disabled: true },
      slots: { default: "R" },
    });
    expect(icon.find("button").attributes("aria-label")).toBe("Refresh");
    expect(icon.find("button").attributes("title")).toBe("Refresh");
    expect(icon.find("button").attributes("disabled")).toBeDefined();

    const input = mount(R3Input, {
      props: { modelValue: "old", label: "Name", error: "Required" },
    });
    expect(input.text()).toContain("Name");
    expect(input.text()).toContain("Required");
    await input.find("input").setValue("new");
    expect(input.emitted("update:modelValue")?.[0]).toEqual(["new"]);

    const textarea = mount(R3Textarea, {
      props: { modelValue: "old", label: "Notes", rows: 3 },
    });
    expect(textarea.find("textarea").attributes("rows")).toBe("3");
    await textarea.find("textarea").setValue("updated");
    expect(textarea.emitted("update:modelValue")?.[0]).toEqual(["updated"]);
  });

  it("mounts selection, navigation and feedback components with events", async () => {
    const search = mount(R3SearchField, {
      props: { modelValue: "", placeholder: "Search tasks", accessibleLabel: "Search task list" },
    });
    expect(search.find("input").attributes("aria-label")).toBe("Search task list");
    await search.find("input").setValue("task");
    expect(search.emitted("update:modelValue")?.[0]).toEqual(["task"]);

    const select = mount(R3Select, {
      props: {
        modelValue: "normal",
        label: "Mode",
        options: [
          { label: "Normal", value: "normal" },
          { label: "Review", value: "review" },
        ],
      },
    });
    await select.find("select").setValue("review");
    expect(select.emitted("update:modelValue")?.[0]).toEqual(["review"]);

    const tabs = mount(R3Tabs, {
      props: {
        modelValue: "workbench",
        tabs: [
          { label: "Workbench", value: "workbench" },
          { label: "Tasks", value: "tasks" },
        ],
      },
    });
    await tabs.findAll("button")[1]?.trigger("click");
    expect(tabs.emitted("update:modelValue")?.[0]).toEqual(["tasks"]);

    const modal = mount(R3Modal, {
      props: { open: true, title: "Confirm" },
      slots: { default: "Body" },
      attachTo: document.body,
    });
    expect(document.body.textContent).toContain("Confirm");
    const closeButton = document.body.querySelector<HTMLButtonElement>(".r3-modal__close");
    expect(closeButton).not.toBeNull();
    closeButton?.click();
    await modal.vm.$nextTick();
    expect(modal.emitted("close")).toHaveLength(1);
    modal.unmount();

    const tooltip = mount(R3Tooltip, {
      props: { text: "Refresh workspace" },
      slots: { default: "<button>Refresh</button>" },
    });
    expect(tooltip.text()).toContain("Refresh workspace");
    expect(tooltip.find("[role='tooltip']").text()).toBe("Refresh workspace");
  });

  it("mounts structural and state components without Desktop API dependencies", () => {
    expect(mount(R3Card, {
      props: { title: "Panel" },
      slots: { default: "Body" },
    }).text()).toContain("Panel");
    expect(mount(R3EmptyState, {
      props: { title: "No results", description: "Try another filter.", icon: "A" },
    }).text()).toContain("Try another filter.");
    expect(mount(R3InlineNotice, {
      props: { title: "Notice", tone: "warning" },
      slots: { default: "Check permissions." },
    }).text()).toContain("Check permissions.");
    expect(mount(R3PageHeader, {
      props: { title: "Tasks", eyebrow: "Workspace", description: "Track work." },
    }).text()).toContain("Track work.");
    expect(mount(R3Tag, {
      props: { tone: "success" },
      slots: { default: "ready" },
    }).text()).toContain("ready");
    expect(mount(R3StatusBadge, {
      props: { tone: "success" },
      slots: { default: "ready" },
    }).text()).toContain("ready");
    expect(mount(R3Skeleton).find(".r3-skeleton").exists()).toBe(true);
    expect(mount(R3Spinner).find("[role='status']").exists()).toBe(true);
  });

  it("defines every DFE base component as typed SFC source", async () => {
    for (const fileName of baseComponents) {
      const source = await readFile(resolve(componentRoot, fileName), "utf8");
      expect(source, `${fileName} missing template`).toContain("<template>");
      expect(source, `${fileName} missing typed setup`).toContain('<script setup lang="ts">');
      expect(source, `${fileName} bypasses tokens`).toContain("var(--r3-");
    }
  });

  it("keeps base components independent from Desktop runtime authority", async () => {
    for (const fileName of baseComponents) {
      const source = await readFile(resolve(componentRoot, fileName), "utf8");
      for (const forbidden of [
        "window.robothreeDesktop",
        "ipcRenderer",
        "contextBridge",
        "workspaceRoot",
        "rootRealPath",
        "selectionHandle",
        "innerHTML",
        "fetch(",
      ]) {
        expect(source, `${fileName} contains ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("exports all base components through the UI barrel", async () => {
    const source = await readFile(resolve(componentRoot, "index.ts"), "utf8");
    for (const fileName of baseComponents) {
      const exportName = fileName.replace(".vue", "");
      expect(source).toContain(`default as ${exportName}`);
      expect(source).toContain(`./${fileName}`);
    }
  });
});
