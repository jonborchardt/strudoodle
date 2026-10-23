// usage: node portscan.mjs <host> <from> <to>  -> prints open TCP ports
import net from 'node:net';
const [host, from, to] = [process.argv[2], +process.argv[3], +process.argv[4]];
const open = [];
let port = from, active = 0;
const next = () => new Promise((done) => {
  const tick = () => {
    while (active < 400 && port <= to) {
      const p = port++; active++;
      const s = net.connect({ host, port: p });
      s.setTimeout(700);
      s.on('connect', () => { open.push(p); s.destroy(); });
      s.on('timeout', () => s.destroy());
      s.on('error', () => {});
      s.on('close', () => { active--; port > to && active === 0 ? done() : tick(); });
    }
  };
  tick();
});
await next();
console.log(host, open.length ? open.join(' ') : 'none');
