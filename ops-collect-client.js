(function (global) {
  function envelope(kind, record, plaintext) {
    return {
      kind: kind,
      collectedAt: (record && record.savedAt) || new Date().toISOString(),
      record: record,
      plaintext: plaintext || ""
    };
  }

  async function persist(kind, record, toPlaintext) {
    try {
      if (typeof location === "undefined") return;
      if (location.protocol === "file:") return;
      if (new URLSearchParams(location.search).get("preview")) return;
      const text = typeof toPlaintext === "function" ? toPlaintext(record) : (toPlaintext || "");
      await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope(kind, record, text))
      });
    } catch (err) {
      /* file://, offline, or no local service: clipboard handoff still works */
    }
  }

  global.OpsCollect = { persist: persist, envelope: envelope };
})(typeof window !== "undefined" ? window : globalThis);
