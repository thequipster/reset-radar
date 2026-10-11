from pathlib import Path
import subprocess, hashlib, shutil
root=Path.cwd()
out=root/'task_logs/RR18_artifacts'
npx=shutil.which('npx.cmd')
cases=[
 ('quota-type', 'src/lib/history.ts', 'item?.resetType !== "regular"', 'item?.resetType !== "banked"', [npx,'vitest','run','src/lib/__tests__/history.freshness.test.ts']),
 ('seven-day-boundary', 'src/lib/history.ts', 'ageDays > HISTORY_STALE_DAYS', 'ageDays >= HISTORY_STALE_DAYS', [npx,'vitest','run','src/lib/__tests__/history.freshness.test.ts']),
 ('interleaved-dedupe', 'scripts/fetch-history.mjs', 'const prev = lastByType.get(item.ev.resetType);', 'const prev = kept[kept.length - 1];', ['node','--test','scripts/fetch-history.test.mjs']),
]
proof=[]
for name,file,before,after,command in cases:
 p=root/file
 original=p.read_bytes()
 text=original.decode('utf8')
 assert text.count(before)==1, (name,text.count(before))
 try:
  p.write_bytes(text.replace(before,after).encode('utf8'))
  result=subprocess.run(command,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  (out/f'mutation-{name}-red.txt').write_bytes(result.stdout)
  assert result.returncode!=0, f'mutation survived: {name}'
  proof.append(f'{name}: red exit={result.returncode}')
 finally:
  p.write_bytes(original)
  assert p.read_bytes()==original
 proof.append(f'{name}: restored SHA256={hashlib.sha256(original).hexdigest()}')
(out/'mutation-proof.txt').write_text('\n'.join(proof)+'\n',encoding='utf8')
print('\n'.join(proof))
