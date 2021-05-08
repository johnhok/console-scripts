(function restoreConsole() {
  var iframe = document.createElement("iframe");
  iframe.style.display = "none";
  document.body.appendChild(iframe);
  console = iframe.contentWindow.console;
  window.console = console;
})();

await (async function bootstrap() {
  const restoreConsole = () => {
    var iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    console = iframe.contentWindow.console;
    window.console = console;
  };
  const loadSystemJS = async () =>
    new Promise((resolve) =>
      (function (d, script) {
        define = null;
        script = d.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.onload = function () {
          resolve();
        };
        script.src =
          "https://cdn.jsdelivr.net/npm/systemjs@6.8.3/dist/system.min.js";
        d.getElementsByTagName("head")[0].appendChild(script);
      })(document)
    );
  await restoreConsole();
  await loadSystemJS();
})();
