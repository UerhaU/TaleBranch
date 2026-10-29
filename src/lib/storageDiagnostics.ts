export interface StorageFailure {
  time: string;
  operation: "save" | "switch" | "purge" | "delete" | "export" | "restore";
  reason: "quota" | "blocked" | "unknown";
  name: string;
  message: string;
}
const KEY = "dynasty-chronicles:last-storage-error";

export function recordStorageFailure(error: unknown, operation: StorageFailure["operation"]): StorageFailure {
  const details =
    error && typeof error === "object" ? (error as { name?: string; message?: string; code?: number }) : {};
  const name = String(details.name ?? "Error");
  const failure: StorageFailure = {
    time: new Date().toISOString(),
    operation,
    name,
    message: String(details.message ?? error ?? "Unknown error").slice(0, 1000),
    reason:
      ["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"].includes(name) ||
      details.code === 22 ||
      details.code === 1014
        ? "quota"
        : ["SecurityError", "NotAllowedError"].includes(name)
          ? "blocked"
          : "unknown",
  };
  // Session storage has a separate quota and survives a page reload in this tab.
  // Keep only technical details, never profile contents or photographs.
  try {
    sessionStorage.setItem(KEY, JSON.stringify(failure));
  } catch {
    /* The on-screen error still works. */
  }
  return failure;
}

export function lastStorageFailure(): StorageFailure | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    return value &&
      typeof value.time === "string" &&
      typeof value.name === "string" &&
      typeof value.message === "string"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export function storageFailureText(failure: StorageFailure, translate: (key: string) => string): string {
  return translate(
    failure.reason === "quota"
      ? "storageQuotaError"
      : failure.reason === "blocked"
        ? "storageBlockedError"
        : "storageUnknownError",
  );
}
