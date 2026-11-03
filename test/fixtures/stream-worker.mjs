import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const args = process.argv.slice(2), cli = basename(process.argv[1])
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : args.find(s => s.startsWith(flag + '='))?.slice(flag.length + 1) ?? null
const emit = e => console.log(JSON.stringify(e))
if (args.includes('--version')) { console.log('fixture 1.0'); process.exit() }
if (args.includes('status')) { console.log(existsSync('fixture-signed-out') ? 'Not logged in' : 'Logged in'); process.exit() }
if (args.includes('models') || args.includes('--list-models')) {
  console.log(cli === 'agy' ? 'fixture-model\tFixture model' : 'fixture-model - Fixture model (default)')
  process.exit()
}
if (args.includes('/effort')) { emit({command:{data:{current:'low',available:['low','high']}}}); process.exit() }
if (args.includes('/model')) { emit({command:{data:{id:'fixture-model'}}}); process.exit() }
if (cli === 'agy' && !args.some(s => s.startsWith('--print='))) { console.error('agy requires an attached print prompt'); process.exit(2) }
const id = value('--conversation') || value('--resume') || randomUUID()
mkdirSync('fixture-sessions', {recursive:true})
const file = join('fixture-sessions',id)
const prompt = value('--prompt') ?? (cli === 'agy' ? value('--print') : args.at(-1))
appendFileSync('worker-args', JSON.stringify(args)+'\n')
let reply = prompt
const code = /Remember the exact code ([a-f0-9-]+)/.exec(prompt)?.[1]
if (code) { writeFileSync(file,code); reply='ACK' }
if (prompt.startsWith('remember ')) { writeFileSync(file,prompt.slice(9)); reply='ACK' }
if (prompt === 'recall' || prompt.includes('from my previous message')) reply = readFileSync(file,'utf8')
if (cli === 'agy') emit({event:'init',conversation_id:id})
else if (cli === 'cursor-agent') emit({type:'system',subtype:'init',session_id:id})
if (prompt === 'hold') while (!existsSync('release-stream')) await sleep(30)
if (prompt === 'write fixture') writeFileSync('stream-proof.txt','proof')
if (prompt === 'crash') process.exit(2)
if (cli === 'agy') {
  emit({event:'step_update',step_update:{step_index:1,step_type:'agent_response',state:'DONE',usage:{input_tokens:100,cache_read_tokens:80}}})
  emit({event:'result',result:{conversation_id:id,status:'SUCCESS',response:reply}})
} else if (cli === 'cursor-agent') {
  emit({type:'tool_call',subtype:'completed',session_id:id})
  emit({type:'result',subtype:'success',session_id:id,is_error:false,result:reply})
} else emit({id:args.includes('--wrong-id') ? randomUUID() : id,reply})
