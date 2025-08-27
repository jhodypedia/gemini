// public/js/main.js
$(async function(){
  const keyStatus = $("#key-status");
  const fontSelect = $("#fontSelect");
  const fontNameInput = $("#fontName");
  const imagesJsonInput = $("#imagesJson");
  const audioUrlInput = $("#audioUrl");
  const progressArea = $("#progress-area");
  const resultArea = $("#result-area");
  const latestArea = $("#latest");

  // get session info
  async function me() {
    const r = await fetch("/api/me");
    return await r.json();
  }

  // init
  const m = await me();
  keyStatus.removeClass("bg-secondary").addClass(m.hasKey ? "bg-success" : "bg-danger").text(m.hasKey ? "API key OK" : "API key belum diset");

  // open websocket and say hello with sessionId
  const sessionId = m.sessionId;
  const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host.replace(/:\d+$/,'') + ":" + (location.port || 80) + (":") + (location.port || 80) );
  // NOTE: previous server's ws uses same port as http server, but our server.js attaches ws to same http server
  // proper ws URL:
  const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
  const socket = new WebSocket(wsUrl);
  socket.addEventListener("open", ()=> {
    socket.send(JSON.stringify({ type: "hello", sessionId }));
  });
  socket.addEventListener("message", (ev) => {
    try {
      const data = JSON.parse(ev.data);
      const id = data.videoId;
      // render progress widget
      let el = $(`#job-${id}`);
      if (!el.length) {
        el = $(`<div id="job-${id}" class="mb-2"><strong>${id}</strong> — <span class="small text-muted">${data.message||data.status}</span><div class="progress mt-1"><div class="progress-bar" role="progressbar" style="width:0%">0%</div></div></div>`);
        progressArea.prepend(el);
      }
      el.find(".small").text(data.message || data.status || "");
      el.find(".progress-bar").css("width", (data.progress||0) + "%").text((data.progress||0) + "%");
      if (data.status === "done" && data.output) {
        // add to results
        resultArea.prepend(`<div class="mb-2"><a href="${data.output}" target="_blank">${data.output}</a></div>`);
        loadLatest();
      }
    } catch(e){}
  });

  // load fonts list
  async function loadFonts() {
    try {
      const r = await fetch("/api/fonts");
      const j = await r.json();
      const list = (j.fonts || []);
      fontSelect.empty();
      list.forEach(f => {
        fontSelect.append(`<option value="${f}">${f}</option>`);
      });
    } catch(e){
      // fallback list
      ["Roboto","Inter","Poppins","Montserrat","Lato","Open Sans"].forEach(f=> fontSelect.append(`<option value="${f}">${f}</option>`));
    }
  }
  await loadFonts();

  // key form
  $("#form-key").on("submit", async function(e){
    e.preventDefault();
    const fd = new FormData(this);
    const r = await fetch("/api/set-key",{method:"POST",body:fd});
    const j = await r.json();
    if (j.success) {
      toastr.success("API key tersimpan");
      keyStatus.removeClass("bg-danger").addClass("bg-success").text("API key OK");
    } else toastr.error(j.message || "Gagal");
  });

  // upload form
  $("#form-upload").on("submit", async function(e){
    e.preventDefault();
    const fd = new FormData(this);
    const r = await fetch("/api/upload", { method:"POST", body:fd });
    const j = await r.json();
    if (!j.success) return toastr.error("Upload gagal");
    // set hidden fields
    imagesJsonInput.val(JSON.stringify(j.images || []));
    audioUrlInput.val(j.audio || "");
    toastr.success("Upload berhasil");
  });

  // when font select changes, set hidden input
  fontSelect.on("change", ()=> {
    $("#fontName").val(fontSelect.val());
  });
  // init hidden value
  $("#fontName").val(fontSelect.val());

  // generate form
  $("#form-generate").on("submit", async function(e){
    e.preventDefault();
    resultArea.empty();
    progressArea.empty();
    const form = this;
    const fd = new FormData(form);
    // append hidden fields (imagesJson, audioUrl, fontName already set)
    // send request
    const r = await fetch("/api/generate", { method:"POST", body:fd });
    const j = await r.json();
    if (!j.success) {
      toastr.error(j.message || "Gagal mengenerate");
      return;
    }
    toastr.info(`Job dimulai: ${j.jobIds?.length||0} job`);
    // show jobs
    (j.jobIds || []).forEach(id => {
      progressArea.prepend(`<div id="job-${id}" class="mb-2"><strong>${id}</strong> — <span class="small text-muted">queued</span><div class="progress mt-1"><div class="progress-bar" role="progressbar" style="width:0%">0%</div></div></div>`);
    });
  });

  // load latest
  async function loadLatest() {
    try {
      const r = await fetch("/api/videos");
      const j = await r.json();
      latestArea.empty();
      (j.files||[]).slice(0,8).forEach(f => {
        latestArea.append(`<video controls width="240" class="m-1"><source src="${f}" type="video/mp4"></video>`);
      });
    } catch(e){}
  }
  loadLatest();
});
