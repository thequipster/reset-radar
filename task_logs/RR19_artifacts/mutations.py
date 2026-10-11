from pathlib import Path
import subprocess,sys,hashlib
root=Path.cwd();out=root/'task_logs/RR19_artifacts'
cases=[
 ('ci-step', '.github/workflows/ci.yml', '      - name: Script tests (node:test)\n        run: npm run test:node\n', '', [sys.executable,'scripts/check-ci.py']),
 ('release-soft-fail', '.github/workflows/release.yml', '      - name: Script tests (node:test)\n        run: npm run test:node\n', '      - name: Script tests (node:test)\n        continue-on-error: true\n        run: npm run test:node\n', [sys.executable,'scripts/check-release-wf.py']),
 ('nested-discovery', 'scripts/run-node-tests.mjs', " || entry.name.endsWith('.node.mjs')", '', ['node','--test','scripts/run-node-tests.test.mjs']),
 ('failure-propagation', 'scripts/run-node-tests.mjs', 'return Number.isInteger(result.status) ? result.status : 1;', 'return 0;', ['node','--test','scripts/run-node-tests.test.mjs']),
]
proof=[]
for name,file,a,b,cmd in cases:
 p=root/file; original=p.read_bytes();text=original.decode('utf8').replace('\r\n','\n');assert text.count(a)==1
 try:
  p.write_text(text.replace(a,b),encoding='utf8')
  result=subprocess.run(cmd,cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
  (out/f'mutation-{name}-red.txt').write_bytes(result.stdout)
  assert result.returncode!=0, name+' survived'
  proof.append(f'{name}: red exit={result.returncode}')
 finally:
  p.write_bytes(original);assert p.read_bytes()==original
 proof.append(f'{name}: restored SHA256={hashlib.sha256(original).hexdigest()}')
(out/'mutation-proof.txt').write_text('\n'.join(proof)+'\n',encoding='utf8')
print('\n'.join(proof))
