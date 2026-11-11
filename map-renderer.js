var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// hooks/map.ts
var map_exports = {};
__export(map_exports, {
  STATIONS: () => STATIONS,
  classify: () => classify,
  describeNow: () => describeNow,
  drawMap: () => drawMap,
  firstLine: () => firstLine,
  foldRows: () => foldRows,
  formatMs: () => formatMs,
  memoryIds: () => memoryIds,
  routeOf: () => routeOf,
  setupFrom: () => setupFrom,
  shortModel: () => shortModel
});
module.exports = __toCommonJS(map_exports);

// hooks/text.ts
var en = {
  title: "Work map",
  command: "Open the work map beside the chat",
  opened: "Work map opened.",
  cannotOpen: (reason) => `Nowhere to show the map right now: ${reason}`,
  stations: {
    you: "You",
    model: "Model",
    memory: "Memory",
    files: "Files",
    shell: "Shell",
    web: "Network",
    browser: "Browser",
    agents: "Agents",
    skills: "Skills",
    hooks: "Hooks"
  },
  newMessage: "new message",
  answerReady: "answer ready",
  turnAborted: "turn interrupted",
  step: (n) => `step ${n}`,
  subagent: "subagent",
  compacting: "compacting context",
  addedContext: (when) => `added context ${when}`,
  addedMemory: (when) => `added memory ${when}`,
  toMessage: "to the message",
  atStart: "at session start",
  records: (n, shown) => `${n} record${n === 1 ? "" : "s"}: ${shown}`,
  stopped: (tool) => `stopped ${tool}`,
  askedPermission: (tool) => `asked permission: ${tool}`,
  checkBefore: (tool) => `check before ${tool}`,
  running: "running",
  nothingYet: "Nothing yet.",
  noCounts: "No counts yet.",
  idle: "Nothing is running.",
  context: "context",
  andMore: (n) => ` and ${n} more`,
  webSearch: "web search",
  artifact: "artifact",
  workflow: "workflow",
  skill: "skill",
  loadingTools: "loading tools",
  questionForYou: "question for you",
  fileForYou: "file for you",
  ms: (n) => `${n} ms`,
  seconds: (s) => `${s} s`,
  minutes: (m, s) => `${m} min ${s} s`
};
var ru = {
  title: "\u041A\u0430\u0440\u0442\u0430 \u0440\u0430\u0431\u043E\u0442\u044B",
  command: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0430\u0440\u0442\u0443 \u0440\u0430\u0431\u043E\u0442\u044B \u0440\u044F\u0434\u043E\u043C \u0441 \u0447\u0430\u0442\u043E\u043C",
  opened: "\u041A\u0430\u0440\u0442\u0430 \u0440\u0430\u0431\u043E\u0442\u044B \u043E\u0442\u043A\u0440\u044B\u0442\u0430.",
  cannotOpen: (reason) => `\u041A\u0430\u0440\u0442\u0443 \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0433\u0434\u0435 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C: ${reason}`,
  stations: {
    you: "\u0422\u044B",
    model: "\u041C\u043E\u0434\u0435\u043B\u044C",
    memory: "\u041F\u0430\u043C\u044F\u0442\u044C",
    files: "\u0424\u0430\u0439\u043B\u044B",
    shell: "\u0422\u0435\u0440\u043C\u0438\u043D\u0430\u043B",
    web: "\u0421\u0435\u0442\u044C",
    browser: "\u0411\u0440\u0430\u0443\u0437\u0435\u0440",
    agents: "\u0410\u0433\u0435\u043D\u0442\u044B",
    skills: "\u0421\u043A\u0438\u043B\u043B\u044B",
    hooks: "\u0425\u0443\u043A\u0438"
  },
  newMessage: "\u043D\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
  answerReady: "\u043E\u0442\u0432\u0435\u0442 \u0433\u043E\u0442\u043E\u0432",
  turnAborted: "\u0445\u043E\u0434 \u043F\u0440\u0435\u0440\u0432\u0430\u043D",
  step: (n) => `\u0448\u0430\u0433 ${n}`,
  subagent: "\u0441\u0443\u0431\u0430\u0433\u0435\u043D\u0442",
  compacting: "\u0441\u0436\u0430\u0442\u0438\u0435 \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442\u0430",
  addedContext: (when) => `\u0434\u043E\u0431\u0430\u0432\u0438\u043B \u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 ${when}`,
  addedMemory: (when) => `\u043F\u043E\u0434\u043C\u0435\u0448\u0430\u043B \u043F\u0430\u043C\u044F\u0442\u044C ${when}`,
  toMessage: "\u043A \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044E",
  atStart: "\u043F\u0440\u0438 \u0441\u0442\u0430\u0440\u0442\u0435",
  records: (n, shown) => `\u0437\u0430\u043F\u0438\u0441\u0435\u0439 ${n}: ${shown}`,
  stopped: (tool) => `\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u043B ${tool}`,
  askedPermission: (tool) => `\u0441\u043F\u0440\u043E\u0441\u0438\u043B \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043D\u0438\u0435: ${tool}`,
  checkBefore: (tool) => `\u043F\u0440\u043E\u0432\u0435\u0440\u043A\u0430 \u043F\u0435\u0440\u0435\u0434 ${tool}`,
  running: "\u0438\u0434\u0451\u0442",
  nothingYet: "\u041F\u043E\u043A\u0430 \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0431\u044B\u043B\u043E.",
  noCounts: "\u0421\u0447\u0451\u0442\u0447\u0438\u043A\u0438 \u043F\u0443\u0441\u0442\u044B.",
  idle: "\u0421\u0435\u0439\u0447\u0430\u0441 \u043D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u0432\u044B\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F.",
  context: "\u043A\u043E\u043D\u0442\u0435\u043A\u0441\u0442",
  andMore: (n) => ` \u0438 \u0435\u0449\u0451 ${n}`,
  webSearch: "\u043F\u043E\u0438\u0441\u043A \u0432 \u0441\u0435\u0442\u0438",
  artifact: "\u0430\u0440\u0442\u0435\u0444\u0430\u043A\u0442",
  workflow: "\u0440\u0430\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u0446\u0435\u0441\u0441",
  skill: "\u0441\u043A\u0438\u043B\u043B",
  loadingTools: "\u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u043E\u0432",
  questionForYou: "\u0432\u043E\u043F\u0440\u043E\u0441 \u0442\u0435\u0431\u0435",
  fileForYou: "\u0444\u0430\u0439\u043B \u0442\u0435\u0431\u0435",
  ms: (n) => `${n} \u043C\u0441`,
  seconds: (s) => `${s} \u0441`,
  minutes: (m, s) => `${m} \u043C\u0438\u043D ${s} \u0441`
};
var es = {
  title: "Mapa de trabajo",
  command: "Abrir el mapa de trabajo junto al chat",
  opened: "Mapa de trabajo abierto.",
  cannotOpen: (reason) => `Ahora no hay d\xF3nde mostrar el mapa: ${reason}`,
  stations: {
    you: "T\xFA",
    model: "Modelo",
    memory: "Memoria",
    files: "Archivos",
    shell: "Terminal",
    web: "Red",
    browser: "Navegador",
    agents: "Agentes",
    skills: "Skills",
    hooks: "Hooks"
  },
  newMessage: "mensaje nuevo",
  answerReady: "respuesta lista",
  turnAborted: "turno interrumpido",
  step: (n) => `paso ${n}`,
  subagent: "subagente",
  compacting: "compactando el contexto",
  addedContext: (when) => `a\xF1adi\xF3 contexto ${when}`,
  addedMemory: (when) => `a\xF1adi\xF3 memoria ${when}`,
  toMessage: "al mensaje",
  atStart: "al iniciar la sesi\xF3n",
  records: (n, shown) => `${n} registro${n === 1 ? "" : "s"}: ${shown}`,
  stopped: (tool) => `detuvo ${tool}`,
  askedPermission: (tool) => `pidi\xF3 permiso: ${tool}`,
  checkBefore: (tool) => `comprobaci\xF3n antes de ${tool}`,
  running: "en curso",
  nothingYet: "Todav\xEDa nada.",
  noCounts: "A\xFAn no hay recuentos.",
  idle: "No hay nada en ejecuci\xF3n.",
  context: "contexto",
  andMore: (n) => ` y ${n} m\xE1s`,
  webSearch: "b\xFAsqueda web",
  artifact: "artefacto",
  workflow: "flujo de trabajo",
  skill: "skill",
  loadingTools: "cargando herramientas",
  questionForYou: "pregunta para ti",
  fileForYou: "archivo para ti",
  ms: (n) => `${n} ms`,
  seconds: (s) => `${s} s`,
  minutes: (m, s) => `${m} min ${s} s`
};
var fr = {
  title: "Carte du travail",
  command: "Ouvrir la carte du travail \xE0 c\xF4t\xE9 du chat",
  opened: "Carte du travail ouverte.",
  cannotOpen: (reason) => `Impossible d'afficher la carte pour le moment : ${reason}`,
  stations: {
    you: "Vous",
    model: "Mod\xE8le",
    memory: "M\xE9moire",
    files: "Fichiers",
    shell: "Terminal",
    web: "R\xE9seau",
    browser: "Navigateur",
    agents: "Agents",
    skills: "Skills",
    hooks: "Hooks"
  },
  newMessage: "nouveau message",
  answerReady: "r\xE9ponse pr\xEAte",
  turnAborted: "tour interrompu",
  step: (n) => `\xE9tape ${n}`,
  subagent: "sous-agent",
  compacting: "compactage du contexte",
  addedContext: (when) => `contexte ajout\xE9 ${when}`,
  addedMemory: (when) => `m\xE9moire ajout\xE9e ${when}`,
  toMessage: "au message",
  atStart: "au d\xE9marrage de la session",
  records: (n, shown) => `${n} enregistrement${n > 1 ? "s" : ""} : ${shown}`,
  stopped: (tool) => `${tool} arr\xEAt\xE9`,
  askedPermission: (tool) => `autorisation demand\xE9e : ${tool}`,
  checkBefore: (tool) => `v\xE9rification avant ${tool}`,
  running: "en cours",
  nothingYet: "Rien pour le moment.",
  noCounts: "Aucun compteur pour le moment.",
  idle: "Rien en cours.",
  context: "contexte",
  andMore: (n) => ` et ${n} de plus`,
  webSearch: "recherche web",
  artifact: "artefact",
  workflow: "workflow",
  skill: "skill",
  loadingTools: "chargement des outils",
  questionForYou: "question pour vous",
  fileForYou: "fichier pour vous",
  ms: (n) => `${n} ms`,
  seconds: (s) => `${s.replace(".", ",")} s`,
  minutes: (m, s) => `${m} min ${s} s`
};
var de = {
  title: "Arbeitskarte",
  command: "Arbeitskarte neben dem Chat \xF6ffnen",
  opened: "Arbeitskarte ge\xF6ffnet.",
  cannotOpen: (reason) => `Die Karte kann gerade nirgends angezeigt werden: ${reason}`,
  stations: {
    you: "Du",
    model: "Modell",
    memory: "Ged\xE4chtnis",
    files: "Dateien",
    shell: "Terminal",
    web: "Netzwerk",
    browser: "Browser",
    agents: "Agenten",
    skills: "Skills",
    hooks: "Hooks"
  },
  newMessage: "neue Nachricht",
  answerReady: "Antwort fertig",
  turnAborted: "Durchgang abgebrochen",
  step: (n) => `Schritt ${n}`,
  subagent: "Subagent",
  compacting: "Kontext wird komprimiert",
  addedContext: (when) => `Kontext ${when} hinzugef\xFCgt`,
  addedMemory: (when) => `Erinnerungen ${when} hinzugef\xFCgt`,
  toMessage: "zur Nachricht",
  atStart: "beim Sitzungsstart",
  records: (n, shown) => `${n} ${n === 1 ? "Eintrag" : "Eintr\xE4ge"}: ${shown}`,
  stopped: (tool) => `${tool} gestoppt`,
  askedPermission: (tool) => `um Erlaubnis gefragt: ${tool}`,
  checkBefore: (tool) => `Pr\xFCfung vor ${tool}`,
  running: "l\xE4uft",
  nothingYet: "Noch nichts.",
  noCounts: "Noch keine Z\xE4hlerst\xE4nde.",
  idle: "Nichts l\xE4uft.",
  context: "Kontext",
  andMore: (n) => ` und ${n} weitere`,
  webSearch: "Websuche",
  artifact: "Artefakt",
  workflow: "Workflow",
  skill: "Skill",
  loadingTools: "Werkzeuge werden geladen",
  questionForYou: "Frage an dich",
  fileForYou: "Datei f\xFCr dich",
  ms: (n) => `${n} ms`,
  seconds: (s) => `${s.replace(".", ",")} s`,
  minutes: (m, s) => `${m} Min. ${s} s`
};
var TABLES = /* @__PURE__ */ new Map([["en", en], ["ru", ru], ["es", es], ["fr", fr], ["de", de]]);
var stringsFor = (language) => TABLES.get(language) ?? en;

