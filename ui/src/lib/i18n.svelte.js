const dict = {
  en: {
    effort: 'Effort', capability: 'Capability', full: 'Full', degraded: 'Degraded', rules: 'Dispatch reminders', note: 'User note',
    branch: 'Branch', files: 'Changed files', unchanged: 'No file changes', unknown: 'Not reported',
    cache: 'Input cache hit rate', parent: 'Reviews ticket', children: 'Review tickets', followups: 'Interjections',
    injected: 'Injected', next: 'Queued for next turn', rejected: 'Rejected',
    tagline: 'Your crew, at a glance',
    projects: 'Projects',
    back: 'Projects',
    queued: 'Queued',
    working: 'Working',
    review: 'Review',
    done: 'Done',
    emptyColumn: 'Nothing here',
    noTickets: 'No tickets yet',
    noTicketsHint: 'Open the manager chat and tell it what you want done. Tickets show up here as the manager hands work to the crew.',
    noProjects: 'No projects yet',
    noProjectsHint: 'Register a project from its root directory.',
    needsYou: 'need you',
    needsYouOne: 'needs you',
    error: 'Error',
    stopped: 'Stopped',
    turn: 'Turn',
    worker: 'Worker',
    model: 'Model',
    elapsed: 'Time',
    updated: 'Updated',
    lastReply: 'Last reply',
    noReply: 'No reply yet.',
    timeline: 'Activity',
    close: 'Close',
    offline: 'Lost connection to cc-bro. Reconnecting…',
    somethingWrong: 'Something went wrong',
    justNow: 'just now',
    ago: 'ago',
  },
  zh: {
    effort: '档位', capability: '能力等级', full: '全功能', degraded: '降级', rules: '派单提醒', note: '用户备注',
    branch: '分支', files: '改动文件', unchanged: '无文件改动', unknown: '暂无数据',
    cache: '输入缓存命中率', parent: '审查的原单', children: '审查单', followups: '插话',
    injected: '已注入', next: '排到下一轮', rejected: '被拒',
    tagline: '老弟们在干什么，一眼看清',
    projects: '项目',
    back: '项目',
    queued: '排队',
    working: '干活中',
    review: '等经理看',
    done: '完成',
    emptyColumn: '暂无',
    noTickets: '还没有工单',
    noTicketsHint: '打开经理对话，告诉它你想做什么。经理把活交给老弟时，工单会出现在这里。',
    noProjects: '还没有项目',
    noProjectsHint: '在项目根目录运行登记命令。',
    needsYou: '件等你',
    needsYouOne: '件等你',
    error: '出错',
    stopped: '已叫停',
    turn: '轮次',
    worker: '工人',
    model: '模型',
    elapsed: '用时',
    updated: '更新',
    lastReply: '最后回复',
    noReply: '还没有回复。',
    timeline: '过程',
    close: '关闭',
    offline: '和 cc-bro 断开了，正在重连…',
    somethingWrong: '出了点问题',
    justNow: '刚刚',
    ago: '前',
  }
}


function pick() {
  try {
    const saved = localStorage.getItem('cc-bro-lang')
    if (saved && dict[saved]) return saved
  } catch {}
  return (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export const lang = $state({ current: pick() })

export function t(key) {
  return dict[lang.current][key] ?? dict.en[key] ?? key
}

export function setLang(code) {
  lang.current = code
  try { localStorage.setItem('cc-bro-lang', code) } catch {}
}

export function tf(key, vars) {
  return t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
}
