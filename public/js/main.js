// public/js/main.js
$(function(){
  // connect websocket
  const proto = (location.protocol === "https:") ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}`);
  ws.addEventListener("open", ()=> {
    // send hello with sessionId (read from meta or fetch)
    fetch('/auth/session').then(r=>r.json()).then(j=>{
      if (j.sessionId) ws.send(JSON.stringify({ type:'hello', sessionId: j.sessionId }));
    });
  });
  ws.addEventListener("message", ev => {
    try {
      const data = JSON.parse(ev.data);
      // update job card
      const id = data.jobId;
      let card = $(`#job-${id}`);
      if (!card.length) {
        card = $(`<div id="job-${id}" class="job-card"><strong>${id.slice(0,8)}</strong><div class="progress mt-2"><div class="progress-bar" style="width:0%">0%</div></div><div class="job-msg text-muted small"></div></div>`);
        $('#jobs').prepend(card);
      }
      card.find('.job-msg').text(data.status + (data.message ? ' — '+data.message : ''));
      card.find('.progress-bar').css('width', (data.progress||0)+'%').text((data.progress||0)+'%');
      if (data.status === 'done') {
        Swal.fire({ icon:'success', title:'Video ready', toast:true, position:'top-end', timer:1500, showConfirmButton:false });
      } else if (data.status === 'error') {
        Swal.fire({ icon:'error', title:'Error', text: data.message || 'Rendering failed' });
      }
    } catch(e){}
  });

  // generate form submit show loading
  $('#generateForm').on('submit', function(e){
    e.preventDefault();
    const $form = $(this);
    const fd = new FormData(this);
    Swal.fire({ title:'Starting job...', allowOutsideClick:false, didOpen: ()=> Swal.showLoading() });
    fetch($form.attr('action'), { method:'POST', body: fd })
      .then(r=>r.text()).then(html => {
        // server responds with submitted page; navigate back
        Swal.close();
        Swal.fire({ icon:'success', title:'Job submitted', timer:1200, showConfirmButton:false });
        // reload page to show job
        setTimeout(()=> location.reload(), 900);
      }).catch(err=>{
        Swal.close();
        Swal.fire({ icon:'error', title:'Error', text: err.message || 'Server error' });
      });
  });
});