// hooks/map.ts
var STATIONS = [
  { id: "you", icon: `${ring(0, -3.6, 3.4)}M-6.5 8c0-4 3-6.2 6.5-6.2s6.5 2.2 6.5 6.2` },
  { id: "model", icon: "M-5 -5h10v10h-10zM-2 -8.5v3.5M2 -8.5v3.5M-2 5v3.5M2 5v3.5M-8.5 -2h3.5M-8.5 2h3.5M5 -2h3.5M5 2h3.5" },
  { id: "memory", icon: `M-5 4.5L0 -5L6 3.5M-5 4.5L6 3.5${ring(-5, 4.5, 2.1)}${ring(0, -5, 2.1)}${ring(6, 3.5, 2.1)}` },
  { id: "files", icon: "M-5.5 -8h7.5l3.5 3.5v12.5h-11zM2 -8v3.5h3.5" },
  { id: "shell", icon: "M-7.5 -5l5 5l-5 5M0 6h7.5" },
  { id: "web", icon: `${ring(0, 0, 7.8)}M-7.8 0h15.6M0 -7.8c-4.2 4.2 -4.2 11.4 0 15.6M0 -7.8c4.2 4.2 4.2 11.4 0 15.6` },
  { id: "browser", icon: "M-8.5 -6.5h17v13h-17zM-8.5 -2.8h17M-6.3 -4.7h.1M-3.8 -4.7h.1" },
  { id: "agents", icon: `M0 -4v3.5M0 -.5L-6 4M0 -.5L6 4${ring(0, -6, 2.1)}${ring(-6.5, 5.5, 2.1)}${ring(6.5, 5.5, 2.1)}` },
  { id: "skills", icon: "M1.5 -8.5L-5.5 1h4.5l-1.5 7.5l7.5 -9.8h-4.5z" },
  { id: "hooks", icon: `M2.5 -5.5v8a4.2 4.2 0 1 1 -8.4 0v-1.5${ring(2.5, -7.3, 1.8)}` }
];
function ring(x, y, r) {
  return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}
