import { readFileSync, mkdirSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs'
import { join, resolve, relative, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Marked } from 'marked'

const root = dirname(fileURLToPath(import.meta.url))
const out = resolve(process.argv[2] ?? join(root, 'dist'))
const read = file => readFileSync(file, 'utf8')
const esc = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const version = JSON.parse(read(join(root, '../package.json'))).version
const groups = [
  [['Getting started', '入门'], [['installation', 'Installation', '安装'], ['quickstart', 'Your first ticket', '第一张工单'], ['workers', 'Workers and login', '工人选择与登录'], ['allowlist', 'Project allowlist', '项目允许名单']]],
  [['Choose your crew', '选择工人'], [['roster', 'Worker roster', '工人花名册'], ['settings', 'Settings', '配置页'], ['model-inputs', 'Capabilities and media', '能力与附件'], ['custom-cli', 'Custom CLI templates', '自定义 CLI 模板']]],
  [['Working with tickets', '处理工单'], [['steering', 'Steering', '运行中插话'], ['review-worktree', 'Worktrees and review', '独立工作区与审查'], ['board', 'The board', '看板']]],
  [['Reference', '查阅'], [['commands', 'Command reference', '命令参考'], ['upgrade', 'Upgrading', '升级'], ['faq', 'FAQ', '常见问题']]]
]
const topics = groups.flatMap(([, items]) => items)
const ids = topics.map(([id]) => id)
const route = (lang, id) => (lang === 'zh' ? '/zh' : '') + (id === 'changelog' ? '/changelog/' : '/docs/' + (id === 'installation' ? '' : id + '/'))
const glossary = ['English', '简体中文']
const changes = read(join(root, '../CHANGELOG.md')).trim().split(/^## /m).slice(1).map(block => {
  const [v, ...lines] = block.split('\n')
  const langs = lines.join('\n').trim().split(/^### (English|简体中文)\s*$/m)
  if (!/^\d+\.\d+\.\d+$/.test(v) || langs.length !== 5 || langs[1] !== glossary[0] || langs[3] !== glossary[1] || !langs[2].trim() || !langs[4].trim()) throw Error('Expected version and both translations in CHANGELOG.md: ' + v)
  return { v, parts: [langs[2], langs[4]] }
})
if (changes[0]?.v !== version || new Set(changes.map(c => c.v)).size !== changes.length) throw Error('Missing current or duplicate changelog version')

function body(source, file) {
  const md = new Marked({ renderer: {
    link(token) {
      if (!token.href.endsWith('.md') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(token.href)) return false
      const path = relative(root, resolve(dirname(file), token.href)).split(sep)
      const id = path.at(-1).slice(0, -3)
      if (path.length !== 2 || !['zh', 'en'].includes(path[0]) || !ids.includes(id)) throw Error('Unknown guide link: ' + token.href)
      return `<a href="${route(path[0], id)}">${this.parser.parseInline(token.tokens)}</a>`
    }
  } })
  return md.parse(source)
}

function page(lang, id, title, lead, toc, article, pager = '') {
  const zh = lang === 'zh'
  const t = (en, cn) => zh ? cn : en
  const log = id === 'changelog'
  const langTag = t('en', 'zh-CN'), other = t('zh', 'en')
  const nav = (dest, label, current) => `<a href="${route(lang, dest)}"${current ? ' aria-current="page"' : ''}>${label}</a>`
  const sideTitle = log ? t('Release index','版本目录') : t('Documentation','使用文档')
  const description = esc(lead.replace(/<[^>]+>/g, '').trim())
  const canonical = 'https://cc-bro.yanauto.me'
  const html = `<!doctype html>
<html lang="${langTag}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark">
<title>${esc(title)} · cc-bro</title><meta name="description" content="${description}">
<link rel="canonical" href="${canonical + route(lang, id)}"><link rel="alternate" hreflang="en" href="${canonical + route('en', id)}"><link rel="alternate" hreflang="zh-CN" href="${canonical + route('zh', id)}">
<link rel="icon" href="/assets/mark.svg"><link rel="stylesheet" href="/guide-assets/base.css"><link rel="stylesheet" href="/guide-assets/guide.css"></head>
<body><a class="skip" href="#content">${t('Skip to content','跳到正文')}</a>
<header class="mast"><div class="wrap nav"><a class="brand" href="/?lang=${lang}"><img src="/assets/mark.svg" alt="" width="27" height="27">cc-bro</a><nav class="guide-nav" aria-label="${t('Main','主导航')}">${nav('installation', t('Docs','文档'), !log)}${nav('changelog', t('Changelog','更新日志'), log)}<span class="separator"></span><a lang="${t('zh-CN','en')}" hreflang="${t('zh-CN','en')}" href="${route(other, id)}">${t('中文','EN')}</a></nav></div></header>
<div class="wrap layout"><aside class="side" aria-label="${sideTitle}"><p class="side-title">${sideTitle}</p>${toc}</aside><main id="content">
<details class="mobile-toc"><summary>${sideTitle}</summary>${toc}</details>
<p class="kicker"><span>cc-bro / v${version}</span> / ${log ? t('Release notes','版本记录') : t('Field guide','使用手册') + ' · ' + String(ids.indexOf(id)+1).padStart(2,'0') + ' / ' + ids.length}</p>
<h1>${esc(title)}</h1><div class="lead">${lead}</div>${article}${pager}</main></div>
<footer class="wrap guide-foot"><span>cc-bro / v${version}</span><a href="https://github.com/yanauto/cc-bro">GitHub ↗</a></footer></body></html>
`
  const dir = join(out, route(lang, id))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir,'index.html'), html)
}

