import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readFileMock, mkdirMock, writeFileMock, chmodMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
  mkdirMock: vi.fn(),
  writeFileMock: vi.fn(),
  chmodMock: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: readFileMock,
    mkdir: mkdirMock,
    writeFile: writeFileMock,
    chmod: chmodMock,
  },
}));

const ORIGINAL_ENV = process.env;

async function importStorage() {
  vi.resetModules();
  return import("../config/storage.js");
}

describe("config storage", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.OPSTALK_REGION;
    delete process.env.OPSTALK_AGENT_SPACE_ID;
    delete process.env.OPSTALK_USER_ID;
    readFileMock.mockReset();
    mkdirMock.mockReset();
    writeFileMock.mockReset();
    chmodMock.mockReset();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns defaults when config file is missing", async () => {
    process.env.AWS_REGION = "us-west-2";
    process.env.OPSTALK_AGENT_SPACE_ID = "space-from-env";
    process.env.OPSTALK_USER_ID = "user-from-env";
    readFileMock.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));

    const { loadConfig } = await importStorage();
    await expect(loadConfig()).resolves.toEqual({
      region: "us-west-2",
      agentSpaceId: "space-from-env",
      userId: "user-from-env",
      userType: "IAM",
      ui: {
        thinkingMode: "off",
      },
    });
  });

  it("merges partial file config onto defaults", async () => {
    process.env.AWS_DEFAULT_REGION = "eu-west-1";
    process.env.USER = "shell-user";
    readFileMock.mockResolvedValue(
      JSON.stringify({
        agentSpaceId: "space-123",
        ui: {
          thinkingMode: "on",
        },
      }),
    );

    const { loadConfig } = await importStorage();
    await expect(loadConfig()).resolves.toEqual({
      region: "eu-west-1",
      agentSpaceId: "space-123",
      userId: "shell-user",
      userType: "IAM",
      ui: {
        thinkingMode: "on",
      },
    });
  });

  it("mergeConfig ignores undefined overrides and preserves nested defaults", async () => {
    const { mergeConfig } = await importStorage();

    expect(
      mergeConfig({
        region: "ap-southeast-2",
        agentSpaceId: undefined,
        ui: {} as { thinkingMode: "off" | "on" },
      }),
    ).toMatchObject({
      region: "ap-southeast-2",
      userType: "IAM",
      ui: {
        thinkingMode: "off",
      },
    });
  });

  it("saveConfig writes config with restrictive permissions", async () => {
    const { saveConfig } = await importStorage();

    await saveConfig({
      region: "us-east-1",
      agentSpaceId: "space-123",
      userId: "alice",
      userType: "IAM",
      ui: {
        thinkingMode: "off",
      },
    });

    expect(mkdirMock).toHaveBeenCalledWith(expect.stringContaining("opstalk"), {
      recursive: true,
      mode: 0o700,
    });
    expect(writeFileMock).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      expect.stringContaining('"agentSpaceId": "space-123"'),
      { mode: 0o600 },
    );
    expect(chmodMock).toHaveBeenCalledWith(expect.stringContaining("config.json"), 0o600);
  });
});