var list = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((x) => String(x).trim()).filter((x) => x !== "");
function setupFrom(options = {}) {
  const memoryLabels = /* @__PURE__ */ new Map();
  for (const pair of list(options.memoryLabels)) {
    const at2 = pair.indexOf("=");
    if (at2 > 0 && at2 < pair.length - 1) memoryLabels.set(pair.slice(0, at2).trim(), pair.slice(at2 + 1).trim());
  }
  const core = typeof options.coreName === "string" ? options.coreName.trim().slice(0, 10) : "";
  return {
    t: stringsFor(options.language),
    core: core === "" ? "CLAUDE" : core,
    memoryServers: new Set(list(options.memoryServers)),
    memoryCommands: list(options.memoryCommands),
    memoryPaths: list(options.memoryPaths),
    memoryLabels,
    hookRecords: options.hookRecords === true,
    theme: options.theme === "dark" || options.theme === "light" ? options.theme : "auto",
    layout: options.layout === "you-bottom" ? "you-bottom" : "you-top"
  };
}
var lastTwo = (path) => path.split("/").filter(Boolean).slice(-2).join("/");
function hostOf(url) {
  const [, scheme = "", rest = ""] = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(.*)$/is.exec(url) ?? [];
  return ((rest.split(/[/?#]/)[0] ?? "").split("@").pop() ?? "").slice(0, 40) || scheme;
}
var isMemoryPath = (path, setup) => /\/\.claude\/projects\/[^/]+\/memory\//.test(path) || setup.memoryPaths.some((part) => path.includes(part));
var str = (v) => typeof v === "string" ? v : "";
var FILE_WORDS = /* @__PURE__ */ new Set(["cat", "head", "tail", "sed", "grep", "rg", "find", "ls", "wc", "cp", "mv", "mkdir", "touch", "diff", "cmp", "sort", "uniq", "cut", "tr", "awk", "tee", "stat", "file", "du", "tree", "ln", "basename", "dirname", "realpath", "jq"]);
var NEUTRAL_WORDS = /* @__PURE__ */ new Set(["echo", "printf", "cd", "export", "true", "set", "pwd", "sleep", "which", "test", "["]);
var NET_WORDS = /* @__PURE__ */ new Set(["curl", "wget", "gh", "ssh", "scp", "ping", "dig", "nslookup"]);
var NET_GIT = /* @__PURE__ */ new Set(["push", "pull", "fetch", "clone", "ls-remote"]);
var RUNNERS = /* @__PURE__ */ new Set(["python", "python3", "bash", "sh", "zsh", "node"]);
function segments(command) {
  return command.split(/&&|\|\||;|\||\n/).map((part) => part.trim().split(/\s+/).filter(Boolean)).map((words) => {
    let i = 0;
    while (i < words.length && /^[A-Za-z_]\w*=/.test(words[i] ?? "")) i++;
    return words.slice(i);
  }).filter((words) => words.length > 0);
}
var base = (word = "") => word.replace(/["']/g, "").split("/").pop() ?? word;
function memoryLabel(words, commands) {
  const head = base(words[0]);
  if (!commands.includes(head)) return base(RUNNERS.has(head) && words[1] ? words[1] : words[0]).replace(/\.py$/, "");
  const sub = words[1] ?? "";
  return /^[a-z][a-z-]*$/.test(sub) ? sub : head;
}
function classifyBash(command, description, setup) {
  const lines = segments(command);
  const label = description.trim() || base(lines[0]?.[0] ?? "shell");
  for (const words of lines) {
    const head = base(words[0]);
    const script = RUNNERS.has(head) && words[1] ? base(words[1]) : "";
    if (setup.memoryCommands.some((c) => head.startsWith(c) || script.startsWith(c))) {
      return { station: "memory", label: memoryLabel(words, setup.memoryCommands) };
    }
  }
  for (const words of lines) {
    const head = base(words[0]);
    if (NET_WORDS.has(head) || head === "git" && NET_GIT.has(words[1] ?? "")) return { station: "web", label };
  }
  const real = lines.filter((words) => !NEUTRAL_WORDS.has(base(words[0])));
  if (real.length > 0 && real.every((words) => FILE_WORDS.has(base(words[0])))) {
    return { station: isMemoryPath(command, setup) ? "memory" : "files", label };
  }
  return { station: "shell", label };
}
function classify(tool, input, setup) {
  const { t } = setup;
  switch (tool) {
    case "Read":
    case "Write":
    case "Edit":
    case "NotebookEdit": {
      const path = str(input.file_path) || str(input.notebook_path);
      return { station: isMemoryPath(path, setup) ? "memory" : "files", label: lastTwo(path) || tool };
    }
    case "Grep":
    case "Glob":
      return { station: "files", label: tool };
    case "Bash":
      return classifyBash(str(input.command), str(input.description), setup);
    case "WebFetch":
      return { station: "web", label: hostOf(str(input.url)) };
    case "WebSearch":
      return { station: "web", label: t.webSearch };
    case "Artifact":
      return { station: "web", label: t.artifact };
    case "Agent":
      return { station: "agents", label: str(input.description) || t.subagent };
    case "Workflow":
      return { station: "agents", label: t.workflow };
    case "SendMessage":
    case "TaskStop":
      return { station: "agents", label: tool };
    case "Skill":
      return { station: "skills", label: str(input.skill) || t.skill };
    case "ToolSearch":
      return { station: "skills", label: t.loadingTools };
    case "AskUserQuestion":
      return { station: "you", label: t.questionForYou };
    case "SendUserFile":
      return { station: "you", label: t.fileForYou };
  }
  const mcp = /^mcp__([^_].*?)__(.+)$/.exec(tool);
  if (mcp === null) return { station: "shell", label: tool };
  const [, server = "", name = ""] = mcp;
  if (setup.memoryServers.has(server)) {
    const id = typeof input.id === "number" || typeof input.id === "string" ? ` #${input.id}` : "";
    return { station: "memory", label: (setup.memoryLabels.get(name) ?? name.replace(/_/g, " ")) + id };
  }
  if (server === "Claude_Browser" || server === "claude-in-chrome") {
    const url = str(input.url);
    return { station: "browser", label: url && /^[a-z]+:/i.test(url) ? hostOf(url) : name.replace(/_/g, " ") };
  }
  if (server === "terminal") return { station: "shell", label: name.replace(/_/g, " ") };
  if (server === "visualize" || server.startsWith("ccd_")) return { station: "you", label: name.replace(/_/g, " ") };
  if (server === "plugin-authoring") return { station: "skills", label: name.replace(/_/g, " ") };
  return { station: "web", label: `${server}: ${name.replace(/_/g, " ")}` };
}
function shortModel(model) {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model);
  return m === null ? model : `${m[1]} ${m[2]}${m[3] !== void 0 ? `.${m[3]}` : ""}`;
}
function formatMs(ms, t) {
  return ms < 1e3 ? t.ms(Math.max(1, Math.round(ms))) : ms < 6e4 ? t.seconds((ms / 1e3).toFixed(1)) : t.minutes(Math.floor(ms / 6e4), Math.round(ms % 6e4 / 1e3));
}
function firstLine(text, max = 72) {
  const line = (text.split("\n").find((l) => l.trim() !== "") ?? "").trim();
  return line.length > max ? `${line.slice(0, max - 1)}\u2026` : line;
}
function memoryIds(text) {
  return [...new Set([...text.matchAll(/\[(?:[a-z]+ )?#(\d+)/g)].map((m) => m[1] ?? ""))];
}
var W = 460;
var H = 430;
var CX = 230;
var CY = 212;
var RX = 176;
var RY = 164;
var NODE = 22;
var CORE = 40;
var HUB = CORE + 8;
var DARK = {
  ground: "#0a0c11",
  raised: "#12151c",
  line: "#272c36",
  spoke: "#1a1e27",
  bone: "#ebe6dc",
  ash: "#9ba1ab",
  dim: "#6b7280",
  accent: "#e1ac6e",
  hot: "#f0c595",
  red: "#e8654f",
  mem: "#62c7ba",
  memHot: "#a5e6dc"
};
var LIGHT = {
  ground: "#f5f2ea",
  raised: "#ffffff",
  line: "#cfc9bc",
  spoke: "#e3ded2",
  bone: "#1f2228",
  ash: "#5f6570",
  dim: "#8b909a",
  accent: "#b8762a",
  hot: "#8f560f",
  red: "#c5402b",
  mem: "#1c8c81",
  memHot: "#136a62"
};
var LIGHT_RULES = `<style>@media (prefers-color-scheme: light){${Object.keys(DARK).map((k) => `[fill="${DARK[k]}"]{fill:${LIGHT[k]}}[stroke="${DARK[k]}"]{stroke:${LIGHT[k]}}`).join("")}}</style>`;
var FONT = 'font-family="SF Mono, ui-monospace, Menlo, monospace"';
var PULSE_MS = 800;
var RIPPLE_MS = 450;
var GLOW_MS = 3200;
var ALARM_MS = 6e3;
var SWITCH_MS = 8e3;
var DONE_MS = 1100;
var TRAIL_STOPS = 7;
var shift = 0;
var turn = (i) => (i + shift) * 2 * Math.PI / STATIONS.length;
var at = (a, f = 1) => ({ x: CX + RX * f * Math.sin(a), y: CY - RY * f * Math.cos(a) });
var place = (i) => at(turn(i));
var indexOf = (id) => STATIONS.findIndex((s) => s.id === id);
var n1 = (v) => (Math.round(v * 10) / 10).toString();
var clock = (ms) => `${(ms / 1e3).toFixed(3)}s`;
function edge(from, to, r) {
  const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: from.x + (to.x - from.x) * r / d, y: from.y + (to.y - from.y) * r / d };
}
function aside(a, b, off) {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dx = -(b.y - a.y) * off / d;
  const dy = (b.x - a.x) * off / d;
  return [{ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }];
}
function pulse(a, b, color, age, radius, isHollow = false) {
  const path = `M${n1(a.x)} ${n1(a.y)}L${n1(b.x)} ${n1(b.y)}`;
  let out = "";
  for (let k = isHollow ? 0 : 2; k >= 0; k--) {
    const timing = `begin="${clock(k * 45 - age)}" dur="${clock(PULSE_MS)}" fill="freeze"`;
    const peak = n1(1 - 0.36 * k);
    const paint = isHollow ? `fill="none" stroke="${color}" stroke-width="1.4"` : `fill="${color}"`;
    out += `<circle r="${n1(radius * (1 - 0.27 * k))}" ${paint} opacity="0"><animateMotion path="${path}" ${timing}/><animate attributeName="opacity" values="${peak};${peak};0" keyTimes="0;.82;1" ${timing}/></circle>`;
  }
  return out;
}
function ripple(p, r, color, age) {
  const timing = `begin="${clock(PULSE_MS - age)}" dur="${clock(RIPPLE_MS)}" fill="freeze"`;
  return `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${r}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0"><animate attributeName="r" values="${r};${r + 11}" ${timing}/><animate attributeName="opacity" values=".7;0" ${timing}/></circle>`;
}
function beam(a, b, color, age, isDashed) {
  return `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke="${color}" stroke-width="1.4"${isDashed ? ' stroke-dasharray="3 4"' : ""} opacity="0"><animate attributeName="opacity" values=".75;0" begin="${clock(-age)}" dur="${clock(GLOW_MS / 2)}" fill="freeze"/></line>`;
}
var BEND = [0.5, 0.5, 0.4, 0.45, 0.55, 0.75];
function leg(i, j) {
  const n = STATIONS.length;
  let steps = ((j - i) % n + n) % n;
  if (steps > n / 2) steps -= n;
  const bend = at(turn(i + steps / 2), BEND[Math.abs(steps)] ?? 0.5);
  const a = edge(place(i), bend, NODE + 4);
  const b = edge(place(j), bend, NODE + 4);
  return { path: `M${n1(a.x)} ${n1(a.y)}Q${n1(bend.x)} ${n1(bend.y)} ${n1(b.x)} ${n1(b.y)}`, end: b };
}
function routeOf(entries, max = TRAIL_STOPS) {
  const stops = [];
  for (const e of entries) {
    if (e.from === "agents" || e.station === "model") continue;
    const last = stops[stops.length - 1];
    if (last !== void 0 && last.station === e.station) last.at = e.startedAt;
    else stops.push({ station: e.station, at: e.startedAt });
  }
  return stops.slice(-max);
}
function trail(entries, now, c) {
  const stops = routeOf(entries);
  let out = "";
  for (let k = 1; k < stops.length; k++) {
    const from = stops[k - 1];
    const to = stops[k];
    if (from === void 0 || to === void 0) continue;
    const { path, end } = leg(indexOf(from.station), indexOf(to.station));
    const isHead = k === stops.length - 1;
    const opacity = n1(0.12 + 0.5 * k / (stops.length - 1));
    const drawing = isHead ? ` pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" values="1;0" begin="${clock(to.at - now)}" dur=".5s" fill="freeze"/></path>` : "/>";
    out += `<path d="${path}" fill="none" stroke="${c.bone}" stroke-width="${isHead ? 1.5 : 1.1}" stroke-linecap="round" opacity="${opacity}"${drawing}`;
    if (isHead) {
      out += `<circle cx="${n1(end.x)}" cy="${n1(end.y)}" r="2.4" fill="${c.bone}" opacity="0"><animate attributeName="opacity" values="0;.85" begin="${clock(to.at - now + 400)}" dur=".15s" fill="freeze"/></circle>`;
    }
  }
  return out;
}
function station(s, i, { entries, board, now, c, names }) {
  const p = place(i);
  const x = n1(p.x);
  const y = n1(p.y);
  const count = board.counts[s.id] ?? 0;
  const own = entries.filter((e) => e.station === s.id);
  const running = own.filter((e) => e.status === "run");
  const latest = own.length > 0 ? own[own.length - 1] : void 0;
  const since = latest === void 0 ? Infinity : now - (latest.endedAt ?? latest.startedAt);
  const alarm = own.filter((e) => e.status === "block" || e.status === "err").pop();
  const alarmAge = alarm === void 0 ? Infinity : now - (alarm.endedAt ?? alarm.startedAt);
  const isAlarm = alarmAge < ALARM_MS;
  const isLit = running.length > 0 || since < GLOW_MS;
  const [main, hot] = s.id === "memory" ? [c.mem, c.memHot] : [c.accent, c.hot];
  const color = isAlarm ? c.red : main;
  const fade = isAlarm ? alarmAge : since;
  const span = isAlarm ? ALARM_MS : GLOW_MS;
  let under = "";
  if (isLit || isAlarm) {
    under += running.length > 0 && !isAlarm ? `<circle cx="${x}" cy="${y}" r="${NODE + 10}" fill="${color}" opacity=".16"/>` : `<circle cx="${x}" cy="${y}" r="${NODE + 10}" fill="${color}" opacity="0"><animate attributeName="opacity" values=".3;0" begin="${clock(-fade)}" dur="${clock(span)}" fill="freeze"/></circle>`;
  }
  if (running.length > 0) {
    const elapsed = now - Math.min(...running.map((e) => e.startedAt));
    const beat = `begin="${clock(-(elapsed % 1400))}" dur="1.4s" repeatCount="indefinite"`;
    under += `<circle cx="${x}" cy="${y}" r="${NODE}" fill="none" stroke="${color}" stroke-width="1.3"><animate attributeName="r" values="${NODE};${NODE + 15}" ${beat}/><animate attributeName="opacity" values=".9;0" ${beat}/></circle>`;
    const hand = (r, width, lapMs, isOnce) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${hot}" stroke-width="${width}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" transform="rotate(-90 ${x} ${y})"><animate attributeName="stroke-dashoffset" values="1;0" begin="${clock(-(isOnce ? Math.min(elapsed, lapMs) : elapsed % lapMs))}" dur="${clock(lapMs)}" ${isOnce ? 'fill="freeze"' : 'repeatCount="indefinite"'}/></circle>`;
    under += hand(NODE + 4, 2.2, 6e4, false) + hand(NODE + 8, 1.2, 6e5, true);
  }
  const lit = `<circle cx="${x}" cy="${y}" r="${NODE}" fill="none" stroke="${color}" stroke-width="1.2"`;
  const cooling = running.length > 0 ? `${lit}/>` : isLit || isAlarm ? `${lit} opacity="0"><animate attributeName="opacity" values="1;0" begin="${clock(-fade)}" dur="${clock(span)}" fill="freeze"/></circle>` : "";
  const glyphColor = isAlarm ? c.red : isLit ? hot : s.id === "memory" && count > 0 ? main : c.ash;
  const rim = `paint-order="stroke" stroke="${c.ground}" stroke-width="3.5" stroke-linejoin="round"`;
  let over = `<circle cx="${x}" cy="${y}" r="${NODE}" fill="${c.raised}" stroke="${c.line}" stroke-width="1.2"/>${cooling}<path transform="translate(${x} ${y})" d="${s.icon}" fill="none" stroke="${glyphColor}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/><text x="${x}" y="${n1(p.y + NODE + 15)}" text-anchor="middle" ${FONT} font-size="11.5" ${rim} fill="${isLit || isAlarm ? c.bone : c.ash}">${names[s.id]}</text>`;
  if (count > 0) {
    const pushed = s.id === "memory" ? Math.min(count, board.pushed ?? 0) : 0;
    const asked = count - pushed;
    const figures = pushed === 0 ? String(count) : `${asked > 0 ? `${asked} ` : ""}<tspan fill="${main}">\u2193${pushed}</tspan>`;
    over += `<text x="${x}" y="${n1(p.y + NODE + 28)}" text-anchor="middle" ${FONT} font-size="9.5" ${rim} fill="${c.dim}">${figures}</text>`;
  }
  const corner = NODE * 0.74;
  if (running.length > 1) {
    over += `<circle cx="${n1(p.x + corner)}" cy="${n1(p.y - corner)}" r="8" fill="${c.raised}" stroke="${color}" stroke-width="1"/><text x="${n1(p.x + corner)}" y="${n1(p.y - corner + 3)}" text-anchor="middle" ${FONT} font-size="8.5" fill="${hot}">\xD7${running.length}</text>`;
  }
  const faults = board.faults?.[s.id] ?? 0;
  if (faults > 0) {
    over += `<circle cx="${n1(p.x - corner)}" cy="${n1(p.y - corner)}" r="7.5" fill="${c.red}"/><text x="${n1(p.x - corner)}" y="${n1(p.y - corner + 3.1)}" text-anchor="middle" ${FONT} font-size="9" font-weight="700" fill="${c.ground}">${faults > 99 ? "99+" : faults}</text>`;
  }
  return { under, over };
}
function drawMap(board, now, setup) {
  const c = setup.theme === "light" ? LIGHT : DARK;
  shift = setup.layout === "you-bottom" ? STATIONS.length / 2 : 0;
  const core = { x: CX, y: CY };
  const recent = board.entries.slice(-40);
  const flights = recent.filter((e) => now - e.startedAt < PULSE_MS + RIPPLE_MS).slice(-14);
  const returns = recent.filter((e) => e.endedAt !== void 0 && e.from !== "inbound" && now - e.endedAt < PULSE_MS + RIPPLE_MS).slice(-14);
  const beams = recent.filter((e) => now - e.startedAt < GLOW_MS / 2).slice(-10);
  const anyRunning = recent.some((e) => e.status === "run");
  const agentsAt = place(indexOf("agents"));
  const isBad = (e) => e.status === "block" || e.status === "err";
  const tone = (e) => e.station === "memory" ? [c.mem, c.memHot] : [c.accent, c.hot];
  let body = `<rect width="${W}" height="${H}" rx="12" fill="${c.ground}"/>`;
  for (const [rx, ry] of [[66, 62], [104, 97], [142, 132]]) {
    body += `<ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${ry}" fill="none" stroke="${c.line}" stroke-width=".7" opacity=".45" stroke-dasharray="2 5"/>`;
  }
  STATIONS.forEach((s, i) => {
    const p = place(i);
    const a = edge(core, p, HUB);
    const b = edge(p, core, NODE);
    const worn = Math.min(1, Math.log2(1 + (board.counts[s.id] ?? 0)) / 7);
    const line = `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(b.x)}" y2="${n1(b.y)}" stroke-width="${n1(1 + 2.6 * worn)}" stroke-linecap="round"`;
    body += `${line} stroke="${c.spoke}"/>`;
    if (worn > 0) body += `${line} stroke="${s.id === "memory" ? c.mem : c.accent}" opacity="${n1(worn * 0.55)}"/>`;
  });
  const scene = { entries: recent, board, now, c, names: setup.t.stations };
  const drawn = STATIONS.map((s, i) => station(s, i, scene));
  body += drawn.map((d) => d.under).join("");
  body += trail(recent, now, c);
  const ends = (e) => {
    const p = place(indexOf(e.station));
    const start = e.from === "agents" ? agentsAt : core;
    return [edge(start, p, e.from === "agents" ? NODE : HUB), edge(p, start, NODE)];
  };
  const lane = (list2, e) => {
    const peers = list2.filter((x) => x.station === e.station && x.from === e.from);
    return (peers.indexOf(e) - (peers.length - 1) / 2) * 5;
  };
  for (const e of beams) {
    const [a, b] = ends(e);
    body += beam(a, b, isBad(e) ? c.red : tone(e)[0], now - e.startedAt, e.from === "inbound");
  }
  for (const e of flights) {
    const [a, b] = aside(...ends(e), lane(flights, e));
    const age = now - e.startedAt;
    const color = e.status === "block" ? c.red : tone(e)[1];
    if (e.from === "inbound") {
      body += pulse(b, a, color, age, 3.8, true) + ripple(core, HUB - 2, color, age);
    } else {
      body += pulse(a, b, color, age, 3.8) + ripple(place(indexOf(e.station)), NODE, color, age);
    }
  }
  for (const e of returns) {
    const [a, b] = aside(...ends(e), lane(returns, e));
    body += pulse(b, a, e.status === "ok" ? c.ash : c.red, now - e.endedAt, 2.6);
  }
  body += drawn.map((d) => d.over).join("");
  const crew = (board.agents ?? []).slice(0, 6);
  crew.forEach((_, k) => {
    const lap = 7e3;
    const spin = `${n1(agentsAt.x)} ${n1(agentsAt.y)}`;
    body += `<g><animateTransform attributeName="transform" type="rotate" from="0 ${spin}" to="360 ${spin}" begin="${clock(-((now + k * lap / crew.length) % lap))}" dur="${clock(lap)}" repeatCount="indefinite"/><circle cx="${n1(agentsAt.x)}" cy="${n1(agentsAt.y - NODE - 6)}" r="3" fill="${c.hot}"/></g>`;
  });
  const coreSize = Math.min(17, 62 / (0.75 * setup.core.length));
  const period = anyRunning ? 1600 : 4800;
  const breath = `begin="${clock(-(now % period))}" dur="${clock(period)}" repeatCount="indefinite"`;
  body += `<circle cx="${CX}" cy="${CY}" r="${CORE + 6}" fill="${c.accent}" opacity=".08"><animate attributeName="r" values="${CORE + 3};${CORE + 13};${CORE + 3}" ${breath}/><animate attributeName="opacity" values=".05;${anyRunning ? ".24" : ".12"};.05" ${breath}/></circle><circle cx="${CX}" cy="${CY}" r="${CORE}" fill="${c.raised}" stroke="${anyRunning ? c.accent : c.line}" stroke-width="1.3"/>`;
  if (board.context !== void 0) {
    const full = Math.max(0, Math.min(100, Math.round(board.context)));
    const ring2 = `cx="${CX}" cy="${CY}" r="${CORE + 5}" fill="none" stroke-width="2.2"`;
    body += `<circle ${ring2} stroke="${c.line}" opacity=".7"/><circle ${ring2} stroke="${full >= 90 ? c.red : full >= 70 ? c.accent : c.ash}" pathLength="100" stroke-dasharray="${full} 100" transform="rotate(-90 ${CX} ${CY})"/><text x="${CX}" y="${CY - 19}" text-anchor="middle" ${FONT} font-size="8" fill="${c.dim}">${full}%</text>`;
  }
  const switchAge = board.switchedAt === void 0 ? Infinity : now - board.switchedAt;
  const isSwitching = switchAge >= 0 && switchAge < SWITCH_MS;
  body += `<text x="${CX}" y="${CY + (board.model === void 0 ? 6 : 1)}" text-anchor="middle" ${FONT} font-size="${n1(coreSize)}" letter-spacing="${n1(coreSize * 0.147)}" fill="${c.bone}">${escapeXml(setup.core)}</text>`;
  if (board.model !== void 0) {
    body += `<text x="${CX}" y="${CY + 17}" text-anchor="middle" ${FONT} font-size="9" fill="${isSwitching ? c.hot : c.ash}">${escapeXml(shortModel(board.model))}</text>`;
  }
  if (isSwitching) {
    const model = place(indexOf("model"));
    const laps = Math.ceil((SWITCH_MS - switchAge) / 1600);
    for (const [p, r] of [[core, CORE], [model, NODE]]) {
      const ringing = `begin="${clock(-(switchAge % 1600))}" dur="1.6s" repeatCount="${laps}" fill="freeze"`;
      body += `<circle cx="${n1(p.x)}" cy="${n1(p.y)}" r="${r}" fill="none" stroke="${c.bone}" stroke-width="1.4" opacity="0"><animate attributeName="r" values="${r};${r + 26}" ${ringing}/><animate attributeName="opacity" values=".7;0" ${ringing}/></circle>`;
    }
  }
  const done = recent.filter((e) => e.mark === "done").pop();
  if (done !== void 0 && now - done.startedAt < DONE_MS) {
    const leaving = `begin="${clock(done.startedAt - now)}" dur="${clock(DONE_MS)}" fill="freeze"`;
    body += `<circle cx="${CX}" cy="${CY}" r="${CORE}" fill="none" stroke="${c.bone}" stroke-width="1.6" opacity="0"><animate attributeName="r" values="${CORE};${CORE + 38}" ${leaving}/><animate attributeName="opacity" values=".6;0" ${leaving}/></circle>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">${setup.theme === "auto" ? LIGHT_RULES : ""}${body}</svg>`;
}
function escapeXml(text) {
  return text.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
}
var isPlain = (e) => e.status === "ok" && e.mark === void 0;
function foldRows(entries, max = 16) {
  const rows = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e === void 0) continue;
    const took = e.endedAt === void 0 ? 0 : Math.max(0, e.endedAt - e.startedAt);
    const last = rows[rows.length - 1];
    if (last !== void 0 && isPlain(e) && isPlain(last.entry) && last.entry.station === e.station && last.entry.from === e.from) {
      last.times++;
      last.tookMs += took;
      continue;
    }
    if (rows.length === max) break;
    rows.push({ entry: e, times: 1, tookMs: took });
  }
  return rows;
}
function describeNow(board, t) {
  const running = board.entries.filter((e) => e.status === "run");
  const context = board.context === void 0 ? "" : ` \xB7 ${t.context} ${Math.round(board.context)}%`;
  const top = running[running.length - 1];
  if (top === void 0) return `${t.idle}${context}`;
  return `${t.stations[top.station]}: ${top.label}${running.length > 1 ? t.andMore(running.length - 1) : ""}${context}`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  STATIONS,
  classify,
  describeNow,
  drawMap,
  firstLine,
  foldRows,
  formatMs,
  memoryIds,
  routeOf,
  setupFrom,
  shortModel
});
