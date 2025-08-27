// utils/queue.js
const PENDING = [];
let concurrency = 2;
let running = 0;

function setConcurrency(n){ concurrency = Math.max(1, n); }

async function workerLoop(){
  if (running >= concurrency) return;
  const job = PENDING.shift();
  if (!job) return;
  running++;
  try {
    await job.run();
    if (job.onComplete) job.onComplete();
  } catch (err) {
    if (job.onError) job.onError(err);
  } finally {
    running--;
    setImmediate(workerLoop);
  }
}

function addJob(job){
  PENDING.push(job);
  setImmediate(workerLoop);
  return job.id;
}

function pendingCount(){ return PENDING.length; }

module.exports = { addJob, setConcurrency, pendingCount };
