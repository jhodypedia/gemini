// public/js/main.js
document.addEventListener("DOMContentLoaded", ()=> {
  const formKey = document.getElementById("formKey");
  const formUpload = document.getElementById("formUpload");
  const formGenerate = document.getElementById("formGenerate");
  const uploadPreview = document.getElementById("uploadPreview");
  const imagesJsonInput = document.getElementById("imagesJson");
  const audioUrlInput = document.getElementById("audioUrl");
  const jobsDiv = document.getElementById("jobs");
  const resultsDiv = document.getElementById("results");
  const btnLatest = document.getElementById("btnLatest");

  // websocket connect
  const proto = (location.protocol === "https:") ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.addEventListener("open", ()=> {
    // tell server our sessionId
    fetch("/api/me").then(r=>r.json()).then(j=>{
      if (j.sessionId) ws.send(JSON.stringify({ type:"hello", sessionId: j.sessionId }));
    });
  });
  ws.addEventListener("message", ev=>{
    try {
      const data = JSON.parse(ev.data);
      const id = data.videoId;
      let el = document.getElementById(`job-${id}`);
      if (!el) {
        el = document.createElement("div");
        el.id = `job-${id}`;
        el.className = "job-card";
        el.innerHTML = `<div class="d-flex justify-content-between align-items-center"><strong>${id.slice(0,8)}</strong><small class="text-muted job-msg">queued</small></div>
          <div class="progress mt-2"><div class="progress-bar" style="width:0%">0%</div></div>`;
        jobsDiv.prepend(el);
      }
      el.querySelector(".job-msg").innerText = data.message || data.status || "working";
      const bar = el.querySelector(".progress-bar");
      bar.style.width = (data.progress||0) + "%";
      bar.innerText = (data.progress||0) + "%";

      if (data.status === "done" && data.output) {
        const card = document.createElement("div");
        card.className = "result-video";
        card.innerHTML = `<video controls width="100%"><source src="${data.output}" type="video/mp4"></video>`;
        resultsDiv.prepend(card);
        Swal.fire({ icon:"success", title: "Selesai", toast:true, timer:1500, position:"top-end", showConfirmButton:false });
      }
      if (data.status === "error") {
        Swal.fire({ icon:"error", title: "Error", text: data.message || "Rendering failed" });
      }
    } catch(e){}
  });

  // set key
  formKey?.addEventListener("submit", async e=>{
    e.preventDefault();
    const apiKey = e.target.apiKey.value.trim();
    if (!apiKey) return Swal.fire({ icon:"warning", title:"API Key kosong" });
    const r = await fetch("/api/set-key", { method:"POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ apiKey }) });
    const j = await r.json();
    if (j.success) Swal.fire({ icon:"success", title:"API Key tersimpan" }); else Swal.fire({ icon:"error", title:"Gagal menyimpan" });
  });

  // upload form
  formUpload?.addEventListener("submit", async e=>{
    e.preventDefault();
    const fd = new FormData(formUpload);
    const r = await fetch("/api/upload", { method:"POST", body: fd });
    const j = await r.json();
    if (!j.success) return Swal.fire({ icon:"error", title:"Upload gagal" });
    imagesJsonInput.value = JSON.stringify(j.images || []);
    audioUrlInput.value = j.audio || "";
    uploadPreview.innerHTML = "";
    (j.images || []).forEach(u=>{
      const img = document.createElement("img"); img.src = u; uploadPreview.appendChild(img);
    });
    if (j.audio) {
      const a = document.createElement("audio"); a.controls = true; a.src = j.audio; a.className="w-100 mt-2"; uploadPreview.appendChild(a);
    }
    Swal.fire({ icon:"success", title:"Upload berhasil" });
  });

  // generate form
  formGenerate?.addEventListener("submit", async e=>{
    e.preventDefault();
    const confirm = await Swal.fire({ title: "Konfirmasi", html: `Generate <b>${e.target.total.value}</b> video sekarang?`, showCancelButton:true });
    if (!confirm.isConfirmed) return;
    const fd = new FormData(formGenerate);
    fd.set("imagesJson", imagesJsonInput.value || "[]");
    fd.set("audioUrl", audioUrlInput.value || "");
    const r = await fetch("/api/generate", { method:"POST", body: fd });
    const j = await r.json();
    if (!j.success) return Swal.fire({ icon:"error", title:"Gagal memulai job", text: j.message || "" });
    Swal.fire({ icon:"info", title:"Job dimulai", text: `Membuat ${j.jobIds.length} video — cek progress.` });
    // place holder job cards
    j.jobIds.forEach(id => {
      if (!document.getElementById(`job-${id}`)) {
        const el = document.createElement("div"); el.id = `job-${id}`; el.className = "job-card";
        el.innerHTML = `<div class="d-flex justify-content-between align-items-center"><strong>${id.slice(0,8)}</strong><small class="text-muted">queued</small></div>
          <div class="progress mt-2"><div class="progress-bar" style="width:0%">0%</div></div>`;
        jobsDiv.prepend(el);
      }
    });
  });

  // load latest
  async function loadLatest(){
    try {
      const r = await fetch("/api/videos"); const j = await r.json();
      if (!j.success) return;
      resultsDiv.innerHTML = "";
      (j.files || []).slice(0,12).forEach(f => {
        const el = document.createElement("div"); el.className = "result-video";
        el.innerHTML = `<video controls width="100%"><source src="${f}" type="video/mp4"></video>`;
        resultsDiv.appendChild(el);
      });
    } catch(e){}
  }
  btnLatest?.addEventListener("click", loadLatest);
  loadLatest();
});
