/**
 * Swagger 调试：把登录写入的 ACCESS_TOKEN Cookie 自动塞进 Authorization。
 * （部分 Swagger 版本调 SSE 时既不带 Cookie 也不带 Authorize 头，会导致 401）
 */
(function () {
  var COOKIE_NAME = "ACCESS_TOKEN";

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  var originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    var headers = new Headers(init.headers || {});
    if (!headers.has("Authorization")) {
      var token = readCookie(COOKIE_NAME);
      if (token) {
        headers.set("Authorization", "Bearer " + token);
      }
    }
    init.headers = headers;
    if (!init.credentials) {
      init.credentials = "include";
    }
    return originalFetch(input, init);
  };
})();
