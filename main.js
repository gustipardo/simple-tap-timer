const { Plugin, Notice, TFile } = require("obsidian");

class SimpleTapTimerPlugin extends Plugin {
  async onload() {
    const saved = await this.loadData();
    this.state = {
      timers: {},
      ...(saved || {}),
    };

    this.saveTimeout = null;

    this.addCommand({
      id: "insert-tap-timer-block",
      name: "Insert simple tap timer block",
      editorCallback: (editor) => {
        const timerId = this.createTimerId();
        editor.replaceSelection(
          `\`\`\`tap-timer\ntitle: New timer\nid: ${timerId}\nindependent: false\n\`\`\`\n`
        );
      },
    });

    this.registerMarkdownCodeBlockProcessor("tap-timer", (source, el, ctx) => {
      this.renderTimer(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor("tap-timer-report", (source, el, ctx) => {
      this.renderReportButton(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor("tap-timer-reset-all", (source, el, ctx) => {
      this.renderResetAllButton(source, el, ctx);
    });

    this.registerMarkdownCodeBlockProcessor("tap-timer-save-session", (source, el, ctx) => {
      this.renderSaveSessionButton(source, el, ctx);
    });
  }

  async onunload() {
    if (this.saveTimeout) {
      window.clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.saveData(this.state);
  }

  createTimerId() {
    const base = Date.now().toString(36);
    const suffix = Math.random().toString(36).slice(2, 7);
    return `timer-${base}-${suffix}`;
  }

  getTimerId(source, ctx) {
    const parsed = this.parseConfig(source);
    if (parsed.id) return parsed.id;

    const section = ctx.getSectionInfo ? ctx.getSectionInfo() : null;
    const lineStart = section && typeof section.lineStart === "number" ? section.lineStart : 0;
    return `${ctx.sourcePath}:${lineStart}`;
  }

  parseConfig(source) {
    const config = {
      id: "",
      title: "",
      independent: false,
      startLabel: "Start",
      stopLabel: "Stop",
      errorNotice: "Could not update timer.",
    };

    const lines = source.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const idMatch = line.match(/^id\s*:\s*(.+)$/i);
      if (idMatch && idMatch[1].trim()) {
        config.id = idMatch[1].trim();
      }

      const titleMatch = line.match(/^title\s*:\s*(.+)$/i);
      if (titleMatch && titleMatch[1].trim()) {
        config.title = titleMatch[1].trim();
      }

      const independentMatch = line.match(/^independent\s*:\s*(.+)$/i);
      if (independentMatch) {
        config.independent = this.parseBoolean(independentMatch[1]);
      }

      const startLabelMatch = line.match(/^startLabel\s*:\s*(.+)$/i);
      if (startLabelMatch && startLabelMatch[1].trim()) {
        config.startLabel = startLabelMatch[1].trim();
      }

      const stopLabelMatch = line.match(/^stopLabel\s*:\s*(.+)$/i);
      if (stopLabelMatch && stopLabelMatch[1].trim()) {
        config.stopLabel = stopLabelMatch[1].trim();
      }

      const errorNoticeMatch = line.match(/^errorNotice\s*:\s*(.+)$/i);
      if (errorNoticeMatch && errorNoticeMatch[1].trim()) {
        config.errorNotice = errorNoticeMatch[1].trim();
      }
    }

    return config;
  }

  parseBoolean(rawValue) {
    const normalized = String(rawValue || "").trim().toLowerCase();
    return ["true", "1", "yes", "y", "on"].includes(normalized);
  }

  applyTemplate(template, values) {
    return String(template || "").replace(/\{(\w+)\}/g, (_, key) => {
      return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`;
    });
  }

  ensureTimer(id) {
    if (!this.state.timers[id]) {
      this.state.timers[id] = {
        elapsedMs: 0,
        isRunning: false,
        startedAt: null,
      };
      this.scheduleSave();
    }
    return this.state.timers[id];
  }

  getElapsedMs(timer) {
    if (!timer.isRunning || !timer.startedAt) return timer.elapsedMs;
    return timer.elapsedMs + (Date.now() - timer.startedAt);
  }

  startTimer(id) {
    const timer = this.ensureTimer(id);
    if (timer.isRunning) return;
    timer.isRunning = true;
    timer.startedAt = Date.now();
  }

  pauseTimer(id) {
    const timer = this.ensureTimer(id);
    if (!timer.isRunning) return false;
    timer.elapsedMs = this.getElapsedMs(timer);
    timer.isRunning = false;
    timer.startedAt = null;
    return true;
  }

  async pauseOtherStandardTimersInNote(notePath, currentTimerId) {
    if (!notePath) return false;
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return false;

    const noteContent = await this.app.vault.cachedRead(file);
    const timers = this.collectTimersFromNote(noteContent, notePath);
    let changed = false;

    for (const timerMeta of timers) {
      if (timerMeta.id === currentTimerId) continue;
      if (timerMeta.independent) continue;
      changed = this.pauseTimer(timerMeta.id) || changed;
    }

    return changed;
  }

  async toggleTimer(id, notePath, independent = false) {
    const timer = this.ensureTimer(id);

    if (timer.isRunning) {
      this.pauseTimer(id);
    } else {
      if (!independent) {
        await this.pauseOtherStandardTimersInNote(notePath, id);
      }
      this.startTimer(id);
    }

    this.scheduleSave();
  }

  scheduleSave() {
    if (this.saveTimeout) {
      window.clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(() => {
      this.saveData(this.state);
      this.saveTimeout = null;
    }, 300);
  }

  formatDuration(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  escapeTableCell(value) {
    return String(value || "").replaceAll("|", "\\|").trim();
  }

  getTimerSnapshotMs(id) {
    const timer = this.state.timers[id];
    if (!timer) return 0;
    return this.getElapsedMs(timer);
  }

  collectTimersFromNote(noteContent, notePath) {
    const lines = noteContent.split(/\r?\n/);
    const collected = [];
    let inBlock = false;
    let blockStartLine = 0;
    let blockLines = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();

      if (!inBlock && /^```tap-timer\s*$/i.test(trimmed)) {
        inBlock = true;
        blockStartLine = i;
        blockLines = [];
        continue;
      }

      if (inBlock && /^```/.test(trimmed)) {
        const config = this.parseConfig(blockLines.join("\n"));
        const id = config.id || `${notePath}:${blockStartLine}`;
        collected.push({
          id,
          title: config.title || "",
          independent: !!config.independent,
        });
        inBlock = false;
        blockLines = [];
        continue;
      }

      if (inBlock) {
        blockLines.push(lines[i]);
      }
    }

    const unique = new Map();
    for (const item of collected) {
      if (!unique.has(item.id)) {
        unique.set(item.id, item);
        continue;
      }

      if (!unique.get(item.id).title && item.title) {
        unique.set(item.id, item);
      }
    }

    return Array.from(unique.values());
  }

  buildReportTable(notePath, timers, config) {
    const rows = [
      `| ${this.escapeTableCell(config.idHeader)} | ${this.escapeTableCell(config.titleHeader)} | ${this.escapeTableCell(config.valueHeader)} |`,
      `| --- | --- | --- |`,
    ];

    for (const timer of timers) {
      const elapsedText = this.formatDuration(this.getTimerSnapshotMs(timer.id));
      rows.push(
        `| ${this.escapeTableCell(timer.id)} | ${this.escapeTableCell(timer.title)} | ${elapsedText} |`
      );
    }

    if (timers.length === 0) {
      rows.push(`| ${this.escapeTableCell(config.emptyLabel)} |  | 00:00:00 |`);
    }

    const now = new Date().toLocaleString();
    return [
      `## ${config.reportTitle}`,
      ``,
      `${config.noteLabel}: ${notePath}`,
      `${config.updatedLabel}: ${now}`,
      ``,
      ...rows,
    ].join("\n");
  }

  async upsertReportInNote(notePath, sectionInfo, reportContent) {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${notePath}`);
    }

    const startMarker = "<!-- tap-timer-report:start -->";
    const endMarker = "<!-- tap-timer-report:end -->";
    const content = await this.app.vault.cachedRead(file);
    const lines = content.split(/\r?\n/);

    const startIdx = lines.indexOf(startMarker);
    const endIdx = lines.indexOf(endMarker);
    const wrappedReport = [startMarker, reportContent, endMarker];

    if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
      lines.splice(startIdx, endIdx - startIdx + 1, ...wrappedReport);
    } else {
      const lineEnd =
        sectionInfo && typeof sectionInfo.lineEnd === "number" ? sectionInfo.lineEnd : lines.length - 1;
      const insertAt = Math.min(lines.length, lineEnd + 1);
      const block = ["", ...wrappedReport, ""];
      lines.splice(insertAt, 0, ...block);
    }

    await this.app.vault.modify(file, lines.join("\n"));
  }

  async generateReportForNote(notePath, sectionInfo, config) {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${notePath}`);
    }

    const noteContent = await this.app.vault.cachedRead(file);
    const timers = this.collectTimersFromNote(noteContent, notePath);
    const report = this.buildReportTable(notePath, timers, config);
    await this.upsertReportInNote(notePath, sectionInfo, report);
  }

  async resetAllTimersForNote(notePath) {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${notePath}`);
    }

    const noteContent = await this.app.vault.cachedRead(file);
    const timers = this.collectTimersFromNote(noteContent, notePath);

    for (const timer of timers) {
      const current = this.ensureTimer(timer.id);
      current.elapsedMs = 0;
      current.isRunning = false;
      current.startedAt = null;
    }

    this.scheduleSave();
    return timers.length;
  }

  getWorkoutNameFromPath(notePath) {
    const fileName = String(notePath || "").split("/").pop() || "Workout";
    return fileName.replace(/\.md$/i, "").trim() || "Workout";
  }

  buildLogPath(folder, fileName) {
    const cleanFolder = String(folder || "").trim().replace(/\/+$/, "");
    const cleanFile = String(fileName || "Sessions.md").trim().replace(/^\/+/, "");
    return cleanFolder ? `${cleanFolder}/${cleanFile}` : cleanFile;
  }

  parseSaveSessionConfig(source, notePath) {
    const config = {
      button: "Save session",
      busyLabel: "Saving...",
      confirm: "This will save this session to the session log. Continue?",
      missingNoteNotice: "Could not identify the note to save the session.",
      successNotice: "Session saved to {log}. Total: {total}.",
      errorNotice: "Could not save the session.",
      workout: this.getWorkoutNameFromPath(notePath),
      folder: "Logs",
      file: "Sessions.md",
      log: "",
      historyTitle: "# Timer Sessions History",
      sessionPrefix: "Session",
      dateLabel: "Date",
      dateIsoLabel: "Date ISO",
      workoutLabel: "Workout",
      noteLabel: "Note",
      totalTimeLabel: "Total time",
      sectionHeader: "Section",
      idHeader: "ID",
      timeHeader: "Time",
      emptySectionLabel: "(no timers)",
    };

    const lines = source.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();

      const buttonMatch = line.match(/^button\s*:\s*(.+)$/i);
      if (buttonMatch && buttonMatch[1].trim()) {
        config.button = buttonMatch[1].trim();
      }

      const busyLabelMatch = line.match(/^busyLabel\s*:\s*(.+)$/i);
      if (busyLabelMatch && busyLabelMatch[1].trim()) {
        config.busyLabel = busyLabelMatch[1].trim();
      }

      const confirmMatch = line.match(/^confirm\s*:\s*(.+)$/i);
      if (confirmMatch && confirmMatch[1].trim()) {
        config.confirm = confirmMatch[1].trim();
      }

      const missingNoteMatch = line.match(/^missingNoteNotice\s*:\s*(.+)$/i);
      if (missingNoteMatch && missingNoteMatch[1].trim()) {
        config.missingNoteNotice = missingNoteMatch[1].trim();
      }

      const successNoticeMatch = line.match(/^successNotice\s*:\s*(.+)$/i);
      if (successNoticeMatch && successNoticeMatch[1].trim()) {
        config.successNotice = successNoticeMatch[1].trim();
      }

      const errorNoticeMatch = line.match(/^errorNotice\s*:\s*(.+)$/i);
      if (errorNoticeMatch && errorNoticeMatch[1].trim()) {
        config.errorNotice = errorNoticeMatch[1].trim();
      }

      const workoutMatch = line.match(/^workout\s*:\s*(.+)$/i);
      if (workoutMatch && workoutMatch[1].trim()) {
        config.workout = workoutMatch[1].trim();
      }

      const folderMatch = line.match(/^folder\s*:\s*(.+)$/i);
      if (folderMatch && folderMatch[1].trim()) {
        config.folder = folderMatch[1].trim();
      }

      const fileMatch = line.match(/^file\s*:\s*(.+)$/i);
      if (fileMatch && fileMatch[1].trim()) {
        config.file = fileMatch[1].trim();
      }

      const logMatch = line.match(/^log\s*:\s*(.+)$/i);
      if (logMatch && logMatch[1].trim()) {
        config.log = logMatch[1].trim();
      }

      const historyTitleMatch = line.match(/^historyTitle\s*:\s*(.+)$/i);
      if (historyTitleMatch && historyTitleMatch[1].trim()) {
        config.historyTitle = historyTitleMatch[1].trim();
      }

      const sessionPrefixMatch = line.match(/^sessionPrefix\s*:\s*(.+)$/i);
      if (sessionPrefixMatch && sessionPrefixMatch[1].trim()) {
        config.sessionPrefix = sessionPrefixMatch[1].trim();
      }

      const dateLabelMatch = line.match(/^dateLabel\s*:\s*(.+)$/i);
      if (dateLabelMatch && dateLabelMatch[1].trim()) {
        config.dateLabel = dateLabelMatch[1].trim();
      }

      const dateIsoLabelMatch = line.match(/^dateIsoLabel\s*:\s*(.+)$/i);
      if (dateIsoLabelMatch && dateIsoLabelMatch[1].trim()) {
        config.dateIsoLabel = dateIsoLabelMatch[1].trim();
      }

      const workoutLabelMatch = line.match(/^workoutLabel\s*:\s*(.+)$/i);
      if (workoutLabelMatch && workoutLabelMatch[1].trim()) {
        config.workoutLabel = workoutLabelMatch[1].trim();
      }

      const noteLabelMatch = line.match(/^noteLabel\s*:\s*(.+)$/i);
      if (noteLabelMatch && noteLabelMatch[1].trim()) {
        config.noteLabel = noteLabelMatch[1].trim();
      }

      const totalTimeLabelMatch = line.match(/^totalTimeLabel\s*:\s*(.+)$/i);
      if (totalTimeLabelMatch && totalTimeLabelMatch[1].trim()) {
        config.totalTimeLabel = totalTimeLabelMatch[1].trim();
      }

      const sectionHeaderMatch = line.match(/^sectionHeader\s*:\s*(.+)$/i);
      if (sectionHeaderMatch && sectionHeaderMatch[1].trim()) {
        config.sectionHeader = sectionHeaderMatch[1].trim();
      }

      const idHeaderMatch = line.match(/^idHeader\s*:\s*(.+)$/i);
      if (idHeaderMatch && idHeaderMatch[1].trim()) {
        config.idHeader = idHeaderMatch[1].trim();
      }

      const timeHeaderMatch = line.match(/^timeHeader\s*:\s*(.+)$/i);
      if (timeHeaderMatch && timeHeaderMatch[1].trim()) {
        config.timeHeader = timeHeaderMatch[1].trim();
      }

      const emptySectionLabelMatch = line.match(/^emptySectionLabel\s*:\s*(.+)$/i);
      if (emptySectionLabelMatch && emptySectionLabelMatch[1].trim()) {
        config.emptySectionLabel = emptySectionLabelMatch[1].trim();
      }
    }

    config.logPath = config.log || this.buildLogPath(config.folder, config.file);
    return config;
  }

  buildSessionData(notePath, workout, timers) {
    const createdAt = new Date();
    const details = timers.map((timer) => {
      const elapsedMs = this.getTimerSnapshotMs(timer.id);
      return {
        id: timer.id,
        section: timer.title || timer.id,
        elapsedMs,
        elapsedText: this.formatDuration(elapsedMs),
      };
    });
    const totalMs = details.reduce((acc, item) => acc + item.elapsedMs, 0);

    return {
      sessionId: `${createdAt.toISOString()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAtIso: createdAt.toISOString(),
      createdAtLocal: createdAt.toLocaleString(),
      notePath,
      workout,
      details,
      totalMs,
      totalText: this.formatDuration(totalMs),
    };
  }

  buildSessionLogMarkdown(session, config) {
    const lines = [
      `## ${config.sessionPrefix} ${session.sessionId}`,
      `- ${config.dateLabel}: ${session.createdAtLocal}`,
      `- ${config.dateIsoLabel}: ${session.createdAtIso}`,
      `- ${config.workoutLabel}: ${session.workout}`,
      `- ${config.noteLabel}: ${session.notePath}`,
      `- ${config.totalTimeLabel}: ${session.totalText}`,
      ``,
      `| ${this.escapeTableCell(config.sectionHeader)} | ${this.escapeTableCell(config.idHeader)} | ${this.escapeTableCell(config.timeHeader)} |`,
      `| --- | --- | --- |`,
    ];

    if (session.details.length === 0) {
      lines.push(`| ${this.escapeTableCell(config.emptySectionLabel)} |  | 00:00:00 |`);
    } else {
      for (const item of session.details) {
        lines.push(
          `| ${this.escapeTableCell(item.section)} | ${this.escapeTableCell(item.id)} | ${item.elapsedText} |`
        );
      }
    }

    lines.push(``, `---`, ``);
    return lines.join("\n");
  }

  async ensureFoldersForFile(filePath) {
    const parts = String(filePath || "").split("/").filter(Boolean);
    if (parts.length <= 1) return;

    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  async appendSessionToLog(logPath, sessionMarkdown, historyTitle) {
    await this.ensureFoldersForFile(logPath);

    const existing = this.app.vault.getAbstractFileByPath(logPath);
    if (!(existing instanceof TFile)) {
      const initial = [historyTitle, "", sessionMarkdown].join("\n");
      await this.app.vault.create(logPath, initial);
      return;
    }

    const content = await this.app.vault.cachedRead(existing);
    const separator = content.endsWith("\n") ? "" : "\n";
    await this.app.vault.modify(existing, `${content}${separator}\n${sessionMarkdown}`);
  }

  async saveSessionForNote(notePath, config) {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      throw new Error(`Note not found: ${notePath}`);
    }

    const noteContent = await this.app.vault.cachedRead(file);
    const timers = this.collectTimersFromNote(noteContent, notePath);
    const session = this.buildSessionData(notePath, config.workout, timers);
    const sessionMarkdown = this.buildSessionLogMarkdown(session, config);
    await this.appendSessionToLog(config.logPath, sessionMarkdown, config.historyTitle);
    return session;
  }

  parseReportConfig(source) {
    const config = {
      button: "Generate timer table",
      busyLabel: "Generating...",
      missingNoteNotice: "Could not identify the note to generate the table.",
      successNotice: "Timer table generated/updated in the note.",
      errorNotice: "Could not generate timer table.",
      reportTitle: "Timer Summary",
      noteLabel: "Note",
      updatedLabel: "Updated",
      idHeader: "ID",
      titleHeader: "Title",
      valueHeader: "Final Value",
      emptyLabel: "(no timers)",
    };

    const lines = source.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();

      const buttonMatch = line.match(/^button\s*:\s*(.+)$/i);
      if (buttonMatch && buttonMatch[1].trim()) {
        config.button = buttonMatch[1].trim();
      }

      const busyLabelMatch = line.match(/^busyLabel\s*:\s*(.+)$/i);
      if (busyLabelMatch && busyLabelMatch[1].trim()) {
        config.busyLabel = busyLabelMatch[1].trim();
      }

      const missingNoteMatch = line.match(/^missingNoteNotice\s*:\s*(.+)$/i);
      if (missingNoteMatch && missingNoteMatch[1].trim()) {
        config.missingNoteNotice = missingNoteMatch[1].trim();
      }

      const successNoticeMatch = line.match(/^successNotice\s*:\s*(.+)$/i);
      if (successNoticeMatch && successNoticeMatch[1].trim()) {
        config.successNotice = successNoticeMatch[1].trim();
      }

      const errorNoticeMatch = line.match(/^errorNotice\s*:\s*(.+)$/i);
      if (errorNoticeMatch && errorNoticeMatch[1].trim()) {
        config.errorNotice = errorNoticeMatch[1].trim();
      }

      const reportTitleMatch = line.match(/^reportTitle\s*:\s*(.+)$/i);
      if (reportTitleMatch && reportTitleMatch[1].trim()) {
        config.reportTitle = reportTitleMatch[1].trim();
      }

      const noteLabelMatch = line.match(/^noteLabel\s*:\s*(.+)$/i);
      if (noteLabelMatch && noteLabelMatch[1].trim()) {
        config.noteLabel = noteLabelMatch[1].trim();
      }

      const updatedLabelMatch = line.match(/^updatedLabel\s*:\s*(.+)$/i);
      if (updatedLabelMatch && updatedLabelMatch[1].trim()) {
        config.updatedLabel = updatedLabelMatch[1].trim();
      }

      const idHeaderMatch = line.match(/^idHeader\s*:\s*(.+)$/i);
      if (idHeaderMatch && idHeaderMatch[1].trim()) {
        config.idHeader = idHeaderMatch[1].trim();
      }

      const titleHeaderMatch = line.match(/^titleHeader\s*:\s*(.+)$/i);
      if (titleHeaderMatch && titleHeaderMatch[1].trim()) {
        config.titleHeader = titleHeaderMatch[1].trim();
      }

      const valueHeaderMatch = line.match(/^valueHeader\s*:\s*(.+)$/i);
      if (valueHeaderMatch && valueHeaderMatch[1].trim()) {
        config.valueHeader = valueHeaderMatch[1].trim();
      }

      const emptyLabelMatch = line.match(/^emptyLabel\s*:\s*(.+)$/i);
      if (emptyLabelMatch && emptyLabelMatch[1].trim()) {
        config.emptyLabel = emptyLabelMatch[1].trim();
      }
    }

    return config;
  }

  parseResetAllConfig(source) {
    const config = {
      button: "Reset note timers",
      busyLabel: "Resetting...",
      confirm: "This will reset all timers in this note. Continue?",
      missingNoteNotice: "Could not identify the note to reset timers.",
      successNotice: "Timers reset: {count}.",
      errorNotice: "Could not reset timers.",
    };

    const lines = source.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();

      const buttonMatch = line.match(/^button\s*:\s*(.+)$/i);
      if (buttonMatch && buttonMatch[1].trim()) {
        config.button = buttonMatch[1].trim();
      }

      const busyLabelMatch = line.match(/^busyLabel\s*:\s*(.+)$/i);
      if (busyLabelMatch && busyLabelMatch[1].trim()) {
        config.busyLabel = busyLabelMatch[1].trim();
      }

      const confirmMatch = line.match(/^confirm\s*:\s*(.+)$/i);
      if (confirmMatch && confirmMatch[1].trim()) {
        config.confirm = confirmMatch[1].trim();
      }

      const missingNoteMatch = line.match(/^missingNoteNotice\s*:\s*(.+)$/i);
      if (missingNoteMatch && missingNoteMatch[1].trim()) {
        config.missingNoteNotice = missingNoteMatch[1].trim();
      }

      const successNoticeMatch = line.match(/^successNotice\s*:\s*(.+)$/i);
      if (successNoticeMatch && successNoticeMatch[1].trim()) {
        config.successNotice = successNoticeMatch[1].trim();
      }

      const errorNoticeMatch = line.match(/^errorNotice\s*:\s*(.+)$/i);
      if (errorNoticeMatch && errorNoticeMatch[1].trim()) {
        config.errorNotice = errorNoticeMatch[1].trim();
      }
    }

    return config;
  }

  renderReportButton(source, el, ctx) {
    const config = this.parseReportConfig(source);
    const sectionInfo = ctx.getSectionInfo ? ctx.getSectionInfo() : null;

    const container = el.createDiv({ cls: "stt-report-container" });
    const button = container.createEl("button", {
      cls: "stt-button stt-report-button",
      text: config.button,
    });

    button.addEventListener("click", async () => {
      if (!ctx.sourcePath) {
        new Notice(config.missingNoteNotice);
        return;
      }

      const originalText = button.getText();
      button.disabled = true;
      button.setText(config.busyLabel);

      try {
        await this.generateReportForNote(ctx.sourcePath, sectionInfo, config);
        new Notice(config.successNotice);
      } catch (error) {
        console.error(error);
        new Notice(config.errorNotice);
      } finally {
        button.disabled = false;
        button.setText(originalText);
      }
    });
  }

  renderResetAllButton(source, el, ctx) {
    const config = this.parseResetAllConfig(source);
    const container = el.createDiv({ cls: "stt-report-container" });
    const button = container.createEl("button", {
      cls: "stt-button stt-report-button",
      text: config.button,
    });

    button.addEventListener("click", async () => {
      if (!ctx.sourcePath) {
        new Notice(config.missingNoteNotice);
        return;
      }

      const confirmed = window.confirm(config.confirm);
      if (!confirmed) return;

      const originalText = button.getText();
      button.disabled = true;
      button.setText(config.busyLabel);

      try {
        const count = await this.resetAllTimersForNote(ctx.sourcePath);
        new Notice(this.applyTemplate(config.successNotice, { count }));
      } catch (error) {
        console.error(error);
        new Notice(config.errorNotice);
      } finally {
        button.disabled = false;
        button.setText(originalText);
      }
    });
  }

  renderSaveSessionButton(source, el, ctx) {
    const config = this.parseSaveSessionConfig(source, ctx.sourcePath);
    const container = el.createDiv({ cls: "stt-report-container" });
    const button = container.createEl("button", {
      cls: "stt-button stt-report-button",
      text: config.button,
    });

    button.addEventListener("click", async () => {
      if (!ctx.sourcePath) {
        new Notice(config.missingNoteNotice);
        return;
      }

      const confirmed = window.confirm(config.confirm);
      if (!confirmed) return;

      const originalText = button.getText();
      button.disabled = true;
      button.setText(config.busyLabel);

      try {
        const session = await this.saveSessionForNote(ctx.sourcePath, config);
        new Notice(this.applyTemplate(config.successNotice, { log: config.logPath, total: session.totalText }));
      } catch (error) {
        console.error(error);
        new Notice(config.errorNotice);
      } finally {
        button.disabled = false;
        button.setText(originalText);
      }
    });
  }

  renderTimer(source, el, ctx) {
    const config = this.parseConfig(source);
    const timerId = this.getTimerId(source, ctx);
    this.ensureTimer(timerId);

    const container = el.createDiv({ cls: "stt-container" });
    const contentEl = container.createDiv({ cls: "stt-content" });
    const titleEl = contentEl.createDiv({ cls: "stt-title" });
    const timeEl = contentEl.createDiv({ cls: "stt-time" });
    const buttonEl = container.createEl("button", { cls: "stt-button" });

    if (config.title) {
      titleEl.setText(config.title);
    } else {
      titleEl.remove();
    }

    const updateUi = () => {
      const timer = this.ensureTimer(timerId);
      timeEl.setText(this.formatDuration(this.getElapsedMs(timer)));
      buttonEl.setText(timer.isRunning ? config.stopLabel : config.startLabel);
      container.toggleClass("is-running", timer.isRunning);
    };

    buttonEl.addEventListener("click", async () => {
      try {
        await this.toggleTimer(timerId, ctx.sourcePath, config.independent);
      } catch (error) {
        console.error(error);
        new Notice(config.errorNotice);
      } finally {
        updateUi();
      }
    });

    updateUi();

    const interval = window.setInterval(() => {
      if (!container.isConnected) {
        window.clearInterval(interval);
        return;
      }
      updateUi();
    }, 250);
  }
}

module.exports = SimpleTapTimerPlugin;
