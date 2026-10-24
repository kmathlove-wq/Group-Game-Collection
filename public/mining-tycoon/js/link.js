// ===== link.js =====
// 📱 다른 기기 연동: 서버(/api/mining-tycoon/link/*)와 주고받는 일만 한다. 화면은 main.js가 그린다.
// 이 기기의 연동 정보는 localStorage `mining-tycoon:link` = { worldId, key(이 기기 열쇠), rev(마지막으로 맞춘 판 번호), dirty }.
// 결과는 { ok } · { gone: 'reset'|'destroyed'|'unlinked'|'expired' } · { taken, summary } · { error } 중 하나로 돌려준다.
(function (MT) {
  var LINK_KEY = 'mining-tycoon:link';
  var API = '/api/mining-tycoon/link/';
  var Save = MT.Save;

  function read() {
    try {
      var d = JSON.parse(localStorage.getItem(LINK_KEY));
      return d && typeof d.worldId === 'string' && typeof d.key === 'string' ? d : null;
    } catch (e) { return null; }
  }
  function write(d) { try { if (d) localStorage.setItem(LINK_KEY, JSON.stringify(d)); else localStorage.removeItem(LINK_KEY); } catch (e) {} }

  var link = read();
  var changes = 0; // 마지막으로 올린 뒤 저장한 횟수(올리는 동안 또 저장하면 dirty를 남겨 둔다)

  // 저장 글자를 줄여서 보낸다(약 12만 자 → 약 1.4만 자). 브라우저가 압축을 못 하면 그대로 보낸다.
  function pack(text) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve({ save: text });
    var stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (buffer) {
      var bytes = new Uint8Array(buffer), parts = [];
      for (var i = 0; i < bytes.length; i += 8192) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
      return { save: btoa(parts.join('')), z: 'deflate-raw' };
    }).catch(function () { return { save: text }; });
  }

  // 서버에 묻는다. 인터넷이 안 되면 { error, offline: true }.
  function post(route, body, options) {
    return fetch(API + route, Object.assign({ method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }, options || {}))
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (response.status === 410) return { gone: data.gone || 'expired' };
          if (response.status === 409 && data.taken) return { taken: true, summary: data.summary, rev: data.rev };
          if (!response.ok) return { error: data.error || '잠시 문제가 생겼어요. 다시 해 주세요.' };
          data.ok = true;
          return data;
        });
      })
      .catch(function () { return { error: '인터넷 연결을 확인해 주세요.', offline: true }; });
  }

  function withLink(route, extra) {
    if (!link) return Promise.resolve({ error: '연동되어 있지 않아요.' });
    return post(route, Object.assign({ worldId: link.worldId, key: link.key }, extra || {}));
  }

  // 사라진 월드: 연동 정보를 지운다(저장을 지울지는 main.js가 이유를 보고 정한다).
  function forget(result) { if (result.gone) Link.clear(); return result; }

  var Link = {
    get: function () { return link; },
    clear: function () { link = null; write(null); },
    dirty: function () { return !!(link && link.dirty); },
    // 이 기기에서 저장할 때마다 부른다. 다음 올리기 때 서버로 간다.
    markDirty: function () {
      if (!link) return;
      changes++;
      if (!link.dirty) { link.dirty = true; write(link); }
    },

    // 📱 연동 시작: 지금 월드를 올리고 이 기기를 연동한다.
    create: function (state, password) {
      return pack(Save.serialize(state)).then(function (packed) {
        return post('create', Object.assign({ password: password }, packed));
      }).then(function (result) {
        if (result.ok) { link = { worldId: result.worldId, key: result.key, rev: result.rev, dirty: false }; changes = 0; write(link); }
        return result;
      });
    },

    // 시작 화면: 같은 닉네임으로 연동된 월드 목록(이 기기가 이미 연동한 월드는 뺀다).
    list: function (name) {
      return fetch(API + 'worlds?name=' + encodeURIComponent(name))
        .then(function (response) { return response.json(); })
        .then(function (data) { return (data.worlds || []).filter(function (w) { return !link || w.id !== link.worldId; }); })
        .catch(function () { return []; });
    },

    // 다른 기기에서 하기: 비밀번호가 맞으면 { ok, state }.
    join: function (worldId, password) {
      return post('join', { worldId: worldId, password: password }).then(function (result) {
        if (!result.ok) return result;
        var state;
        try { state = Save.deserialize(result.save); } catch (e) { return { error: '받아 온 월드가 망가졌어요.' }; }
        link = { worldId: worldId, key: result.key, rev: result.rev, dirty: false };
        changes = 0;
        write(link);
        return { ok: true, state: state };
      });
    },

    // 게임을 켤 때: 이 기기가 지금 하는 기기가 된다. 서버 것이 더 새것이면 { ok, state(서버 것), summary }.
    open: function () {
      return withLink('open', { rev: link && link.rev }).then(function (result) {
        if (!result.ok) return forget(result);
        var out = { ok: true, rev: result.rev, devices: result.devices, summary: result.summary };
        if (result.save) {
          try { out.state = Save.deserialize(result.save); } catch (e) { return { error: '받아 온 월드가 망가졌어요.' }; }
        }
        return out;
      });
    },

    // 서버 것으로 바꿔 끼운 뒤 부른다.
    adopt: function (rev) { if (link) { link.rev = rev; link.dirty = false; changes = 0; write(link); } },

    // 올리기. force면 다른 기기가 열었어도 이 기기 것으로 덮는다("이 기기 것으로 계속").
    sync: function (state, force, keepalive) {
      if (!link) return Promise.resolve({ error: '연동되어 있지 않아요.' });
      var mine = link, seen = changes;
      return pack(Save.serialize(state)).then(function (packed) {
        var body = Object.assign({ worldId: mine.worldId, key: mine.key, rev: mine.rev, force: !!force }, packed);
        return post('sync', body, keepalive && packed.z ? { keepalive: true } : null);
      }).then(function (result) {
        if (link !== mine) return { error: 'changed' }; // 그새 연동이 바뀜
        if (result.ok) {
          link.rev = result.rev;
          if (changes === seen) link.dirty = false;
          write(link);
        }
        return forget(result);
      });
    },

    info: function () { return withLink('info').then(forget); },
    setPassword: function (password) { return withLink('password', { password: password }).then(forget); },
    // 처음부터 다시('reset')·지구 파괴('destroyed'): 연동된 모든 기기에서 끝난다.
    end: function (reason) {
      return withLink('end', { reason: reason }).then(function (result) {
        if (result.ok || result.gone) Link.clear();
        return result;
      });
    },
    // ✂️ 연동 끊기: 이 기기만 월드를 갖고 혼자 하는 월드가 된다.
    unlink: function () {
      return withLink('unlink').then(function (result) {
        if (result.ok || result.gone) Link.clear();
        return result;
      });
    }
  };

  MT.Link = Link;
})(window.MT = window.MT || {});
