// 以完全脱离当前会话的方式启动 dev 服务,使其在回合/会话结束后仍存活。
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');

function portInUse(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: '127.0.0.1' }, () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    setTimeout(() => {
      s.destroy();
      resolve(false);
    }, 1000);
  });
}

(async () => {
  if (await portInUse(3000)) {
    console.log('3000 已在监听,无需重启');
    process.exit(0);
  }
  const out = fs.openSync('/tmp/dev.log', 'a');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: '/home/claudeuser/seedance-reverse',
    detached: true, // 新会话/进程组 —— 脱离父 shell,不随其被回收
    stdio: ['ignore', out, out],
    env: process.env,
  });
  child.unref();
  console.log('detached dev pid', child.pid);
  process.exit(0);
})();
