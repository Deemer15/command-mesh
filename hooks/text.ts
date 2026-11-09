// Every word the map shows, in each language it speaks.
// A new language is one more table here and one more value of `language` in plugin.json.
import type { StationId } from '../types'

export type Strings = {
  title: string
  command: string
  opened: string
  cannotOpen: (reason: string) => string
  stations: Record<StationId, string>
  newMessage: string
  answerReady: string
  turnAborted: string
  step: (n: number) => string
  subagent: string
  compacting: string
  addedContext: string
  addedMemory: string
  toMessage: string
  atStart: string
  records: (n: number, shown: string) => string
  stopped: (tool: string) => string
  askedPermission: (tool: string) => string
  checkBefore: (tool: string) => string
  running: string
  nothingYet: string
  noCounts: string
  idle: string
  andMore: (n: number) => string
  webSearch: string
  artifact: string
  workflow: string
  skill: string
  loadingTools: string
  questionForYou: string
  fileForYou: string
  ms: (n: number) => string
  seconds: (s: string) => string
  minutes: (m: number, s: number) => string
}

const en: Strings = {
  title: 'Work map',
  command: 'Open the work map beside the chat',
  opened: 'Work map opened.',
  cannotOpen: reason => `Nowhere to show the map right now: ${reason}`,
  stations: {
    you: 'You',
    model: 'Model',
    memory: 'Memory',
    files: 'Files',
    shell: 'Shell',
    web: 'Web',
    browser: 'Browser',
    agents: 'Agents',
    skills: 'Skills',
    hooks: 'Hooks',
  },
  newMessage: 'new message',
  answerReady: 'answer ready',
  turnAborted: 'turn interrupted',
  step: n => `step ${n}`,
  subagent: 'subagent',
  compacting: 'compacting context',
  addedContext: 'added context',
  addedMemory: 'added memory',
  toMessage: 'to the message',
  atStart: 'at session start',
  records: (n, shown) => `${n} records: ${shown}`,
  stopped: tool => `stopped ${tool}`,
  askedPermission: tool => `asked permission: ${tool}`,
  checkBefore: tool => `check before ${tool}`,
  running: 'running',
  nothingYet: 'Nothing yet.',
  noCounts: 'No counts yet.',
  idle: 'Nothing is running.',
  andMore: n => ` and ${n} more`,
  webSearch: 'web search',
  artifact: 'artifact',
  workflow: 'workflow',
  skill: 'skill',
  loadingTools: 'loading tools',
  questionForYou: 'question for you',
  fileForYou: 'file for you',
  ms: n => `${n} ms`,
  seconds: s => `${s} s`,
  minutes: (m, s) => `${m} min ${s} s`,
}

const ru: Strings = {
  title: 'Карта работы',
  command: 'Открыть карту работы рядом с чатом',
  opened: 'Карта работы открыта.',
  cannotOpen: reason => `Карту сейчас негде показать: ${reason}`,
  stations: {
    you: 'Ты',
    model: 'Модель',
    memory: 'Память',
    files: 'Файлы',
    shell: 'Терминал',
    web: 'Сеть',
    browser: 'Браузер',
    agents: 'Агенты',
    skills: 'Скиллы',
    hooks: 'Хуки',
  },
  newMessage: 'новое сообщение',
  answerReady: 'ответ готов',
  turnAborted: 'ход прерван',
  step: n => `шаг ${n}`,
  subagent: 'субагент',
  compacting: 'сжатие контекста',
  addedContext: 'добавил контекст',
  addedMemory: 'подмешал память',
  toMessage: 'к сообщению',
  atStart: 'при старте',
  records: (n, shown) => `записей ${n}: ${shown}`,
  stopped: tool => `остановил ${tool}`,
  askedPermission: tool => `спросил разрешение: ${tool}`,
  checkBefore: tool => `проверка перед ${tool}`,
  running: 'идёт',
  nothingYet: 'Пока ничего не было.',
  noCounts: 'Счётчики пусты.',
  idle: 'Сейчас ничего не выполняется.',
  andMore: n => ` и ещё ${n}`,
  webSearch: 'поиск в сети',
  artifact: 'артефакт',
  workflow: 'рабочий процесс',
  skill: 'скилл',
  loadingTools: 'загрузка инструментов',
  questionForYou: 'вопрос тебе',
  fileForYou: 'файл тебе',
  ms: n => `${n} мс`,
  seconds: s => `${s} с`,
  minutes: (m, s) => `${m} мин ${s} с`,
}

export const stringsFor = (language: unknown): Strings => (language === 'ru' ? ru : en)
