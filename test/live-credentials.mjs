import { execFile } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { personalPi } from '../lib/paths.mjs'
import { platform } from '../lib/platform/index.mjs'

export async function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY
  const [exe,...args] = platform.piCommand(['auth','check','--no-refresh','--json','--credentials','--provider','deepseek'],'readonly')
  let info
  try {
    const result = await promisify(execFile)(exe,args,{env:{...process.env,PI_OFFLINE:'1',PI_CODING_AGENT_DIR:join(personalPi,'agent')}})
    info = JSON.parse(result.stdout)
  } catch { throw new Error('Supply a DeepSeek API key to the live test.') }
  if (info.authType !== 'api_key' || typeof info.credentials !== 'string' || !info.credentials) throw new Error('No DeepSeek API key is available for the live test.')
  return info.credentials
}

export async function seedDeepSeek(t,h) {
  const url = await h.cli('ui','--no-open')
  const key = await deepseekKey()
  t.after(() => {
    for (const file of ['login/auth.json','login/models.json','backups/pi']) rmSync(join(h.data,file),{recursive:true,force:true})
  })
  const response = await fetch(url+'/api/pi/providers/deepseek/key',{method:'POST',headers:{Origin:url},body:JSON.stringify({key})})
  if (!response.ok) throw new Error('The sandbox did not recognize the live DeepSeek credential.')
  return {url,key}
}
