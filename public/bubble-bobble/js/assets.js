// ===== assets.js =====
// 그림(png)과 배경음악(mp3)을 미리 불러오기.
(function (BB) {
  var IMG_NAMES = [
    '주인공1', '주인공2', '주인공3', '주인공4', '주인공5',
    '적1', '적2', '적3', '적4',
    '적소멸1', '적소멸2', '적소멸3',
    '방울1', '방울2', '방울3',
    '배경', '지형', '고래'
  ];

  BB.assets = { images: {}, music: null, ready: false };

  // onProgress(0~1) 를 로딩 상황마다 호출. 완료되면 Promise resolve.
  BB.assets.load = function (onProgress) {
    var done = 0;
    var total = IMG_NAMES.length + 1; // 이미지들 + 음악
    function tick() { done++; if (onProgress) onProgress(done / total); }

    var imgPromises = IMG_NAMES.map(function (name) {
      return new Promise(function (resolve) {
        var im = new Image();
        im.onload = function () { BB.assets.images[name] = im; tick(); resolve(); };
        im.onerror = function () { console.warn('이미지 로드 실패:', name); tick(); resolve(); };
        im.src = 'assets/이미지/' + name + '.png';
      });
    });

    var musicPromise = new Promise(function (resolve) {
      var a = new Audio();
      a.loop = true;
      a.preload = 'auto';
      var settled = false;
      function ok() {
        if (settled) return;
        settled = true;
        BB.assets.music = a;
        tick();
        resolve();
      }
      a.addEventListener('canplaythrough', ok, { once: true });
      a.addEventListener('error', function () {
        if (settled) return;
        console.warn('음악 로드 실패');
        settled = true; tick(); resolve();
      });
      a.src = 'assets/음악/배경음악.mp3';
      // 혹시 canplaythrough 가 안 와도 3초 뒤엔 넘어감
      setTimeout(ok, 3000);
    });

    return Promise.all(imgPromises.concat([musicPromise])).then(function () {
      BB.assets.ready = true;
    });
  };
})(window.BB);
