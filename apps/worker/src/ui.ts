export const SOURCES_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crex Source Upload</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  h1 { font-size: 1.4rem; }
  label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
  input[type=text], input[type=file] { width: 100%; padding: .5rem; box-sizing: border-box; }
  button { margin-top: 1rem; padding: .6rem 1.2rem; font-size: 1rem; }
  .bar { height: 1.1rem; background: #e2e2e2; border-radius: 6px; margin-top: .5rem; overflow: hidden; display: none; }
  .bar > div { height: 100%; width: 0%; background: #2f7cf6; transition: width .1s; }
  #status { margin-top: 1rem; white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: .9rem; }
  .err { color: #c0392b; font-weight: 600; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .25rem 1rem; }
  dt { font-weight: 600; }
  #list { margin-top: 1.5rem; }
</style>
</head>
<body>
<h1>Crex Source Upload</h1>
<label for="projectId">Project ID (UUID)</label>
<input id="projectId" type="text" placeholder="11111111-1111-4111-8111-111111111111" autocomplete="off">
<label for="file">Source file</label>
<input id="file" type="file">
<button id="upload" type="button">Upload</button>
<div class="bar" id="bar"><div id="barFill"></div></div>
<div id="status"></div>
<hr>
<section id="list"><h2>Sources</h2><button id="refresh" type="button">Refresh</button><div id="listBody"></div></section>

<script>
(function () {
  var projectInput = document.getElementById("projectId");
  var fileInput = document.getElementById("file");
  var uploadBtn = document.getElementById("upload");
  var bar = document.getElementById("bar");
  var barFill = document.getElementById("barFill");
  var statusEl = document.getElementById("status");
  var listBody = document.getElementById("listBody");

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle("err", !!isError);
  }

  function renderDetails(source) {
    var parts = [];
    parts.push("status: " + (source.status || "?"));
    parts.push("container: " + ((source.media && source.media.container) || "n/a"));
    if (source.media && source.media.video) {
      parts.push("video: " + source.media.video.codec + " " + source.media.video.width + "x" + source.media.video.height);
    } else {
      parts.push("video: n/a");
    }
    parts.push("audio: " + ((source.media && source.media.audio && source.media.audio.codec) || "n/a"));
    parts.push("durationSeconds: " + (source.durationSeconds != null ? source.durationSeconds : "n/a"));
    parts.push("sizeBytes: " + (source.sizeBytes != null ? source.sizeBytes : "n/a"));
    parts.push("checksum: " + (source.checksum || "n/a"));
    if (source.status === "INVALID" && source.error) {
      parts.push("reason: " + source.error);
    }
    return parts.join("\\n");
  }

  function renderList(sources) {
    if (!sources || sources.length === 0) {
      listBody.textContent = "No sources for this project.";
      return;
    }
    var html = "";
    sources.forEach(function (s) {
      html += "<h3>" + (s.fileName || s.uploadId) + "</h3><dl>" +
        "<dt>status</dt><dd>" + (s.status || "") + "</dd>" +
        "<dt>container</dt><dd>" + ((s.media && s.media.container) || "") + "</dd>" +
        "<dt>video</dt><dd>" + (s.media && s.media.video ? s.media.video.codec + " " + s.media.video.width + "x" + s.media.video.height : "") + "</dd>" +
        "<dt>audio</dt><dd>" + ((s.media && s.media.audio && s.media.audio.codec) || "") + "</dd>" +
        "<dt>durationSeconds</dt><dd>" + (s.durationSeconds != null ? s.durationSeconds : "") + "</dd>" +
        "</dl>";
    });
    listBody.innerHTML = html;
  }

  function poll(uploadId) {
    var timer = setInterval(function () {
      fetch("/sources/" + uploadId)
        .then(function (r) { return r.json(); })
        .then(function (body) {
          if (body.error) {
            clearInterval(timer);
            setStatus("Error: " + body.error.code + " - " + body.error.message, true);
            return;
          }
          setStatus("status: " + body.status + "\\n" + renderDetails(body));
          if (["VALID", "INVALID", "READY", "FAILED"].indexOf(body.status) !== -1) {
            clearInterval(timer);
            refreshList();
          }
        })
        .catch(function (err) {
          clearInterval(timer);
          setStatus("Poll error: " + err.message, true);
        });
    }, 800);
  }

  function refreshList() {
    var projectId = projectInput.value.trim();
    if (!projectId) return;
    fetch("/sources?projectId=" + encodeURIComponent(projectId))
      .then(function (r) { return r.json(); })
      .then(function (body) {
        renderList(body.sources || []);
      })
      .catch(function () {});
  }

  uploadBtn.addEventListener("click", function () {
    var projectId = projectInput.value.trim();
    var file = fileInput.files && fileInput.files[0];
    if (!projectId) { setStatus("Enter a project ID.", true); return; }
    if (!file) { setStatus("Choose a file.", true); return; }

    setStatus("Creating upload session...");
    bar.style.display = "block";
    barFill.style.width = "0%";

    fetch("/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: projectId, fileName: file.name, fileType: file.type || "application/octet-stream" })
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (b) { throw new Error(b.error.code + " - " + b.error.message); });
        return r.json();
      })
      .then(function (created) {
        var uploadId = created.uploadId;
        setStatus("Uploading " + file.name + "...");
        var xhr = new XMLHttpRequest();
        xhr.open("PUT", "/sources/" + encodeURIComponent(uploadId) + "/blob");
        xhr.setRequestHeader("content-type", created.fileType || "application/octet-stream");
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable) {
            var pct = Math.round((e.loaded / e.total) * 100);
            barFill.style.width = pct + "%";
            setStatus("Uploading " + pct + "%");
          }
        };
        xhr.onload = function () {
          poll(uploadId);
        };
        xhr.onerror = function () {
          setStatus("Upload failed (network).", true);
        };
        xhr.send(file);
      })
      .catch(function (err) {
        setStatus(err.message, true);
      });
  });

  document.getElementById("refresh").addEventListener("click", refreshList);
})();
</script>
</body>
</html>
`;
