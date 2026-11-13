(function (global) {
  var SECRET_KEYS = {
    password: true,
    accountPassword: true,
    account_password: true,
    passwd: true,
    secret: true,
    credentials: true,
    loginPassword: true
  };
  var SECRET_LABEL = /^(密码|账号密码|登录密码|password|passwd)\s*[：:]/i;
  var LIBRARY_KEY = "ops-user-library";

  function stripRecord(record) {
    var publicRecord = {};
    var secrets = {};
    if (!record || typeof record !== "object") {
      return { publicRecord: record, secrets: secrets, passwordStored: false };
    }
    Object.keys(record).forEach(function (key) {
      var value = record[key];
      if (SECRET_KEYS[key]) {
        if (value != null && String(value).trim() !== "") secrets[key] = value;
        return;
      }
      publicRecord[key] = value;
    });
    return { publicRecord: publicRecord, secrets: secrets, passwordStored: Object.keys(secrets).length > 0 };
  }

  function scrubPlaintext(text) {
    if (!text) return "";
    return String(text)
      .split(/\r?\n/)
      .filter(function (line) { return !SECRET_LABEL.test(line.trim()); })
      .join("\n");
  }

  function envelope(kind, record, plaintext) {
    var stripped = stripRecord(record);
    return {
      kind: kind,
      collectedAt: (stripped.publicRecord && stripped.publicRecord.savedAt) || new Date().toISOString(),
      record: stripped.publicRecord,
      plaintext: scrubPlaintext(plaintext || "")
    };
  }

  function saveLocalPublic(kind, publicRecord) {
    try {
      if (typeof localStorage === "undefined") return;
      if (kind === "intake") {
        var all = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
        if (!Array.isArray(all)) all = [];
        all.unshift(publicRecord);
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(all.slice(0, 20)));
      }
      localStorage.setItem("ops-last-" + kind, JSON.stringify(publicRecord));
    } catch (err) { /* preview or storage blocked */ }
  }

  function persistResult(overrides) {
    return Object.assign({ ok: false, passwordStored: false, id: null, reason: "" }, overrides || {});
  }

  async function persist(kind, record, toPlaintext) {
    var stripped = stripRecord(record);
    var publicRecord = stripped.publicRecord || {};
    var text = typeof toPlaintext === "function" ? toPlaintext(publicRecord) : (toPlaintext || "");
    text = scrubPlaintext(text);

    try {
      if (typeof location === "undefined") {
        return persistResult({ reason: "no-window" });
      }
      if (new URLSearchParams(location.search).get("preview")) {
        return persistResult({ reason: "preview" });
      }
      if (location.protocol === "file:") {
        saveLocalPublic(kind, publicRecord);
        return persistResult({ reason: "no-local-service" });
      }
      var payloadRecord = Object.assign({}, publicRecord);
      if (stripped.secrets.password) payloadRecord.password = stripped.secrets.password;
      Object.keys(stripped.secrets).forEach(function (key) {
        if (key !== "password") payloadRecord[key] = stripped.secrets[key];
      });
      var response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: kind,
          collectedAt: publicRecord.savedAt || new Date().toISOString(),
          record: payloadRecord,
          plaintext: text
        })
      });
      if (!response.ok) {
        saveLocalPublic(kind, publicRecord);
        return persistResult({ reason: "http-" + response.status });
      }
      var saved = await response.json();
      saveLocalPublic(kind, saved.record || publicRecord);
      return persistResult({
        ok: true,
        passwordStored: !!saved.passwordStored,
        id: saved.id || null,
        reason: ""
      });
    } catch (err) {
      saveLocalPublic(kind, publicRecord);
      return persistResult({ reason: "no-local-service" });
    }
  }

  global.OpsCollect = {
    persist: persist,
    envelope: envelope,
    stripRecord: stripRecord,
    scrubPlaintext: scrubPlaintext
  };
})(typeof window !== "undefined" ? window : globalThis);
