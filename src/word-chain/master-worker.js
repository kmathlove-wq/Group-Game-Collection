// 🏆 고수 컴퓨터 일꾼: master.js가 보낸 { id, op, args }를 두뇌(master-engine.js)에 시키고 { id, result | error }로 답한다.
const { parentPort, workerData } = require('worker_threads');
const { createMasterEngine } = require('./master-engine');

const engine = createMasterEngine(workerData.words);
const ops = {
  size: () => engine.size,
  add: (word) => engine.add(word),
  remove: (word) => engine.remove(word),
  pick: (lastWord, used, thinkMs) => engine.pick(lastWord, used, thinkMs),
  opener: (used, thinkMs) => engine.opener(used, thinkMs)
};
parentPort.on('message', ({ id, op, args }) => {
  try { parentPort.postMessage({ id, result: ops[op](...args) }); }
  catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
