// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { lastStorageFailure, recordStorageFailure, storageFailureText } from "./storageDiagnostics";
import { translateMessage } from "../i18n";

beforeEach(() => sessionStorage.clear());
describe("storage error diagnostics", () => {
  it("retains quota error details in this tab for later diagnosis", () => {
    const failure = recordStorageFailure(new DOMException("Quota exhausted", "QuotaExceededError"), "save");
    expect(failure.reason).toBe("quota");
    expect(lastStorageFailure()).toEqual(failure);
    expect(storageFailureText(failure, (key) => translateMessage("ru", key))).toContain("Хранилище браузера заполнено");
  });
  it("distinguishes blocked storage from unknown failures", () => {
    expect(recordStorageFailure(new DOMException("Denied", "SecurityError"), "save").reason).toBe("blocked");
    const failure = recordStorageFailure(new Error("Example failure"), "export");
    expect(failure.reason).toBe("unknown");
    expect(failure.message).toBe("Example failure");
  });
});