for (const [index, lang] of ['en','zh'].entries()) {
  const files = readdirSync(join(root, lang)).sort()
  if (files.join() !== ids.map(id => id + '.md').sort().join()) throw Error('Topic list and ' + lang + ' sources differ')
  for (const [i, id] of ids.entries()) {
    const file = join(root, lang, id + '.md')
    const match = read(file).trim().match(/^# ([^\n]+)\n\n([\s\S]*?)(?:\n\n|$)([\s\S]*)$/)
    if (!match) throw Error('Expected a title and introduction in ' + file)
    const [, title, intro, rest] = match
    const toc = groups.map(([names, items]) => `<p class="section-label">${names[index]}</p><div class="toc">` + items.map(([slug, ...labels]) => `<a href="${route(lang,slug)}"${id === slug ? ' aria-current="page"' : ''}>${labels[index]}</a>`).join('') + '</div>').join('')
    const pager = [[i-1,'prev',index?'上一页':'Previous'],[i+1,'next',index?'下一页':'Next']].filter(([n]) => topics[n]).map(([n,rel,label]) => `<a rel="${rel}" href="${route(lang, ids[n])}"><small>${label}</small>${topics[n][index+1]}</a>`).join('')
    page(lang,id,title,body(intro,file),toc,`<article class="prose">${body(rest,file)}</article>`,`<nav class="pager" aria-label="${index?'相关章节':'Guide pages'}">${pager}</nav>`)
  }
  const toc = '<div class="toc">' + changes.map(({v}) => `<a href="#v${v}">v${v}</a>`).join('') + '</div>'
  const notes = changes.map(({v,parts}) => `<section class="prose release" id="v${v}"><span class="release-id">${index?'版本':'Version'}</span><h2>${v}</h2>${body(parts[index].replace(/^#### /gm,'### '), join(root,'../CHANGELOG.md'))}</section>`).join('')
  page(lang,'changelog',index?'更新日志':'Changelog',index?'按版本查看工人、工单与升级方式的变化。':'What changed for workers and tickets, and what to do when you upgrade.',toc,notes)
}
for (const file of ['base.css','guide.css','mark.svg']) {
  const dir = join(out, file.endsWith('.svg') ? 'assets' : 'guide-assets')
  mkdirSync(dir, { recursive: true })
  copyFileSync(join(root,'assets',file), join(dir,file))
}
